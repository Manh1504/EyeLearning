from pydantic import BaseModel


class CalibPoint(BaseModel):
    id: str
    x: float
    y: float


class SessionRequest(BaseModel):
    points: list[CalibPoint]
