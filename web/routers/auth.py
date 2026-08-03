import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from web.authz import SESSION_COOKIE_NAME, current_user_from_cookie, normalize_role, token_hash
from web.database import get_db
from web.models import AuthSession, CourseEnrollment, User

router = APIRouter(prefix="/auth", tags=["auth"])
SESSION_TTL_HOURS = int(os.getenv("ELA_SESSION_TTL_HOURS", "12"))
COOKIE_SECURE = os.getenv("ELA_COOKIE_SECURE", "0") == "1"
ALLOW_DEV_BOOTSTRAP = os.getenv("ELA_ALLOW_DEV_AUTH_BOOTSTRAP", "1") == "1"
LOGIN_ATTEMPTS: dict[str, list[datetime]] = {}
LOGIN_WINDOW_SECONDS = int(os.getenv("ELA_LOGIN_RATE_WINDOW_SECONDS", "300"))
LOGIN_MAX_ATTEMPTS = int(os.getenv("ELA_LOGIN_RATE_MAX_ATTEMPTS", "10"))


class LoginRequest(BaseModel):
    full_name: Optional[str] = ""
    identifier: Optional[str] = None
    student_code: Optional[str] = None
    email: Optional[str] = None
    password: str = Field(default="", min_length=0)


class UserOut(BaseModel):
    user_id: str
    role: str
    full_name: Optional[str]
    student_code: Optional[str]
    email: Optional[str]


def password_hash(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 180_000)
    return f"pbkdf2_sha256${salt}${digest.hex()}"


def verify_password(password: str, stored: str | None) -> bool:
    if not stored:
        return False
    try:
        scheme, salt, expected = stored.split("$", 2)
    except ValueError:
        return False
    if scheme != "pbkdf2_sha256":
        return False
    actual = password_hash(password, salt).split("$", 2)[2]
    return hmac.compare_digest(actual, expected)


def user_out(user: User) -> dict:
    return {
        "user_id": user.user_id,
        "role": normalize_role(user.role),
        "full_name": user.full_name,
        "student_code": user.student_code,
        "email": user.email,
    }


async def find_user(db: AsyncSession, body: LoginRequest) -> User | None:
    identifier = (body.identifier or body.email or body.student_code or "").strip()
    if not identifier:
        return None
    if "@" in identifier:
        result = await db.execute(select(User).where(User.email == identifier))
        return result.scalar_one_or_none()
    result = await db.execute(select(User).where(User.student_code == identifier))
    return result.scalar_one_or_none()


def enforce_login_rate_limit(request: Request, body: LoginRequest) -> None:
    key = f"{request.client.host if request.client else 'unknown'}:{body.identifier or body.email or body.student_code or body.full_name}"
    now = datetime.now(timezone.utc)
    window_start = now - timedelta(seconds=LOGIN_WINDOW_SECONDS)
    attempts = [attempt for attempt in LOGIN_ATTEMPTS.get(key, []) if attempt > window_start]
    if len(attempts) >= LOGIN_MAX_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Quá nhiều lần đăng nhập. Vui lòng thử lại sau.")
    attempts.append(now)
    LOGIN_ATTEMPTS[key] = attempts


async def ensure_dev_student_enrollment(db: AsyncSession, user: User) -> None:
    result = await db.execute(select(CourseEnrollment).where(CourseEnrollment.student_id == user.user_id).limit(1))
    if result.scalar_one_or_none():
        return
    db.add(CourseEnrollment(student_id=user.user_id, course_id="C001", enrolled_by=None, status="active"))
    await db.flush()


@router.post("/login", response_model=UserOut)
async def login(body: LoginRequest, request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    enforce_login_rate_limit(request, body)
    user = await find_user(db, body)
    if not user:
        identifier = (body.identifier or body.student_code or "").strip()
        if not ALLOW_DEV_BOOTSTRAP or not identifier or "@" in identifier:
            raise HTTPException(status_code=401, detail="Thông tin đăng nhập không hợp lệ")
        user = User(
            user_id=f"U_{identifier}",
            role="student",
            full_name=body.full_name or identifier,
            student_code=identifier,
            password_hash=password_hash(body.password or secrets.token_urlsafe(12)),
        )
        db.add(user)
        await db.flush()
        await ensure_dev_student_enrollment(db, user)

    role = normalize_role(user.role)
    if not user.is_active or not role:
        raise HTTPException(status_code=401, detail="Thông tin đăng nhập không hợp lệ")

    if role == "student" and ALLOW_DEV_BOOTSTRAP:
        await ensure_dev_student_enrollment(db, user)

    if user.password_hash and body.password:
        if not verify_password(body.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Thông tin đăng nhập không hợp lệ")
    elif not ALLOW_DEV_BOOTSTRAP:
        raise HTTPException(status_code=401, detail="Thông tin đăng nhập không hợp lệ")

    raw_token = secrets.token_urlsafe(32)
    auth_session = AuthSession(
        session_id=f"AUTH_{secrets.token_hex(16)}",
        user_id=user.user_id,
        token_hash=token_hash(raw_token),
        expires_at=datetime.now(timezone.utc) + timedelta(hours=SESSION_TTL_HOURS),
        user_agent=request.headers.get("user-agent"),
    )
    db.add(auth_session)
    response.set_cookie(
        SESSION_COOKIE_NAME,
        raw_token,
        httponly=True,
        secure=COOKIE_SECURE,
        samesite="lax",
        max_age=SESSION_TTL_HOURS * 3600,
        path="/",
    )
    return user_out(user)


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(current_user_from_cookie)):
    return user_out(user)


@router.post("/logout")
async def logout(response: Response, db: AsyncSession = Depends(get_db), user: User = Depends(current_user_from_cookie)):
    result = await db.execute(
        select(AuthSession)
        .where(AuthSession.user_id == user.user_id)
        .where(AuthSession.revoked_at.is_(None))
    )
    now = datetime.now(timezone.utc)
    for session in result.scalars().all():
        session.revoked_at = now
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"ok": True}
