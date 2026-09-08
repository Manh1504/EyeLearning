import ipaddress

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import security
from app.core.config import settings
from app.core.csrf import new_csrf_token
from app.core.ratelimit import rate_limit
from app.crud import user as user_crud
from app.db.session import get_db
from app.models.auth import User
from app.schemas.auth import LoginRequest, RefreshRequest, TokenPair, UserSummary

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _client_ip(request: Request) -> str | None:
    host = request.client.host if request.client else None
    if not host:
        return None
    try:
        return str(ipaddress.ip_address(host))
    except ValueError:
        return None


def _token_pair(user: User, access: str, refresh: str) -> TokenPair:
    return TokenPair(
        access_token=access,
        refresh_token=refresh,
        user=UserSummary(
            id=user.id,
            email=user.email,
            roles=user.role_codes,
            full_name=user.profile.full_name if user.profile else None,
        ),
    )


async def _issue_tokens(
    db: AsyncSession, user: User, request: Request
) -> TokenPair:
    access = security.create_access_token(user.id, user.role_codes)
    refresh = security.new_refresh_token()
    await user_crud.create_session(
        db,
        user_id=user.id,
        refresh_token_hash=security.hash_refresh_token(refresh),
        expires_at=security.refresh_expiry(),
        user_agent=request.headers.get("user-agent"),
        ip_address=_client_ip(request),
    )
    await user_crud.touch_last_login(db, user)
    return _token_pair(user, access, refresh)


def _set_auth_cookies(response: Response, access: str, refresh: str) -> None:
    secure = settings.cookie_secure_resolved
    # 2a hybrid: access memory + httpOnly fallback, cả 2 cookie path=/ để middleware thấy
    response.set_cookie(
        key="access_token",
        value=access,
        httponly=True,
        secure=secure,
        samesite=settings.cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
        domain=settings.cookie_domain,
    )
    # refresh_token path=/ để middleware & mọi request đều thấy, vẫn httpOnly + SameSite bảo vệ
    response.set_cookie(
        key="refresh_token",
        value=refresh,
        httponly=True,
        secure=secure,
        samesite=settings.cookie_samesite,
        max_age=settings.refresh_token_expire_days * 86400,
        path="/",
        domain=settings.cookie_domain,
    )
    # CSRF double-submit (non-httpOnly để JS đọc)
    csrf = new_csrf_token()
    response.set_cookie(
        key="csrf_token",
        value=csrf,
        httponly=False,
        secure=secure,
        samesite=settings.cookie_samesite,
        max_age=settings.refresh_token_expire_days * 86400,
        path="/",
        domain=settings.cookie_domain,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(key="access_token", path="/", domain=settings.cookie_domain)
    response.delete_cookie(key="refresh_token", path="/api/auth", domain=settings.cookie_domain)
    response.delete_cookie(key="refresh_token", path="/", domain=settings.cookie_domain)
    response.delete_cookie(key="csrf_token", path="/", domain=settings.cookie_domain)


@router.post(
    "/login",
    response_model=TokenPair,
    dependencies=[Depends(rate_limit(10, 60, "login"))],
)
async def login(
    body: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
):
    user = await user_crud.get_user_by_email(db, body.email)
    if (
        user is None
        or user.deleted_at is not None
        or user.status.code != "active"
        or not security.verify_password(body.password, user.password_hash)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email hoặc mật khẩu không đúng",
        )
    pair = await _issue_tokens(db, user, request)
    await db.commit()
    _set_auth_cookies(response, pair.access_token, pair.refresh_token)
    return pair


@router.post("/refresh", response_model=TokenPair, dependencies=[Depends(rate_limit(20, 60, "refresh"))])
async def refresh(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    # 2a hybrid: ưu tiên cookie httpOnly, fallback body để tương thích
    raw_refresh = None
    if body and body.refresh_token:
        raw_refresh = body.refresh_token
    else:
        raw_refresh = request.cookies.get("refresh_token")
    if not raw_refresh:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token không hợp lệ"
        )
    session = await user_crud.get_valid_session(
        db, security.hash_refresh_token(raw_refresh)
    )
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token không hợp lệ"
        )
    user = await user_crud.get_user_by_id(db, session.user_id)
    if user is None or user.deleted_at is not None or user.status.code != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Tài khoản không hợp lệ"
        )
    await user_crud.revoke_session(db, session)
    pair = await _issue_tokens(db, user, request)
    await db.commit()
    _set_auth_cookies(response, pair.access_token, pair.refresh_token)
    return pair


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    db: AsyncSession = Depends(get_db),
):
    raw_refresh = None
    if body and body.refresh_token:
        raw_refresh = body.refresh_token
    else:
        raw_refresh = request.cookies.get("refresh_token")
    if raw_refresh:
        session = await user_crud.get_valid_session(
            db, security.hash_refresh_token(raw_refresh)
        )
        if session is not None:
            await user_crud.revoke_session(db, session)
            await db.commit()
    _clear_auth_cookies(response)
    return {"ok": True}
