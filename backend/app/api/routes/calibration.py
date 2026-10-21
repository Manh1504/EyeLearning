import base64
import binascii
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.api.routes.gaze import _upsert_device
from app.db.session import get_db
from app.models.auth import User
from app.models.calibration import CalibrationParam, CalibrationSession, CalibrationSettings, Device
from app.schemas.calibration import (
    CalibrationActiveOut,
    CalibrationCreateIn,
    CalibrationModelOut,
    CalibrationOut,
    CalibrationSettingsOut,
)

router = APIRouter(prefix="/api/calibrations", tags=["calibrations"])

# Nhãn phiên bản cho mô hình ánh xạ (pitch, yaw) -> (x, y) hiện tại. Ghi kèm mỗi
# bản ghi để phân biệt model cũ/mới. v2 = gaze service serialize thuần hệ số
# (ubjson, không pickle); model v1 (pickle) không còn tương thích.
#
# Hậu tố `-b16` = backbone UniGaze đang chạy (services/gaze/app/services/pipeline.py).
# Hệ số (pitch, yaw) -> (x, y) đặc thù từng backbone, nên ĐỔI MODEL UniGaze thì
# phải đổi nhãn này: bản ghi cũ sẽ mismatch -> client tự yêu cầu hiệu chỉnh lại
# (`calibrated=false`, `/active/model` trả 409) thay vì nạp nhầm hệ số cũ.
MAPPING_MODEL_VERSION = "ubj-linreg-v2-b16"

# Chặn trên kích thước model .ubj nhận từ client (model thật ~1-3KB).
MAX_MODEL_UBJ_BYTES = 256 * 1024


async def _active_param(
    db: AsyncSession, user_id: str, device_id: str
) -> CalibrationParam | None:
    stmt = select(CalibrationParam).where(
        CalibrationParam.user_id == user_id,
        CalibrationParam.device_id == device_id,
        CalibrationParam.is_active.is_(True),
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _latest_param(
    db: AsyncSession, user_id: str, device_id: str
) -> CalibrationParam | None:
    """Bản ghi calibration duy nhất của (user, device).

    Ưu tiên dòng active; nếu không có (dữ liệu cũ) thì lấy dòng mới nhất.
    """
    stmt = (
        select(CalibrationParam)
        .where(
            CalibrationParam.user_id == user_id,
            CalibrationParam.device_id == device_id,
        )
        .order_by(
            CalibrationParam.is_active.desc(), CalibrationParam.valid_from.desc()
        )
        .limit(1)
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


def _decode_model(model_ubj_base64: str) -> bytes:
    try:
        raw = base64.b64decode(model_ubj_base64, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="modelUbjBase64 không phải base64 hợp lệ",
        ) from exc
    if not raw:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, detail="model .ubj rỗng"
        )
    if len(raw) > MAX_MODEL_UBJ_BYTES:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="model .ubj quá lớn",
        )
    return raw


@router.post("", response_model=CalibrationOut, status_code=201)
async def save_calibration_params(
    body: CalibrationCreateIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lưu model hiệu chỉnh (.ubj) từ gaze service cho (user, device).

    Mỗi cặp (user, device) chỉ giữ ĐÚNG MỘT bản ghi: bộ mới GHI ĐÈ bộ cũ tại
    chỗ (cập nhật cả calibration_session đi kèm) thay vì thêm dòng mới rồi
    deactivate — tránh tích luỹ .ubj (~1-3KB/bản) theo thời gian.
    """
    model_ubj = _decode_model(body.model_ubj_base64)

    device = await _upsert_device(
        db,
        user_id=user.id,
        fingerprint=body.device_fingerprint,
        screen_width_px=body.screen_width_px,
        screen_height_px=body.screen_height_px,
    )
    now = datetime.now(timezone.utc)
    num_points = max(1, min(body.num_points, 64))

    param = await _latest_param(db, user.id, device.id)
    if param is None:
        cal_session = CalibrationSession(
            user_id=user.id,
            device_id=device.id,
            num_points=num_points,
            status="completed",
            finished_at=now,
        )
        db.add(cal_session)
        await db.flush()
        param = CalibrationParam(
            calibration_session_id=cal_session.id,
            user_id=user.id,
            device_id=device.id,
            params=None,  # protocol 6 tham số kappa đã bỏ
            model_ubj=model_ubj,
            mae_px=body.mae_px,
            mapping_model_version=MAPPING_MODEL_VERSION,
            is_active=True,
            valid_from=now,
            valid_to=None,
        )
        db.add(param)
    else:
        cal_session = await db.get(CalibrationSession, param.calibration_session_id)
        if cal_session is not None:
            cal_session.num_points = num_points
            cal_session.status = "completed"
            cal_session.finished_at = now
        param.params = None
        param.model_ubj = model_ubj
        param.mae_px = body.mae_px
        param.mapping_model_version = MAPPING_MODEL_VERSION
        param.is_active = True
        param.valid_from = now
        param.valid_to = None

    await db.commit()
    await db.refresh(param)
    return CalibrationOut(
        id=param.id,
        mae_px=param.mae_px,
        num_points=num_points,
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
        # Model cũ (khác version) coi như chưa hiệu chỉnh -> UI sẽ yêu cầu làm lại.
        calibrated=param.has_model and param.mapping_model_version == MAPPING_MODEL_VERSION,
        mae_px=param.mae_px,
        calibrated_at=param.valid_from,
    )


@router.get("/active/model", response_model=CalibrationModelOut)
async def get_active_calibration_model(
    device_fingerprint: str = Query(alias="deviceFingerprint"),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trả model .ubj đang active (base64) để client nạp lại vào gaze service
    qua `POST /session/{sid}/import` mà không cần hiệu chỉnh lại."""
    device = await _find_device(db, user.id, device_fingerprint)
    if device is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Chưa có calibration cho thiết bị này"
        )
    param = await _active_param(db, user.id, device.id)
    if param is None or not param.has_model:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            detail="Chưa có model calibration cho thiết bị này",
        )
    if param.model_ubj is None:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Bản ghi calibration cũ không có model .ubj — hãy hiệu chỉnh lại",
        )
    if param.mapping_model_version != MAPPING_MODEL_VERSION:
        # Model cũ (vd pickle v1) không còn nạp được vào gaze service -> buộc
        # hiệu chỉnh lại để tránh client import lỗi lặp lại.
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Model hiệu chỉnh đã lỗi thời — hãy hiệu chỉnh lại",
        )
    return CalibrationModelOut(
        model_ubj_base64=base64.b64encode(param.model_ubj).decode("ascii"),
        mae_px=param.mae_px,
    )


@router.get("/config", response_model=CalibrationSettingsOut)
async def get_calibration_config(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Học viên/try-flow đọc ngưỡng hiện tại để quyết định pass/fail. Public cho mọi role đã đăng nhập."""
    row = await db.get(CalibrationSettings, 1)
    if row is None:
        return CalibrationSettingsOut(enabled=True, threshold=0.12, updated_at=None)
    return CalibrationSettingsOut(enabled=row.enabled, threshold=float(row.threshold), updated_at=row.updated_at)
