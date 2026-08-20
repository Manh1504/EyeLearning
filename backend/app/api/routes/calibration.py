from datetime import datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.routes.gaze import _upsert_device
from app.db.session import get_db
from app.models.auth import User
from app.models.calibration import CalibrationParam, CalibrationSession, Device
from app.schemas.calibration import (
    CalibrationActiveOut,
    CalibrationCreateIn,
    CalibrationOut,
    CalibrationParamsOut,
)

router = APIRouter(prefix="/api/calibrations", tags=["calibrations"])


def _to_float(value: Decimal | float) -> float:
    return float(value)


async def _active_param(
    db: AsyncSession, user_id: str, device_id: str
) -> CalibrationParam | None:
    stmt = select(CalibrationParam).where(
        CalibrationParam.user_id == user_id,
        CalibrationParam.device_id == device_id,
        CalibrationParam.is_active.is_(True),
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _find_device(
    db: AsyncSession, user_id: str, fingerprint: str
) -> Device | None:
    stmt = select(Device).where(
        Device.user_id == user_id,
        Device.device_fingerprint == fingerprint,
    )
    return (await db.execute(stmt)).scalar_one_or_none()


@router.post("", response_model=CalibrationOut, status_code=201)
async def save_calibration_params(
    body: CalibrationCreateIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lưu bộ 6 tham số hiệu chỉnh (từ POST /calibrate/fit của AI service) làm
    calibration ACTIVE cho (user, device). Mọi bộ cũ bị deactivate ngay."""
    device = await _upsert_device(
        db,
        user_id=user.id,
        fingerprint=body.device_fingerprint,
        screen_width_px=body.screen_width_px,
        screen_height_px=body.screen_height_px,
    )
    now = datetime.now(timezone.utc)
    cal_session = CalibrationSession(
        user_id=user.id,
        device_id=device.id,
        num_points=max(1, min(body.num_points, 25)),
        status="completed",
        finished_at=now,
    )
    db.add(cal_session)
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
        calibration_session_id=cal_session.id,
        user_id=user.id,
        device_id=device.id,
        params=[Decimal(str(v)) for v in body.params],
        model_ubj=None,
        mae_px=body.mae_px,
        mapping_model_version=body.mapping_model_version,
        is_active=True,
    )
    db.add(param)
    await db.commit()
    await db.refresh(param)
    return CalibrationOut(
        id=param.id,
        mae_px=param.mae_px,
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
    device = await _find_device(db, user.id, device_fingerprint)
    if device is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Chưa có calibration cho thiết bị này"
        )
    param = await _active_param(db, user.id, device.id)
    if param is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Chưa có calibration cho thiết bị này"
        )
    return CalibrationActiveOut(
        calibrated=param.has_params,
        mae_px=param.mae_px,
        mapping_model_version=param.mapping_model_version,
        calibrated_at=param.valid_from,
    )


@router.get("/active/params", response_model=CalibrationParamsOut)
async def get_active_calibration_params(
    device_fingerprint: str = Query(alias="deviceFingerprint"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trả bộ [a1, a2, b1, a3, a4, b2] active để client gửi vào WS /infer của
    AI service (config message) khi stream mà không cần calibrate lại."""
    device = await _find_device(db, user.id, device_fingerprint)
    if device is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Chưa có calibration cho thiết bị này"
        )
    param = await _active_param(db, user.id, device.id)
    if param is None or not param.has_params:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail="Chưa có params calibration cho thiết bị này",
        )
    return CalibrationParamsOut(
        params=[_to_float(v) for v in param.params],
    )