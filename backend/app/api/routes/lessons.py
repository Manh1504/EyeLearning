from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.auth import User
from app.models.course import (
    Course,
    Enrollment,
    Lesson,
    LessonContent,
    LessonProgress,
    Module,
)
from app.schemas.course import LessonCreateIn, SlideCreateIn, SlideOut
from app.schemas.gaze import OkOut, ProgressPatchIn

router = APIRouter(tags=["lessons"])


async def _get_lesson_or_404(db: AsyncSession, lesson_id: str) -> Lesson:
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài học")
    return lesson


async def _check_course_owner(db: AsyncSession, lesson: Lesson, user: User) -> None:
    module = await db.get(Module, lesson.module_id)
    course = await db.get(Course, module.course_id) if module else None
    if course is None or course.teacher_id != user.id and "admin" not in user.role_codes:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")


async def _get_enrollment_for_lesson(
    db: AsyncSession, lesson: Lesson, user: User
) -> Enrollment | None:
    module = await db.get(Module, lesson.module_id)
    if module is None:
        return None
    stmt = select(Enrollment).where(
        Enrollment.course_id == module.course_id, Enrollment.student_id == user.id
    )
    return (await db.execute(stmt)).scalar_one_or_none()


@router.post(
    "/teacher/modules/{module_id}/lessons", response_model=dict, status_code=201
)
async def create_lesson(
    module_id: str,
    body: LessonCreateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    module = await db.get(Module, module_id)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy chương")
    course = await db.get(Course, module.course_id)
    if course is None or course.teacher_id != user.id and "admin" not in user.role_codes:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    next_index = (
        await db.execute(
            select(func.coalesce(func.max(Lesson.order_index), 0) + 1).where(
                Lesson.module_id == module_id
            )
        )
    ).scalar_one()
    lesson = Lesson(
        module_id=module_id,
        title=body.title,
        order_index=next_index,
        content_url=body.content_url,
    )
    db.add(lesson)
    await db.commit()
    await db.refresh(lesson)
    return {"id": lesson.id, "title": lesson.title, "orderIndex": lesson.order_index}


@router.patch("/teacher/lessons/{lesson_id}")
async def update_lesson(
    lesson_id: str,
    body: LessonCreateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_or_404(db, lesson_id)
    await _check_course_owner(db, lesson, user)
    lesson.title = body.title
    if body.content_url is not None:
        lesson.content_url = body.content_url
    await db.commit()
    return {"ok": True}


@router.delete("/teacher/lessons/{lesson_id}")
async def delete_lesson(
    lesson_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_or_404(db, lesson_id)
    await _check_course_owner(db, lesson, user)
    await db.delete(lesson)
    await db.commit()
    return {"ok": True}


@router.post("/teacher/lessons/{lesson_id}/slides", status_code=201)
async def add_slide(
    lesson_id: str,
    body: SlideCreateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_or_404(db, lesson_id)
    await _check_course_owner(db, lesson, user)
    next_index = (
        await db.execute(
            select(func.coalesce(func.max(LessonContent.order_index), 0) + 1).where(
                LessonContent.lesson_id == lesson_id
            )
        )
    ).scalar_one()
    slide = LessonContent(
        lesson_id=lesson_id,
        order_index=next_index,
        image_url=body.image_url,
        content_json={"title": body.title} if body.title else {},
    )
    db.add(slide)
    await db.commit()
    await db.refresh(slide)
    return {"id": slide.id, "orderIndex": slide.order_index}


@router.delete("/teacher/slides/{slide_id}")
async def delete_slide(
    slide_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    slide = await db.get(LessonContent, slide_id)
    if slide is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy slide")
    lesson = await db.get(Lesson, slide.lesson_id)
    await _check_course_owner(db, lesson, user)
    await db.delete(slide)
    await db.commit()
    return {"ok": True}


@router.get("/api/lessons/{lesson_id}/contents", response_model=list[SlideOut])
async def get_lesson_contents(
    lesson_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_or_404(db, lesson_id)
    enrollment = await _get_enrollment_for_lesson(db, lesson, user)
    module = await db.get(Module, lesson.module_id)
    course = await db.get(Course, module.course_id) if module else None
    is_owner = course is not None and (
        course.teacher_id == user.id or "admin" in user.role_codes
    )
    if not is_owner and enrollment is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Chưa đăng ký khóa học")
    stmt = (
        select(LessonContent)
        .where(LessonContent.lesson_id == lesson_id)
        .order_by(LessonContent.order_index)
    )
    slides = (await db.execute(stmt)).scalars().all()
    return [
        SlideOut(
            id=s.id,
            title=s.content_json.get("title") or f"Slide {s.order_index}",
            image_url=s.image_url,
        )
        for s in slides
    ]


@router.patch("/api/lessons/{lesson_id}/progress", response_model=OkOut)
async def patch_lesson_progress(
    lesson_id: str,
    body: ProgressPatchIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_or_404(db, lesson_id)
    enrollment = await _get_enrollment_for_lesson(db, lesson, user)
    if enrollment is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Chưa đăng ký khóa học")

    stmt = select(LessonProgress).where(
        LessonProgress.enrollment_id == enrollment.id,
        LessonProgress.lesson_id == lesson_id,
    )
    progress = (await db.execute(stmt)).scalar_one_or_none()
    if progress is None:
        progress = LessonProgress(enrollment_id=enrollment.id, lesson_id=lesson_id)
        db.add(progress)

    slide_order = body.last_slide + 1
    viewed = set(progress.viewed_slides or [])
    viewed.add(slide_order)
    progress.viewed_slides = sorted(viewed)
    progress.last_watched_at = datetime.now(timezone.utc)

    total_slides = (
        await db.execute(
            select(func.count(LessonContent.id)).where(
                LessonContent.lesson_id == lesson_id
            )
        )
    ).scalar_one()
    if body.completed or (total_slides and len(viewed) >= total_slides):
        progress.status = "completed"
        progress.completed_at = progress.completed_at or datetime.now(timezone.utc)
    await db.commit()
    return OkOut()
