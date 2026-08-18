from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.auth import AuthSession, User


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    stmt = (
        select(User)
        .options(selectinload(User.roles))
        .where(User.email == email.lower())
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_user_by_id(db: AsyncSession, user_id: str) -> User | None:
    stmt = select(User).options(selectinload(User.roles)).where(User.id == user_id)
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
