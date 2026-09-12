from app.schemas.common import CamelModel


class HotspotOut(CamelModel):
    x: float
    y: float
    r: float
    w: float


class SlideStatOut(CamelModel):
    idx: int
    on_slide: float
    fixations: int
    view_sec: float
    hotspots: list[HotspotOut]
    points: list[list[float]]


class AoiOut(CamelModel):
    id: str
    name: str
    x_min: float
    y_min: float
    x_max: float
    y_max: float
    weight: float
    char_count: int
    source: str
    covered: bool = False
    dwell_ms: int = 0


class SlideCoverageOut(CamelModel):
    content_id: str
    order_index: int
    is_key: bool
    coverage: float
    dwell_ms: int
    is_complete: bool
    aoi_count: int
    aoi_source: str
    aois: list[AoiOut]


class LessonMasteryOut(CamelModel):
    lesson_id: str
    score: float
    key_score: float
    normal_score: float
    key_done: int
    key_total: int
    slides_done: int
    slides_total: int
    slides: list[SlideCoverageOut]
