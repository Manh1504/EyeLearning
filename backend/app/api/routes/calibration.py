from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.routes.gaze import _upsert_device
from app.db.session import get_db
from app.models.auth import User
from app.models.calibration import CalibrationParam, CalibrationSession
from app.schemas.calibration import (
    CalibrationActiveOut,
    CalibrationCreateIn,
    CalibrationOut,
)

router = APIRouter(prefix="/api/calibrations", tags=["calibrations"])


@router.post("", response_model=CalibrationOut, status_code=201)
async def save_calibration(
    body: CalibrationCreateIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    device = await _upsert_device(
        db,
        user_id=user.id,
        fingerprint=body.device_fingerprint,
        screen_width_px=body.screen_width_px,
        screen_height_px=body.screen_height_px,
    )
    now = datetime.now(timezone.utc)
    session = CalibrationSession(
        user_id=user.id,
        device_id=device.id,
        num_points=body.num_points,
        status="completed",
        finished_at=now,
    )
    db.add(session)
    await db.flush()

    await db.execute(
        update(CalibrationParam)
        .where(
            CalibrationParam.user_id == user.id,
            CalibrationParam.device_id == device.id,
            CalibrationParam.is_active.is_(True),
        )
        .values(is_active=False, valid_to=now)
    )
    param = CalibrationParam(
        calibration_session_id=session.id,
        user_id=user.id,
        device_id=device.id,
        params=body.params,
        mapping_model_version=body.mapping_model_version,
        is_active=True,
    )
    db.add(param)
    await db.commit()
    await db.refresh(param)
    return CalibrationOut(
        id=param.id,
        params=param.params_float,
        mapping_model_version=param.mapping_model_version,
        device_fingerprint=device.device_fingerprint,
        valid_from=param.valid_from,
    )


@router.get("/active", response_model=CalibrationActiveOut)
async def get_active_calibration(
    device_fingerprint: str = Query(alias="deviceFingerprint"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.calibration import Device

    device = (
        await db.execute(
            select(Device).where(
                Device.user_id == user.id,
                Device.device_fingerprint == device_fingerprint,
            )
        )
    ).scalar_one_or_none()
    if device is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Chưa có calibration cho thiết bị này"
        )
    param = (
        await db.execute(
            select(CalibrationParam).where(
                CalibrationParam.user_id == user.id,
                CalibrationParam.device_id == device.id,
                CalibrationParam.is_active.is_(True),
            )
        )
    ).scalar_one_or_none()
    if param is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Chưa có calibration cho thiết bị này"
        )
    return CalibrationActiveOut(
        params=param.params_float,
        mapping_model_version=param.mapping_model_version,
        calibrated_at=param.valid_from,
    )
