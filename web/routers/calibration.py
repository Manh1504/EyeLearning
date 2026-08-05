from pathlib import Path
from datetime import datetime, timezone
from time import time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from web.database import get_db
from web.authz import current_user_from_cookie, ensure_can_read_session_analytics, ensure_student_owns_session
from web.models import CalibrationProfile, Session, User
from web.services.calibration_service import calibration_model_url
from web.services.calibration_service import CALIBRATION_MODEL_DIR, save_calibration_model

router = APIRouter(prefix="/calibration", tags=["calibration"])


class CalibrationCheckpointIn(BaseModel):
    name: str
    x: float
    y: float
    pitch: float
    yaw: float


class CalibrationSubmit(BaseModel):
    session_id: str
    profile_name: Optional[str] = None
    viewport_w: int
    viewport_h: int
    is_fullscreen: bool = True
    device_pixel_ratio: Optional[float] = None
    camera_label: Optional[str] = None
    orientation: Optional[str] = None
    browser_label: Optional[str] = None
    avg_error_px: Optional[float] = None
    model_x_b64: str
    model_y_b64: str
    model_format: str = "joblib"
    checkpoints: List[CalibrationCheckpointIn]


class CalibrationCheckpointOut(BaseModel):
    calibration_id: str
    checkpoint_name: str
    checkpoint_x: float
    checkpoint_y: float
    pitch: float
    yaw: float

    class Config:
        from_attributes = True


class CalibrationSubmitResponse(BaseModel):
    calibration_group_id: str
    n_points: int
    avg_error_px: Optional[float]
    model_storage_url: Optional[str]
    checkpoints: List[CalibrationCheckpointOut]


@router.post("", response_model=CalibrationSubmitResponse, summary="Lưu calibration (9 checkpoint) + persist model xuống DB")
async def save_calibration(
    body: CalibrationSubmit,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    if not body.checkpoints:
        raise HTTPException(status_code=400, detail="checkpoints không được rỗng")

    session = await ensure_student_owns_session(db, user, body.session_id)

    calibration_group_id = f"CALIB_{body.session_id}_{int(time() * 1000)}"
    existing_default = await db.scalar(
        select(CalibrationProfile.calibration_id)
        .where(CalibrationProfile.user_id == session.user_id)
        .where(CalibrationProfile.status == "active")
        .where(CalibrationProfile.is_default.is_(True))
        .limit(1)
    )

    # Model chỉ cần lưu 1 lần (chung cho cả 9 row cùng group) — không encode
    # trùng lặp base64 vào mỗi row, chỉ lưu model_storage_url dùng chung.
    model_storage_url = save_calibration_model(calibration_group_id, body.model_x_b64, body.model_y_b64)

    checkpoints_out = []
    for idx, checkpoint in enumerate(body.checkpoints):
        profile = CalibrationProfile(
            calibration_id=f"{calibration_group_id}_{idx}_{checkpoint.name}",
            calibration_group_id=calibration_group_id,
            user_id=session.user_id,
            checkpoint_name=checkpoint.name,
            checkpoint_x=checkpoint.x,
            checkpoint_y=checkpoint.y,
            pitch=checkpoint.pitch,
            yaw=checkpoint.yaw,
            is_fullscreen=body.is_fullscreen,
            viewport_h=body.viewport_h,
            viewport_w=body.viewport_w,
            avg_error_px=body.avg_error_px,
            n_points=len(body.checkpoints),
            model_storage_url=model_storage_url,
            model_format=body.model_format,
            profile_name=body.profile_name or f"Hồ sơ căn chỉnh {datetime.now().strftime('%d/%m %H:%M')}",
            model_version="svr:v1",
            environment_json={
                "viewport_w": body.viewport_w,
                "viewport_h": body.viewport_h,
                "is_fullscreen": body.is_fullscreen,
                "device_pixel_ratio": body.device_pixel_ratio or 1,
                "camera_label": body.camera_label,
                "orientation": body.orientation,
                "browser_label": body.browser_label,
            },
            artifact_status="available",
            is_default=not bool(existing_default),
            last_used_at=datetime.now(timezone.utc),
            browser_label=body.browser_label,
        )
        db.add(profile)
        checkpoints_out.append(profile)

    # Gắn luôn calibration_group_id vào session trong cùng 1 request — đỡ
    # frontend phải gọi thêm PATCH /calibration/sessions/{id} riêng.
    session.calibration_group_id = calibration_group_id
    session.status = "learning"

    await db.flush()

    return CalibrationSubmitResponse(
        calibration_group_id=calibration_group_id,
        n_points=len(body.checkpoints),
        avg_error_px=body.avg_error_px,
        model_storage_url=model_storage_url,
        checkpoints=checkpoints_out,
    )


@router.get("/{session_id}", response_model=List[CalibrationCheckpointOut], summary="Lấy 9 checkpoint calibration của session")
async def get_calibration(
    session_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await ensure_can_read_session_analytics(db, user, session_id)
    result = await db.execute(select(Session).where(Session.session_id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")
    if not session.calibration_group_id:
        raise HTTPException(status_code=404, detail="Session chưa gắn calibration")

    result = await db.execute(
        select(CalibrationProfile).where(CalibrationProfile.calibration_group_id == session.calibration_group_id)
    )
    profiles = result.scalars().all()
    if not profiles:
        raise HTTPException(status_code=404, detail="Calibration group không tồn tại")
    return profiles


@router.get("/model-file/{filename}", include_in_schema=False)
async def get_calibration_model_file(
    filename: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")

    path = (CALIBRATION_MODEL_DIR / safe_name).resolve()
    root = CALIBRATION_MODEL_DIR.resolve()
    if root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Calibration model file not found")

    model_url = calibration_model_url(safe_name.removeprefix("calibration_model_").removesuffix(".json"))
    result = await db.execute(
        select(CalibrationProfile.user_id).where(CalibrationProfile.model_storage_url == model_url).limit(1)
    )
    owner_id = result.scalar_one_or_none()
    if owner_id != user.user_id and user.role != "admin":
        raise HTTPException(status_code=403, detail="Bạn không có quyền tải calibration model")

    return FileResponse(path, media_type="application/json")
