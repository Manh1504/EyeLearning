from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.auth import AuthSession, Role, User, UserRole, UserStatus


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    stmt = (
        select(User)
        .options(selectinload(User.roles))
        .where(User.email == email.lower())
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    stmt = (
        select(User)
        .options(selectinload(User.roles))
        .where(User.id == user_id)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def touch_last_login(db: AsyncSession, user: User) -> None:
    user.last_login_at = datetime.now(timezone.utc)


async def create_session(
    db: AsyncSession,
    *,
    user_id: str,
    refresh_token_hash: str,
    expires_at: datetime,
    user_agent: str | None,
    ip_address: str | None,
) -> AuthSession:
    session = AuthSession(
        user_id=user_id,
        refresh_token_hash=refresh_token_hash,
        user_agent=user_agent,
        ip_address=ip_address,
        expires_at=expires_at,
    )
    db.add(session)
    return session


async def get_valid_session(db: AsyncSession, refresh_token_hash: str) -> AuthSession | None:
    stmt = select(AuthSession).where(
        AuthSession.refresh_token_hash == refresh_token_hash,
        AuthSession.revoked_at.is_(None),
        AuthSession.expires_at > datetime.now(timezone.utc),
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def revoke_session(db: AsyncSession, session: AuthSession) -> None:
    session.revoked_at = datetime.now(timezone.utc)


async def revoke_all_sessions(
    db: AsyncSession, user_id: str, except_token_hash: str | None = None
) -> None:
    """Thu hồi toàn bộ refresh session còn hiệu lực của user.

    Dùng khi đổi mật khẩu để các phiên đăng nhập khác (thiết bị khác) phải
    đăng nhập lại bằng mật khẩu mới. `except_token_hash` giữ lại phiên hiện tại
    (tránh đăng xuất chính người vừa đổi mật khẩu).
    """
    now = datetime.now(timezone.utc)
    stmt = select(AuthSession).where(
        AuthSession.user_id == user_id,
        AuthSession.revoked_at.is_(None),
        AuthSession.expires_at > now,
    )
    for session in (await db.execute(stmt)).scalars():
        if except_token_hash is not None and session.refresh_token_hash == except_token_hash:
            continue
        session.revoked_at = now


async def create_student(
    db: AsyncSession,
    *,
    email: str,
    password_hash: str,
    full_name: str,
) -> User:
    """Tạo user mới với role `student` và status `active`.

    Không tạo student_profile/student_code (do admin cấp sau) — hồ sơ cơ bản
    nằm ở user_profiles.
    """
    status_id = (
        await db.execute(select(UserStatus.id).where(UserStatus.code == "active"))
    ).scalar_one()
    role_id = (
        await db.execute(select(Role.id).where(Role.code == "student"))
    ).scalar_one()

    user = User(
        email=email.lower(),
        password_hash=password_hash,
        status_id=status_id,
    )
    db.add(user)
    await db.flush()

    db.add(UserRole(user_id=user.id, role_id=role_id))

    from app.models.profile import UserProfile

    db.add(UserProfile(user_id=user.id, full_name=full_name, email=email.lower()))

    await db.flush()
    await db.refresh(user)
    return user
