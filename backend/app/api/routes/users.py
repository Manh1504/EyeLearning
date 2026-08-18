from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.crud import profile as profile_crud
from app.db.session import get_db
from app.models.auth import User
from app.schemas.user import ProfileOut, ProfileUpdate

router = APIRouter(prefix="/api/me", tags=["me"])


def _primary_role(user: User) -> str:
    for code in ("teacher", "student", "admin"):
        if code in user.role_codes:
            return code
    return user.role_codes[0] if user.role_codes else "student"


async def _build_profile(db: AsyncSession, user: User) -> ProfileOut:
    profile = user.profile
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Chưa có hồ sơ")
    role = _primary_role(user)
    data = ProfileOut(
        role=role,
        email=user.email,
        full_name=profile.full_name,
        date_of_birth=profile.date_of_birth,
        gender=profile.gender.code if profile.gender else None,
        phone=profile.phone,
        avatar_url=profile.avatar_url,
        created_at=user.created_at,
    )
    if role == "student":
        sp = await profile_crud.get_student_profile(db, user.id)
        if sp:
            data.student_code = sp.student_code
            data.program = sp.program
    elif role == "teacher":
        tp = await profile_crud.get_teacher_profile(db, user.id)
        if tp:
            data.teacher_code = tp.teacher_code
            data.department = tp.department
    return data


@router.get("/profile", response_model=ProfileOut)
async def get_my_profile(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    return await _build_profile(db, user)


@router.patch("/profile", response_model=ProfileOut)
async def update_my_profile(
    body: ProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    gender_id = None
    if body.gender:
        gender = await profile_crud.get_gender_by_code(db, body.gender)
        if gender is None:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Gender không hợp lệ")
        gender_id = gender.id
    await profile_crud.upsert_user_profile(
        db,
        user_id=user.id,
        full_name=body.full_name,
        date_of_birth=body.date_of_birth,
        gender_id=gender_id,
        phone=body.phone,
        avatar_url=body.avatar_url,
    )
    role = _primary_role(user)
    if role == "student" and body.program is not None:
        sp = await profile_crud.get_student_profile(db, user.id)
        if sp:
            sp.program = body.program
    if role == "teacher" and body.department is not None:
        tp = await profile_crud.get_teacher_profile(db, user.id)
        if tp:
            tp.department = body.department
    await db.commit()
    await db.refresh(user)
    return await _build_profile(db, user)
