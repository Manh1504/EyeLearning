from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from web.database import get_db
from web.models import CalibrationProfile, Session

router = APIRouter(prefix="/calibration", tags=["calibration"])


class CalibrationProfileCreate(BaseModel):
    calibration_id: str
    user_id: str
    checkpoint_x: bytes
    checkpoint_y: bytes
    checkpoint_name: str
    is_fullscreen: bool
    viewport_h: int
    viewport_w: int


class CalibrationProfileOut(BaseModel):
    calibration_id: str
    user_id: str
    checkpoint_name: str
    is_fullscreen: bool
    viewport_h: int
    viewport_w: int

    class Config:
        from_attributes = True


class SessionCalibrationAttach(BaseModel):
    calibration_id: Optional[str] = None


@router.post("", response_model=CalibrationProfileOut, summary="Lưu calibration profile checkpoint")
async def save_calibration(body: CalibrationProfileCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(
        select(CalibrationProfile).where(CalibrationProfile.calibration_id == body.calibration_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Calibration profile đã tồn tại")

    profile = CalibrationProfile(**body.model_dump())
    db.add(profile)
    await db.flush()
    return profile


@router.patch("/sessions/{session_id}", summary="Gắn calibration profile vào session")
async def attach_calibration_to_session(
    session_id: str,
    body: SessionCalibrationAttach,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Session).where(Session.session_id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    if body.calibration_id:
        result = await db.execute(
            select(CalibrationProfile.calibration_id).where(
                CalibrationProfile.calibration_id == body.calibration_id
            )
        )
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Calibration profile không tồn tại")

    session.calibration_id = body.calibration_id
    return {"session_id": session.session_id, "calibration_id": session.calibration_id}


@router.get("/{session_id}", response_model=CalibrationProfileOut, summary="Lấy calibration profile của session")
async def get_calibration(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.session_id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")
    if not session.calibration_id:
        raise HTTPException(status_code=404, detail="Session chưa gắn calibration profile")

    result = await db.execute(
        select(CalibrationProfile).where(CalibrationProfile.calibration_id == session.calibration_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Calibration profile không tồn tại")
    return profile
