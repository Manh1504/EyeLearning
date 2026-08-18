from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.auth import User
from app.models.course import Course, Lesson, LessonContent, Module
from app.schemas.analytics import SlideStatOut
from app.services import analytics

router = APIRouter(tags=["analytics"])


async def _lesson_with_owner_check(
    db: AsyncSession, lesson_id: str, user: User
) -> Lesson:
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài học")
    module = await db.get(Module, lesson.module_id)
    course = await db.get(Course, module.course_id) if module else None
    if course is None or (
        course.teacher_id != user.id and "admin" not in user.role_codes
    ):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    return lesson


@router.get("/teacher/lessons/{lesson_id}/heatmap", response_model=list[SlideStatOut])
async def get_lesson_heatmap(
    lesson_id: str,
    student_id: str | None = Query(default=None),
    content_id: str | None = Query(default=None),
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    await _lesson_with_owner_check(db, lesson_id, user)
    stats = await analytics.compute_slide_stats(db, lesson_id, student_id)
    if content_id:
        slides = (
            await db.execute(
                select(LessonContent.id, LessonContent.order_index)
                .where(LessonContent.lesson_id == lesson_id)
                .order_by(LessonContent.order_index)
            )
        ).all()
        for i, (sid, _) in enumerate(slides):
            if sid == content_id and i < len(stats):
                return [stats[i]]
    return stats


@router.post("/teacher/courses/{course_id}/recompute")
async def recompute_course_analytics(
    course_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    course = await db.get(Course, course_id)
    if course is None or course.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khóa học")
    if course.teacher_id != user.id and "admin" not in user.role_codes:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    lesson_ids = list(
        (
            await db.execute(
                select(Lesson.id)
                .join(Module, Module.id == Lesson.module_id)
                .where(Module.course_id == course_id)
            )
        ).scalars().all()
    )
    total = 0
    for lid in lesson_ids:
        total += await analytics.recompute_lesson_aggregates(db, lid)
    await db.commit()
    return {"ok": True, "aggregates": total}
