from datetime import datetime

from pydantic import Field

from app.schemas.common import CamelModel


class CalibrationOut(CamelModel):
    id: str
    mae_px: float | None = None
    num_points: int
    device_fingerprint: str
    valid_from: datetime


class CalibrationActiveOut(CamelModel):
    calibrated: bool = True
    mae_px: float | None = None
    calibrated_at: datetime


class CalibrationModelOut(CamelModel):
    """Model hiệu chỉnh (.ubj) đang active, để client nạp lại qua /session/{sid}/import."""

    model_ubj_base64: str
    mae_px: float | None = None


class CalibrationCreateIn(CamelModel):
    """Model hiệu chỉnh (.ubj) train từ gaze service + metadata thiết bị.

    `model_ubj_base64` là nội dung file tải từ `GET /session/{sid}/model` của
    gaze service, mã hoá base64 (model LinearRegression ~1-3KB).
    """

    device_fingerprint: str = Field(min_length=1, max_length=255)
    num_points: int = Field(ge=1, le=64)
    model_ubj_base64: str = Field(min_length=1)
    screen_width_px: int | None = None
    screen_height_px: int | None = None
    mae_px: float | None = None


class CalibrationSettingsOut(CamelModel):
    enabled: bool
    threshold: float  # 0.01-0.30 (0.12 = 12%)
    updated_at: datetime | None = None


class CalibrationSettingsIn(CamelModel):
    enabled: bool
    threshold: float = Field(ge=0.01, le=0.30)
