from pydantic import Field

from app.schemas.common import CamelModel


class LearningSessionCreateIn(CamelModel):
    enrollment_id: str
    lesson_id: str
    device_fingerprint: str = Field(min_length=1, max_length=255)
    screen_width_px: int | None = None
    screen_height_px: int | None = None
    tracking_consent: bool = True


class LearningSessionOut(CamelModel):
    id: str
    enrollment_id: str
    lesson_id: str
    device_id: str
    # Đã có model calibration (.ubj) cho (user, device) → có thể stream gaze thật.
    calibrated: bool = False
    status: str
    tracking_consent: bool


class LearningSessionEndIn(CamelModel):
    status: str = Field(default="completed", pattern="^(completed|aborted)$")


class GazeSampleIn(CamelModel):
    lesson_content_id: str
    x: float
    y: float
    ts: float


class GazeBatchIn(CamelModel):
    learning_session_id: str | None = None
    samples: list[GazeSampleIn] = Field(min_length=1)


class GazeBatchOut(CamelModel):
    ok: bool = True
    inserted: int = 0


class ProgressPatchIn(CamelModel):
    last_slide: int = Field(ge=0)
    completed: bool | None = None


class OkOut(CamelModel):
    ok: bool = True
