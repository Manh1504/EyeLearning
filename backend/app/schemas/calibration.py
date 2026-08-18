from datetime import datetime

from pydantic import Field

from app.schemas.common import CamelModel


class CalibrationCreateIn(CamelModel):
    device_fingerprint: str = Field(min_length=1, max_length=255)
    screen_width_px: int | None = None
    screen_height_px: int | None = None
    num_points: int = Field(ge=16, le=25)
    params: list[float] = Field(min_length=6, max_length=6)
    mapping_model_version: str = Field(default="v1", max_length=30)


class CalibrationOut(CamelModel):
    id: str
    params: list[float]
    mapping_model_version: str
    device_fingerprint: str
    valid_from: datetime


class CalibrationActiveOut(CamelModel):
    params: list[float]
    mapping_model_version: str
    calibrated_at: datetime
