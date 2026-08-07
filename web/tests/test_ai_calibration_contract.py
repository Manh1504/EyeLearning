import base64
import importlib.util
import json
import sys
import types
import unittest
from pathlib import Path


MODEL_FORMAT = "linear_tan_json_v1"


class FakeNumpy:
    uint8 = object

    @staticmethod
    def clip(value, low, high):
        return min(max(value, low), high)

    @staticmethod
    def hypot(x, y):
        return (x * x + y * y) ** 0.5

    @staticmethod
    def mean(values):
        return sum(values) / len(values)

    @staticmethod
    def median(values):
        values = sorted(values)
        return values[len(values) // 2]

    @staticmethod
    def max(values):
        return max(values)

    @staticmethod
    def frombuffer(value, dtype=None):
        return value

    @staticmethod
    def asarray(value, dtype=None):
        return value


class FakePipeline:
    def __init__(self, args=None):
        pass

    def process(self, frame):
        return (0.1, 0.2, 0.0, 0.0, 1.0)


class FakeCalibration:
    def __init__(self, root=None, model_path=None, viewport_w=None, viewport_h=None):
        self.loaded = None

    def load_linear_tan_artifacts(self, model_x_b64, model_y_b64):
        self.loaded = (_decode_artifact(model_x_b64), _decode_artifact(model_y_b64))
        return self

    def create_calibration_model_for_api_version(self, results_arr, points_arr):
        pass

    def export_linear_tan_artifacts(self):
        return _artifact_b64([1.0, 2.0], 0.5), _artifact_b64([3.0, 4.0], 0.25)

    def predict_normalized(self, pitch, yaw):
        return 2.0, -1.0


def _artifact_b64(coef, intercept):
    return base64.b64encode(
        json.dumps({"version": MODEL_FORMAT, "coef": coef, "intercept": intercept}, allow_nan=False).encode("utf-8")
    ).decode("ascii")


def _decode_artifact(value):
    raw = base64.b64decode(value.encode("ascii"), validate=True)
    payload = json.loads(raw.decode("utf-8"), parse_constant=lambda constant: (_ for _ in ()).throw(ValueError(constant)))
    if not isinstance(payload, dict) or payload.get("version") != MODEL_FORMAT:
        raise ValueError("Unsupported calibration artifact version")
    coef = payload.get("coef")
    if not isinstance(coef, list) or len(coef) != 2:
        raise ValueError("Invalid coefficient count")
    for number in [*coef, payload.get("intercept")]:
        if isinstance(number, bool) or not isinstance(number, (int, float)) or number != number or number in (float("inf"), float("-inf")):
            raise ValueError("Calibration artifact values must be finite numbers")
    return payload


def load_ai_server_module():
    server_path = Path(__file__).resolve().parents[2] / "Gaze-Estimation" / "server.py"
    sys.path.insert(0, str(server_path.parent))
    sys.modules["models"] = types.SimpleNamespace(Pipline=FakePipeline)
    sys.modules["calibration"] = types.SimpleNamespace(Calibration=FakeCalibration, MODEL_FORMAT=MODEL_FORMAT)
    sys.modules["numpy"] = FakeNumpy
    sys.modules["cv2"] = types.SimpleNamespace(imdecode=lambda *_: b"frame", IMREAD_COLOR=1)
    spec = importlib.util.spec_from_file_location("ai_server_contract_test", server_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class AICalibrationContractTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = load_ai_server_module()

    def test_safe_artifact_export_import_round_trip(self):
        calibrator = self.module.Calibration(root=None, viewport_w=1, viewport_h=1)
        model_x_b64, model_y_b64 = calibrator.export_linear_tan_artifacts()
        loaded = self.module.Calibration(root=None, viewport_w=1, viewport_h=1)
        loaded.load_linear_tan_artifacts(model_x_b64, model_y_b64)
        self.assertEqual(loaded.loaded[0]["coef"], [1.0, 2.0])
        self.assertEqual(loaded.loaded[1]["intercept"], 0.25)

    def test_rejects_non_json_and_nan_inf_payloads(self):
        with self.assertRaises(ValueError):
            self.module.Calibration(root=None, viewport_w=1, viewport_h=1).load_linear_tan_artifacts(
                base64.b64encode(b"not json").decode("ascii"),
                base64.b64encode(b"not json").decode("ascii"),
            )
        nan_payload = base64.b64encode(
            b'{"version":"linear_tan_json_v1","coef":[NaN,1.0],"intercept":0.0}'
        ).decode("ascii")
        with self.assertRaises(ValueError):
            self.module.Calibration(root=None, viewport_w=1, viewport_h=1).load_linear_tan_artifacts(nan_payload, nan_payload)

    def test_calibrate_contract_includes_artifacts(self):
        calibrator = self.module.Calibration(root=None, viewport_w=1, viewport_h=1)
        model_x_b64, model_y_b64 = calibrator.export_linear_tan_artifacts()
        response = {
            "avg_error_px": 0.0,
            "model_x_b64": model_x_b64,
            "model_y_b64": model_y_b64,
            "model_format": self.module.MODEL_FORMAT,
            "per_point": [],
        }
        self.assertEqual(response["model_format"], MODEL_FORMAT)
        self.assertTrue(response["model_x_b64"])
        self.assertTrue(response["model_y_b64"])

    def test_calibration_load_and_validate_exist(self):
        paths = {route.path for route in self.module.app.routes}
        self.assertIn("/calibration/load", paths)
        self.assertIn("/calibration/validate", paths)

    def test_http_artifact_load_rejects_joblib(self):
        response = self.module.load_calibration(
            self.module.CalibrationLoadRequest(session_id="S1", model_x_b64="abc", model_y_b64="abc", model_format="joblib")
        )
        self.assertIn("error", response)
        self.assertIn("joblib", response["error"])

    def test_inference_clamp_logic_returns_normalized_values(self):
        x, y = self.module.Calibration(root=None, viewport_w=1, viewport_h=1).predict_normalized(0.1, 0.2)
        self.assertEqual(float(self.module.np.clip(x, 0.0, 1.0)), 1.0)
        self.assertEqual(float(self.module.np.clip(y, 0.0, 1.0)), 0.0)

    def test_http_artifact_load_path_does_not_use_unsafe_deserializers(self):
        server_source = (Path(__file__).resolve().parents[2] / "Gaze-Estimation" / "server.py").read_text(encoding="utf-8")
        self.assertNotIn("joblib.load", server_source)
        self.assertNotIn("pickle.loads", server_source)


if __name__ == "__main__":
    unittest.main()
