"""Pydantic schema cho request/response của gaze API."""

from typing import Literal

from pydantic import BaseModel, Field, field_validator

from app.settings import MAX_POINTS


class CalibPoint(BaseModel):
    id: str = Field(min_length=1, max_length=32, description="Định danh điểm.")
    x: float = Field(ge=0.0, le=1.0, description="Tọa độ chuẩn hóa [0, 1].")
    y: float = Field(ge=0.0, le=1.0, description="Tọa độ chuẩn hóa [0, 1].")


class SessionRequest(BaseModel):
    points: list[CalibPoint] = Field(min_length=1, max_length=MAX_POINTS)

    @field_validator("points")
    @classmethod
    def _unique_ids(cls, points: list[CalibPoint]) -> list[CalibPoint]:
        ids = [p.id for p in points]
        if len(set(ids)) != len(ids):
            raise ValueError("point id bị trùng")
        return points


class SessionCreated(BaseModel):
    session_id: str


class SessionStatus(BaseModel):
    state: Literal["collecting", "ready"]
    calibrated: bool


class CalibrateResult(BaseModel):
    status: Literal["accepted", "unknown_point", "invalid_image", "no_face"]
    count: int | None = None


class TrainResult(BaseModel):
    status: Literal["ok"] = "ok"
    n_samples: int
    # None khi không đủ mẫu để ước lượng MAE (ví dụ chỉ 1 điểm) — không phải NaN.
    mae_px: float | None = None


class InsufficientSamples(BaseModel):
    status: Literal["insufficient_samples"] = "insufficient_samples"
    detail: dict[str, int]


class ImportResult(BaseModel):
    status: Literal["ready", "invalid_model"]


class DeletedResult(BaseModel):
    status: Literal["deleted"] = "deleted"
