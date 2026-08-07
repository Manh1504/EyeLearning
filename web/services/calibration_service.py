import json
from pathlib import Path

from web.config import DATA_DIR, configure_cloudinary, is_cloudinary_configured

CALIBRATION_MODEL_DIR = DATA_DIR / "outputs" / "calibration_models"


def _safe_filename(calibration_group_id: str) -> str:
    safe = "".join(char if char.isalnum() or char in "._-" else "_" for char in calibration_group_id)
    return f"calibration_model_{safe}.json"


def calibration_model_url(calibration_group_id: str) -> str:
    return f"/calibration/model-file/{_safe_filename(calibration_group_id)}"


def save_calibration_model(calibration_group_id: str, model_x_b64: str, model_y_b64: str, model_format: str | None = None) -> str:
    """Gộp model_x/model_y (đã serialize base64 bởi AI Service) thành 1 file JSON,
    lưu local + upload Cloudinary (nếu có cấu hình) — trả về URL để lưu vào
    calibration_profiles.model_storage_url."""
    CALIBRATION_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    filename = _safe_filename(calibration_group_id)
    path = CALIBRATION_MODEL_DIR / filename
    path.write_text(
        json.dumps({"model_x_b64": model_x_b64, "model_y_b64": model_y_b64, "model_format": model_format}),
        encoding="utf-8",
    )

    if is_cloudinary_configured():
        try:
            import cloudinary.uploader

            configure_cloudinary()
            result = cloudinary.uploader.upload(
                str(path),
                folder="eyelearn/calibration_models",
                public_id=path.stem,
                overwrite=True,
                resource_type="raw",
            )
            return result.get("secure_url") or calibration_model_url(calibration_group_id)
        except Exception:
            # Upload Cloudinary lỗi không nên chặn việc lưu calibration — model
            # vẫn có bản local, chỉ là chưa lên cloud. Serve tạm qua route local.
            return calibration_model_url(calibration_group_id)

    return calibration_model_url(calibration_group_id)


def calibration_model_path(calibration_group_id: str) -> Path:
    return CALIBRATION_MODEL_DIR / _safe_filename(calibration_group_id)


def read_calibration_model(calibration_group_id: str) -> dict | None:
    path = calibration_model_path(calibration_group_id)
    if not path.is_file():
        return None
    return json.loads(path.read_text(encoding="utf-8"))
