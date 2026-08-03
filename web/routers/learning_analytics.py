from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from web.authz import current_user_from_cookie, ensure_can_read_session_analytics, normalize_role, require_role, teacher_can_access_lesson
from web.database import get_db
from web.models import Lesson, Session, User
from web.services.learning_analytics_service import build_lesson_analytics, build_session_analytics

router = APIRouter(prefix="/learning-analytics", tags=["learning-analytics"])


async def _ensure_can_read_lesson_analytics(db: AsyncSession, user: User, lesson_id: str) -> None:
    result = await db.execute(select(Lesson.lesson_id).where(Lesson.lesson_id == lesson_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Lesson không tồn tại")

    role = require_role(user, {"teacher", "admin"})
    if role == "admin":
        return
    if await teacher_can_access_lesson(db, user, lesson_id):
        return
    raise HTTPException(status_code=403, detail="Bạn không có quyền xem analytics của bài học này")


@router.get("/lessons/{lesson_id}")
async def get_lesson_learning_analytics(
    lesson_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_can_read_lesson_analytics(db, user, lesson_id)
    return await build_lesson_analytics(db, lesson_id)


@router.get("/sessions/{session_id}")
async def get_session_learning_analytics(
    session_id: str,
    include_cohort: bool = Query(default=True),
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    session = await ensure_can_read_session_analytics(db, user, session_id)
    if (session.session_type or "student_learning") != "student_learning":
        role = normalize_role(user.role)
        if role != "admin":
            raise HTTPException(status_code=403, detail="Chỉ quản trị viên được xem analytics phiên kiểm thử")
    payload = await build_session_analytics(db, session_id)
    if not include_cohort:
        payload["cohort_slide_rows"] = []
        payload["lsa"] = {**payload["lsa"], "transitions": [], "representative_sequences": []}
    return payload
