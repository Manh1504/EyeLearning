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
