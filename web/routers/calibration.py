from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from uuid import UUID

from database import get_db
from models import CalibrationProfile,Session

router = APIRouter(prefix="/calibration", tags=["calibration"])


# ---------- Schemas ----------

class CalibrationProfileCreate(BaseModel):
    model_config = {"protected_namespaces": ()}

    session_id:     UUID
    model_path:     str
    avg_error_px:   Optional[float] = None
    n_points:       int
    model_type:     Optional[str] = "SVR"
    meta:           Optional[dict] = None

class CalibrationProfileOut(BaseModel):
    model_config = {"protected_namespaces": (), "from_attributes": True}

    id:             UUID
    session_id:     UUID
    model_path:     str
    avg_error_px:   Optional[float]
    n_points:       int
    model_type:     Optional[str]


# ---------- Endpoints ----------

@router.post("", response_model=CalibrationProfileOut, summary="Lưu kết quả calibration từ AI Service")
async def save_calibration(body: CalibrationProfileCreate, db: AsyncSession = Depends(get_db)):
    """
    Được gọi sau khi AI Service train SVR xong và trả về kết quả.
    Web Service lưu metadata vào DB, model .pkl đã nằm trên AI Service.
    """
    # Kiểm tra session tồn tại
    result = await db.execute(select(Session).where(Session.id == body.session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    # Không cho tạo 2 profile cho cùng 1 session
    existing = await db.execute(
        select(CalibrationProfile).where(CalibrationProfile.session_id == body.session_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Session này đã có calibration profile")

    profile = CalibrationProfile(
        session_id=body.session_id,
        model_path=body.model_path,
        avg_error_px=body.avg_error_px,
        n_points=body.n_points,
        model_type=body.model_type,
        meta=body.meta,
    )
    db.add(profile)
    await db.flush()

    return profile


@router.get("/{session_id}", response_model=CalibrationProfileOut, summary="Lấy calibration profile của session")
async def get_calibration(session_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(CalibrationProfile).where(CalibrationProfile.session_id == session_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(status_code=404, detail="Chưa có calibration profile cho session này")
    return profile