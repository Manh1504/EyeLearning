import json
import secrets
from datetime import datetime, timezone
from time import time
from urllib.error import URLError
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from web.authz import current_user_from_cookie, normalize_role
from web.config import backend_ai_http_url
from web.database import get_db
from web.models import CalibrationProfile, CalibrationValidationRun, Session, User
from web.services.calibration_profile_logic import MODEL_VERSION, evaluate_compatibility, validation_status
from web.services.calibration_service import calibration_model_path, read_calibration_model

router = APIRouter(prefix="/calibration-profiles", tags=["calibration-profiles"])


def _ensure_profile_owner_role(user: User) -> None:
    if normalize_role(user.role) not in {"student", "admin"}:
        raise HTTPException(status_code=403, detail="Chỉ học sinh hoặc quản trị viên được quản lý hồ sơ căn chỉnh của chính mình")


class EnvironmentIn(BaseModel):
    viewport_w: int
    viewport_h: int
    is_fullscreen: bool = False
    device_pixel_ratio: float = 1
    camera_label: str | None = None
    orientation: str | None = None
    browser_label: str | None = None


class ProfileCreate(BaseModel):
    calibration_group_id: str
    profile_name: str = Field(min_length=1, max_length=80)
    environment: EnvironmentIn


class ProfileUpdate(BaseModel):
    profile_name: str | None = Field(default=None, min_length=1, max_length=80)


class ProfileDeleteIn(BaseModel):
    replacement_profile_id: str | None = None


class ProfileLoadIn(BaseModel):
    session_id: str
    environment: EnvironmentIn


class ValidationRunIn(BaseModel):
    session_id: str
    environment: EnvironmentIn
    metrics: dict
    predictions: list[dict] = []


def _profile_name(profile: CalibrationProfile) -> str:
    return profile.profile_name or f"Hồ sơ căn chỉnh {profile.calibration_group_id[-6:]}"


def _artifact_status(group_id: str, profile: CalibrationProfile) -> str:
    if profile.artifact_status != "available":
        return profile.artifact_status
    return "available" if calibration_model_path(group_id).is_file() else "missing"


def _profile_out(profile: CalibrationProfile, env: dict | None = None) -> dict:
    compatibility = evaluate_compatibility(profile.environment_json, env, profile.model_version)
    artifact_status = _artifact_status(profile.calibration_group_id, profile)
    if artifact_status != "available":
        compatibility = compatibility.__class__("incompatible", tuple(list(compatibility.reasons) + ["artifact_missing"]))
    return {
        "id": profile.calibration_group_id,
        "profile_name": _profile_name(profile),
        "student_owner": profile.user_id,
        "model_version": profile.model_version or MODEL_VERSION,
        "environment": profile.environment_json or {},
        "quality": {"avg_error_px": profile.avg_error_px, "n_points": profile.n_points},
        "created_at": profile.trained_at,
        "updated_at": profile.updated_at,
        "last_used_at": profile.last_used_at,
        "last_validation_at": profile.last_validation_at,
        "last_validation_status": profile.last_validation_status,
        "artifact_status": artifact_status,
        "is_default": bool(profile.is_default),
        "browser_label": profile.browser_label,
        "model_storage_url": profile.model_storage_url,
        "compatibility": {"status": compatibility.status, "reasons": list(compatibility.reasons)},
        "local_only": not str(profile.model_storage_url or "").startswith("http"),
    }


async def _owned_group(db: AsyncSession, user: User, group_id: str) -> list[CalibrationProfile]:
    result = await db.execute(
        select(CalibrationProfile)
        .where(CalibrationProfile.calibration_group_id == group_id)
        .where(CalibrationProfile.user_id == user.user_id)
        .order_by(CalibrationProfile.checkpoint_name)
    )
    profiles = list(result.scalars().all())
    if not profiles:
        raise HTTPException(status_code=404, detail="Không tìm thấy hồ sơ căn chỉnh")
    return profiles


async def _group_head(db: AsyncSession, user: User, group_id: str) -> CalibrationProfile:
    return (await _owned_group(db, user, group_id))[0]


@router.get("")
async def list_profiles(
    viewport_w: int | None = None,
    viewport_h: int | None = None,
    is_fullscreen: bool | None = None,
    device_pixel_ratio: float | None = None,
    camera_label: str | None = None,
    orientation: str | None = None,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    _ensure_profile_owner_role(user)
    env = None
    if viewport_w and viewport_h:
        env = {
            "viewport_w": viewport_w,
            "viewport_h": viewport_h,
            "is_fullscreen": is_fullscreen,
            "device_pixel_ratio": device_pixel_ratio or 1,
            "camera_label": camera_label,
            "orientation": orientation,
        }
    result = await db.execute(
        select(CalibrationProfile)
        .where(CalibrationProfile.user_id == user.user_id)
        .where(CalibrationProfile.status == "active")
        .order_by(
            CalibrationProfile.is_default.desc(),
            CalibrationProfile.last_used_at.desc().nulls_last(),
            CalibrationProfile.last_validation_at.desc().nulls_last(),
            CalibrationProfile.trained_at.desc(),
        )
    )
    by_group: dict[str, CalibrationProfile] = {}
    for profile in result.scalars().all():
        by_group.setdefault(profile.calibration_group_id, profile)
    return [_profile_out(profile, env) for profile in by_group.values()]


@router.get("/{profile_id}")
async def get_profile(profile_id: str, user: User = Depends(current_user_from_cookie), db: AsyncSession = Depends(get_db)):
    _ensure_profile_owner_role(user)
    return _profile_out(await _group_head(db, user, profile_id))


@router.post("")
async def create_profile(body: ProfileCreate, user: User = Depends(current_user_from_cookie), db: AsyncSession = Depends(get_db)):
    _ensure_profile_owner_role(user)
    profiles = await _owned_group(db, user, body.calibration_group_id)
    if not read_calibration_model(body.calibration_group_id):
        raise HTTPException(status_code=409, detail="Artifact căn chỉnh chưa tồn tại hoặc đã hỏng")
    env = body.environment.model_dump()
    for profile in profiles:
        profile.profile_name = body.profile_name.strip()
        profile.environment_json = env
        profile.model_version = MODEL_VERSION
        profile.artifact_status = "available"
        profile.browser_label = env.get("browser_label")
        profile.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return _profile_out(profiles[0], env)


@router.patch("/{profile_id}")
async def update_profile(profile_id: str, body: ProfileUpdate, user: User = Depends(current_user_from_cookie), db: AsyncSession = Depends(get_db)):
    _ensure_profile_owner_role(user)
    profiles = await _owned_group(db, user, profile_id)
    if body.profile_name is not None:
        for profile in profiles:
            profile.profile_name = body.profile_name.strip()
            profile.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return _profile_out(profiles[0])


@router.post("/{profile_id}/default")
async def set_default_profile(profile_id: str, user: User = Depends(current_user_from_cookie), db: AsyncSession = Depends(get_db)):
    _ensure_profile_owner_role(user)
    profiles = await _owned_group(db, user, profile_id)
    await db.execute(
        update(CalibrationProfile)
        .where(CalibrationProfile.user_id == user.user_id)
        .values(is_default=False, updated_at=datetime.now(timezone.utc))
    )
    for profile in profiles:
        profile.is_default = True
        profile.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return _profile_out(profiles[0])


@router.delete("/{profile_id}")
async def delete_profile(
    profile_id: str,
    body: ProfileDeleteIn | None = None,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    _ensure_profile_owner_role(user)
    profiles = await _owned_group(db, user, profile_id)
    replacement_id = body.replacement_profile_id if body else None
    if profiles[0].is_default:
        result = await db.execute(
            select(CalibrationProfile)
            .where(CalibrationProfile.user_id == user.user_id)
            .where(CalibrationProfile.status == "active")
            .where(CalibrationProfile.calibration_group_id != profile_id)
            .order_by(CalibrationProfile.last_used_at.desc().nulls_last(), CalibrationProfile.trained_at.desc())
        )
        replacement_profiles = list(result.scalars().all())
        if replacement_id:
            replacement_profiles = [profile for profile in replacement_profiles if profile.calibration_group_id == replacement_id]
        if not replacement_profiles:
            raise HTTPException(status_code=409, detail="Hãy chọn hồ sơ khác trước khi xóa hồ sơ đang dùng mặc định.")
        replacement_group_id = replacement_profiles[0].calibration_group_id
        await db.execute(
            update(CalibrationProfile)
            .where(CalibrationProfile.user_id == user.user_id)
            .where(CalibrationProfile.calibration_group_id == replacement_group_id)
            .values(is_default=True, updated_at=datetime.now(timezone.utc))
        )
    for profile in profiles:
        profile.status = "deleted"
        profile.artifact_status = "deleted"
        profile.is_default = False
        profile.updated_at = datetime.now(timezone.utc)
    await db.flush()
    return {"ok": True, "profile_id": profile_id}


@router.post("/{profile_id}/load")
async def load_profile(profile_id: str, body: ProfileLoadIn, user: User = Depends(current_user_from_cookie), db: AsyncSession = Depends(get_db)):
    _ensure_profile_owner_role(user)
    profile = await _group_head(db, user, profile_id)
    session = await db.get(Session, body.session_id)
    if not session or session.user_id != user.user_id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền dùng phiên này")
    env = body.environment.model_dump()
    compatibility = evaluate_compatibility(profile.environment_json, env, profile.model_version)
    model_payload = read_calibration_model(profile_id)
    if not model_payload:
        await db.execute(
            update(CalibrationProfile)
            .where(CalibrationProfile.calibration_group_id == profile_id)
            .values(artifact_status="missing", updated_at=datetime.now(timezone.utc))
        )
        raise HTTPException(status_code=409, detail="Dữ liệu căn chỉnh không còn trên thiết bị/server này")

    req = Request(
        f"{backend_ai_http_url()}/calibration/load",
        data=json.dumps({
            "session_id": body.session_id,
            "model_x_b64": model_payload["model_x_b64"],
            "model_y_b64": model_payload["model_y_b64"],
            "model_format": profile.model_format or "joblib",
        }).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(req, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (OSError, URLError) as exc:
        raise HTTPException(status_code=502, detail=f"Không thể kết nối dịch vụ eye-tracking: {exc}") from exc
    if payload.get("error"):
        raise HTTPException(status_code=409, detail=payload["error"])
    session.calibration_group_id = profile_id
    session.status = "learning"
    profiles = await _owned_group(db, user, profile_id)
    for row in profiles:
        row.last_used_at = datetime.now(timezone.utc)
        row.updated_at = datetime.now(timezone.utc)
    await db.flush()
    response = {"ok": True, "profile": _profile_out(profile, env), "ai": payload}
    if compatibility.status != "compatible":
        response["compatibility_warning"] = {
            "message": "Hồ sơ được tạo trong điều kiện khác với hiện tại nên dữ liệu gaze có thể kém chính xác hơn.",
            "reasons": list(compatibility.reasons),
        }
    return response


@router.post("/{profile_id}/validation-runs")
async def create_validation_run(profile_id: str, body: ValidationRunIn, user: User = Depends(current_user_from_cookie), db: AsyncSession = Depends(get_db)):
    _ensure_profile_owner_role(user)
    profiles = await _owned_group(db, user, profile_id)
    session = await db.get(Session, body.session_id)
    if not session or session.user_id != user.user_id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền dùng phiên này")
    if session.calibration_group_id != profile_id:
        raise HTTPException(status_code=409, detail="Hồ sơ căn chỉnh chưa được tải vào phiên này")
    status = validation_status(body.metrics)
    run = CalibrationValidationRun(
        validation_id=f"VAL_{secrets.token_hex(12)}_{int(time() * 1000)}",
        calibration_group_id=profile_id,
        user_id=user.user_id,
        session_id=body.session_id,
        status=status,
        sample_count=int(body.metrics.get("sample_count") or 0),
        valid_sample_count=int(body.metrics.get("valid_sample_count") or 0),
        valid_sample_ratio=body.metrics.get("valid_sample_ratio"),
        median_error_norm=body.metrics.get("median_error_norm"),
        max_error_norm=body.metrics.get("max_error_norm"),
        environment_json=body.environment.model_dump(),
        result_json={"metrics": body.metrics, "predictions": body.predictions},
    )
    db.add(run)
    for profile in profiles:
        profile.last_validation_at = datetime.now(timezone.utc)
        profile.last_validation_status = status
        profile.updated_at = datetime.now(timezone.utc)
    if status == "passed":
        session.status = "learning"
        session.calibration_group_id = profile_id
    await db.flush()
    return {"validation_id": run.validation_id, "status": status, "metrics": body.metrics}
