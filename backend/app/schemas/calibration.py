from datetime import datetime
from typing import List

from pydantic import Field, field_validator

from app.schemas.common import CamelModel


class CalibrationOut(CamelModel):
    id: str
    mae_px: float | None = None
    mapping_model_version: str
    device_fingerprint: str
    valid_from: datetime


class CalibrationActiveOut(CamelModel):
    calibrated: bool = True
    mae_px: float | None = None
    mapping_model_version: str
    calibrated_at: datetime


class CalibrationParamsOut(CamelModel):
    params: List[float]


class CalibrationCreateIn(CamelModel):
    """Bộ 6 tham số hiệu chỉnh [a1, a2, b1, a3, a4, b2] từ /calibrate/fit + metadata."""

    device_fingerprint: str = Field(min_length=1, max_length=255)
    num_points: int = Field(ge=16, le=25)
    params: List[float] = Field(min_length=6, max_length=6)
    screen_width_px: int | None = None
    screen_height_px: int | None = None
    mae_px: float | None = None
    mapping_model_version: str = "v2"

    @field_validator("params")
    @classmethod
    def _finite_numbers(cls, v: List[float]) -> List[float]:
        for value in v:
            if not isinstance(value, (int, float)):
                raise ValueError("params phải là số")
        return v