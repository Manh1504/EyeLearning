import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch

from web.routers.sessions import _sign_tracking_token


class TrackingTokenTest(unittest.TestCase):
    def test_backend_token_verifies_in_ai_service(self):
        server_path = Path(__file__).resolve().parents[2] / "Gaze-Estimation" / "server.py"
        sys.path.insert(0, str(server_path.parent))
        sys.modules.setdefault("models", types.SimpleNamespace(Pipline=object))
        sys.modules.setdefault("calibration", types.SimpleNamespace(Calibration=object))
        sys.modules.setdefault(
            "numpy",
            types.SimpleNamespace(
                sqrt=lambda value: value ** 0.5,
                median=lambda values: values[0] if values else None,
                max=max,
                array=lambda value: value,
                frombuffer=lambda value, *_: value,
                uint8=object,
            ),
        )
        sys.modules.setdefault("cv2", types.SimpleNamespace(imdecode=lambda *_: None, IMREAD_COLOR=1, cvtColor=lambda img, *_: img, COLOR_BGR2RGB=1))

        with patch.dict(
            "os.environ",
            {
                "size": "224",
                "TRACKING_TOKEN_SECRET": "test-secret",
            },
        ):
            spec = importlib.util.spec_from_file_location("ai_server_for_token_test", server_path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            with patch("web.routers.sessions._tracking_token_secret", return_value="test-secret"):
                token, _ = _sign_tracking_token("S001", ttl_seconds=600)

        self.assertTrue(module.verify_tracking_token(token, "S001"))
        self.assertFalse(module.verify_tracking_token(token, "S002"))


if __name__ == "__main__":
    unittest.main()
