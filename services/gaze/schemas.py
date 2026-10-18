from pydantic import BaseModel


class CalibPoint(BaseModel):
    id: str
    x: float
    y: float


class SessionRequest(BaseModel):
    screen_width: int
    screen_height: int
    points: list[CalibPoint]
