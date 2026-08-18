from datetime import date

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.profile import Gender, StudentProfile, TeacherProfile, UserProfile


async def get_gender_by_code(db: AsyncSession, code: str) -> Gender | None:
    stmt = select(Gender).where(Gender.code == code)
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_user_profile(db: AsyncSession, user_id: str) -> UserProfile | None:
    stmt = select(UserProfile).where(UserProfile.user_id == user_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def upsert_user_profile(
    db: AsyncSession,
    *,
    user_id: str,
    full_name: str,
    date_of_birth: date | None,
    gender_id: int | None,
    phone: str | None,
    avatar_url: str | None,
) -> UserProfile:
    profile = await get_user_profile(db, user_id)
    if profile is None:
        profile = UserProfile(user_id=user_id)
        db.add(profile)
    profile.full_name = full_name
    profile.date_of_birth = date_of_birth
    profile.gender_id = gender_id
    profile.phone = phone
    profile.avatar_url = avatar_url
    return profile


async def get_student_profile(db: AsyncSession, user_id: str) -> StudentProfile | None:
    stmt = select(StudentProfile).where(StudentProfile.user_id == user_id)
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_teacher_profile(db: AsyncSession, user_id: str) -> TeacherProfile | None:
    stmt = select(TeacherProfile).where(TeacherProfile.user_id == user_id)
    return (await db.execute(stmt)).scalar_one_or_none()
