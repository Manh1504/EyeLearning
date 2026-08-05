from datetime import datetime, timedelta, timezone
import unittest

from web.services.calibration_profile_logic import (
    MODEL_VERSION,
    evaluate_compatibility,
    validation_lease_valid,
    validation_status,
)


class CalibrationProfileLogicTest(unittest.TestCase):
    def test_compatible_when_environment_matches(self):
        env = {
            "viewport_w": 1440,
            "viewport_h": 900,
            "is_fullscreen": False,
            "device_pixel_ratio": 2,
            "camera_label": "Integrated Camera",
        }
        result = evaluate_compatibility(env, env, MODEL_VERSION)
        self.assertEqual(result.status, "compatible")
        self.assertEqual(result.reasons, ())

    def test_model_version_mismatch_is_incompatible(self):
        result = evaluate_compatibility({}, {}, "svr:v0")
        self.assertEqual(result.status, "incompatible")
        self.assertIn("model_version", result.reasons)

    def test_viewport_large_delta_is_incompatible(self):
        result = evaluate_compatibility(
            {"viewport_w": 1440, "viewport_h": 900, "device_pixel_ratio": 1},
            {"viewport_w": 1024, "viewport_h": 900, "device_pixel_ratio": 1},
            MODEL_VERSION,
        )
        self.assertEqual(result.status, "incompatible")
        self.assertIn("viewport_width", result.reasons)

    def test_missing_current_environment_is_unknown_not_incompatible(self):
        result = evaluate_compatibility(
            {"viewport_w": 1440, "viewport_h": 900, "device_pixel_ratio": 1, "camera_label": "Laptop ở nhà"},
            None,
            MODEL_VERSION,
        )
        self.assertEqual(result.status, "unknown")
        self.assertIn("metadata_unavailable", result.reasons)

    def test_validation_status_boundaries(self):
        self.assertEqual(validation_status({"valid_sample_ratio": 0.8, "median_error_norm": 0.08}), "passed")
        self.assertEqual(validation_status({"valid_sample_ratio": 0.8, "median_error_norm": 0.12}), "retry")
        self.assertEqual(validation_status({"valid_sample_ratio": 0.8, "median_error_norm": 0.2}), "failed")
        self.assertEqual(validation_status({"valid_sample_ratio": 0.2, "median_error_norm": 0.01}), "retry")

    def test_validation_lease_expires_and_invalidates_on_environment_change(self):
        self.assertTrue(validation_lease_valid(datetime.now(timezone.utc) - timedelta(minutes=5)))
        self.assertFalse(validation_lease_valid(datetime.now(timezone.utc) - timedelta(hours=2)))
        self.assertFalse(validation_lease_valid(datetime.now(timezone.utc), env_changed=True))


if __name__ == "__main__":
    unittest.main()
