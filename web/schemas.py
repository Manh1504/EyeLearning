from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator


class LessonOut(BaseModel):
    lesson_id: str
    lesson_title: str
    teacher_id: Optional[str]
    lesson_description: Optional[str]
    video_url: Optional[str]
    content_url: Optional[str]
    layout_version: str
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class SessionOut(BaseModel):
    session_id: str
    user_id: str
    lesson_id: str
    calibration_id: Optional[str]
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    is_fullscreen: Optional[bool]
    viewport_w: Optional[int]
    viewport_h: Optional[int]

    class Config:
        from_attributes = True


class AOIDefinitionOut(BaseModel):
    aoi_id: str
    lesson_id: str
    layout_version: str
    aoi_key: str
    aoi_name: str
    css_selector: str
    aoi_type: str
    is_learning_area: bool
    is_active: bool

    class Config:
        from_attributes = True


class TrackingPointCreate(BaseModel):
    session_id: str
    lesson_id: Optional[str] = None
    timestamp_ms: int
    viewport_x: Optional[float] = None
    viewport_y: Optional[float] = None
    x: Optional[float] = None
    y: Optional[float] = None
    scroll_x: float = 0
    scroll_y: float = 0
    target_zone: Optional[str] = None
    confidence: Optional[float] = None
    gaze_status: Optional[str] = None

    @model_validator(mode="after")
    def validate_coordinates(self):
        if self.viewport_x is None and self.x is None:
            raise ValueError("viewport_x or fallback x is required")
        if self.viewport_y is None and self.y is None:
            raise ValueError("viewport_y or fallback y is required")
        return self


class TrackingPointBatchRequest(BaseModel):
    points: list[TrackingPointCreate] = Field(default_factory=list)


class TrackingPointOut(BaseModel):
    point_id: str
    session_id: str
    aoi_id: Optional[str]
    timestamp_ms: int
    viewport_x: float
    viewport_y: float
    scroll_x: float
    scroll_y: float
    confidence: Optional[float]
    gaze_status: Optional[str]

    class Config:
        from_attributes = True


class TrackingPointBatchOut(BaseModel):
    inserted: int
    points: list[TrackingPointOut]


class AOIMetricOut(BaseModel):
    metric_id: str
    session_id: str
    aoi_id: str
    dwell_time_ms: int
    dwell_time_pct: float
    point_count: int
    first_hit_ms: Optional[int]
    revisit_count: int
    calculated_at: Optional[datetime]
    algorithm_version: str

    class Config:
        from_attributes = True


class AOIMetricWithAOIOut(BaseModel):
    aoi_id: str
    aoi_key: str
    aoi_name: str
    aoi_type: str
    is_learning_area: bool
    dwell_time_ms: int
    dwell_time_pct: float
    point_count: int
    first_hit_ms: Optional[int]
    revisit_count: int
    calculated_at: Optional[datetime]
    algorithm_version: str


class HeatmapCreate(BaseModel):
    session_id: str
    aoi_key: Optional[str] = None


class HeatmapResponse(BaseModel):
    heatmap_id: str
    session_id: str
    aoi_key: Optional[str]
    background_image_url: Optional[str]
    status: str
    error_message: Optional[str]
    cloudinary_public_id: Optional[str]
    image_url: Optional[str]
    image_url_thumbnail: Optional[str]
    point_count: int
    generated_at: Optional[datetime]
    metadata_json: Optional[dict[str, Any]]

    class Config:
        from_attributes = True


class HeatmapGenerateResponse(HeatmapResponse):
    pass
