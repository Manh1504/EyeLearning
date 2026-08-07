import numpy as np
import time
import base64
import json
from sklearn.svm import SVR
from sklearn.multioutput import MultiOutputRegressor
from sklearn.linear_model import LinearRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import FunctionTransformer
from utils import get_screen_size, create_points
from xgboost import XGBRegressor
import tkinter as tk
import pickle
import ubjson
from utils import FreshFrameReader

MODEL_FORMAT = "linear_tan_json_v1"
MAX_ARTIFACT_B64_BYTES = 16 * 1024
EXPECTED_COEF_COUNT = 2


def _tan_features(X):
    X = np.asarray(X, dtype=float)
    return np.column_stack([np.tan(X[:, 1]), np.tan(X[:, 0])])


def _finite_float(value, field):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{field} must be a number")
    value = float(value)
    if not np.isfinite(value):
        raise ValueError(f"{field} must be finite")
    return value


def _artifact_from_estimator(estimator):
    coef = [_finite_float(v, "coef") for v in np.asarray(estimator.coef_, dtype=float).ravel().tolist()]
    intercept = _finite_float(estimator.intercept_, "intercept")
    return {"version": MODEL_FORMAT, "coef": coef, "intercept": intercept}


def _artifact_to_b64(artifact):
    raw = json.dumps(artifact, separators=(",", ":"), sort_keys=True, allow_nan=False).encode("utf-8")
    if len(raw) > MAX_ARTIFACT_B64_BYTES:
        raise ValueError("Calibration artifact too large")
    return base64.b64encode(raw).decode("ascii")


def decode_linear_tan_artifact(value):
    if not isinstance(value, str) or not value:
        raise ValueError("Calibration artifact must be a non-empty base64 string")
    if len(value.encode("ascii", errors="ignore")) > MAX_ARTIFACT_B64_BYTES:
        raise ValueError("Calibration artifact too large")
    try:
        raw = base64.b64decode(value.encode("ascii"), validate=True)
    except Exception as exc:
        raise ValueError("Calibration artifact is not valid base64") from exc
    if len(raw) > MAX_ARTIFACT_B64_BYTES:
        raise ValueError("Calibration artifact too large")
    try:
        payload = json.loads(raw.decode("utf-8"), parse_constant=lambda constant: (_ for _ in ()).throw(ValueError(f"Invalid number {constant}")))
    except (UnicodeDecodeError, json.JSONDecodeError, ValueError) as exc:
        raise ValueError("Calibration artifact must be valid JSON") from exc
    if not isinstance(payload, dict):
        raise ValueError("Calibration artifact must be a JSON object")
    if set(payload.keys()) != {"version", "coef", "intercept"}:
        raise ValueError("Calibration artifact must contain only version, coef and intercept")
    if payload.get("version") != MODEL_FORMAT:
        raise ValueError(f"Unsupported calibration artifact version: {payload.get('version')!r}")
    coef = payload.get("coef")
    if not isinstance(coef, list) or len(coef) != EXPECTED_COEF_COUNT:
        raise ValueError(f"Calibration artifact coef must contain {EXPECTED_COEF_COUNT} numbers")
    return {
        "coef": [_finite_float(value, f"coef[{idx}]") for idx, value in enumerate(coef)],
        "intercept": _finite_float(payload.get("intercept"), "intercept"),
    }

class Calibration:
    def __init__(self, root=None, model_path="weights/calibrator.ubj",
                 new_calibration=True, model_name="linear_tan",
                 viewport_w=None, viewport_h=None):
        self.results = []
        self.model_path = model_path
        self.new_calibration = new_calibration
        self.root = root
        self.model_name = model_name

        if root is not None:
            self.w, self.h = get_screen_size(root)
        else:
            self.w = viewport_w
            self.h = viewport_h

        self.points = create_points(self.w, self.h)

        self.model = make_pipeline(
            FunctionTransformer(_tan_features, validate=False),
            MultiOutputRegressor(LinearRegression())
        )

    def collect_calibration_data(self, pipline, delay=1):
        if self.new_calibration:
            # Khởi tạo GUI
            self.root.attributes('-fullscreen', True)
            self.root.configure(bg='black')

            canvas = tk.Canvas(self.root, width=self.w, height=self.h, bg='black', highlightthickness=0)
            canvas.pack()

            cap = FreshFrameReader(0)
            # Hiển thị lần lượt từng điểm
            for x, y in self.points:
                # Vẽ điểm màu đỏ, bán kính 10px
                dot = canvas.create_oval(x-10, y-10, x+10, y+10, fill='red', outline='red')
                self.root.update()

                time.sleep(delay)

                _, frame = cap.read()
                pitch, yaw, tx, ty, depth = pipline(frame)
                self.results.append([pitch, yaw, x / self.w, y / self.h])

                canvas.delete(dot)
            canvas.destroy()
            cap.release()

    def creat_calibration_model(self):
        self.results = np.array(self.results)

        if self.model_name in ("svr", "linear_tan"):
            if self.new_calibration:
                X = self.results[:, :-2] # Bỏ 2 cột cuối
                y = self.results[:, -2:] # Lấy 2 cột cuối là x, y
                self.model.fit(X, y)
                model_bytes = pickle.dumps(self.model)
                with open(self.model_path, "wb") as f:
                    ubjson.dump({"py_pickle": model_bytes}, f)
            else:
                with open(self.model_path, "rb") as f:
                    data = ubjson.load(f)
                self.model = pickle.loads(data["py_pickle"])

    def create_calibration_model_for_api_version(self, results_arr, points_arr):
        self.results = np.hstack([results_arr, points_arr])
        X = self.results[:, :-2]
        y = self.results[:, -2:]
        self.model.fit(X, y)

    def export_linear_tan_artifacts(self):
        regressor = self.model.named_steps["multioutputregressor"]
        if not hasattr(regressor, "estimators_") or len(regressor.estimators_) != 2:
            raise ValueError("Calibration model is not fitted")
        return (
            _artifact_to_b64(_artifact_from_estimator(regressor.estimators_[0])),
            _artifact_to_b64(_artifact_from_estimator(regressor.estimators_[1])),
        )

    def load_linear_tan_artifacts(self, model_x_b64, model_y_b64):
        x_artifact = decode_linear_tan_artifact(model_x_b64)
        y_artifact = decode_linear_tan_artifact(model_y_b64)

        estimators = []
        for artifact in (x_artifact, y_artifact):
            estimator = LinearRegression()
            estimator.coef_ = np.asarray(artifact["coef"], dtype=float)
            estimator.intercept_ = float(artifact["intercept"])
            estimator.n_features_in_ = EXPECTED_COEF_COUNT
            estimators.append(estimator)

        regressor = self.model.named_steps["multioutputregressor"]
        regressor.estimators_ = estimators
        regressor.n_features_in_ = EXPECTED_COEF_COUNT
        return self

    def predict(self, pitch, yaw):
        x, y = self.predict_normalized(pitch, yaw)
        return x * self.w, y * self.h

    def predict_normalized(self, pitch, yaw):
        x, y = self.model.predict(np.array([[pitch, yaw]], dtype=float))[0]
        return float(x), float(y)
