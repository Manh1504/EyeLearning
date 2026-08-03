import logging
from datetime import datetime, timezone
from time import time
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from web.database import AsyncSessionLocal, get_db
from web.authz import current_user_from_cookie, ensure_student_can_access_lesson, ensure_student_owns_session, normalize_role
from web.models import Lesson, LessonActivity, Session, User
from web.schemas import SessionOut
from web.services.heatmap_service import generate_slide_heatmaps_for_session
from web.services.lesson_seed_service import ensure_mlops_data_lesson
from web.services.metrics_service import calculate_aoi_metrics_for_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])


class SessionCreate(BaseModel):
    session_id: Optional[str] = None
    user_id: Optional[str] = None
    student_code: Optional[str] = None
    full_name: Optional[str] = None
    role: Optional[str] = None
    session_type: Optional[str] = "student_learning"
    lesson_id: Optional[str] = None
    lecture_id: Optional[str] = Field(default=None, description="Backward-compatible alias for lesson_id")
    course_id: Optional[str] = None
    module_id: Optional[str] = None
    activity_id: Optional[str] = None
    content_version_id: Optional[str] = None
    calibration_group_id: Optional[str] = None
    is_fullscreen: Optional[bool] = None
    viewport_w: Optional[int] = None
    viewport_h: Optional[int] = None
    screen_width: Optional[int] = Field(default=None, description="Legacy alias for viewport_w")
    screen_height: Optional[int] = Field(default=None, description="Legacy alias for viewport_h")


class SessionLoadLesson(BaseModel):
    lesson_id: Optional[str] = None
    lecture_id: Optional[str] = Field(default=None, description="Backward-compatible alias for lesson_id")


async def _get_default_lesson_id(db: AsyncSession) -> str:
    result = await db.execute(select(Lesson.lesson_id).order_by(Lesson.created_at).limit(1))
    lesson_id = result.scalar_one_or_none()
    if not lesson_id:
        raise HTTPException(status_code=404, detail="Chưa có lesson để tạo session")
    return lesson_id


async def _resolve_activity_context(
    db: AsyncSession,
    lesson_id: str,
    activity_id: Optional[str],
) -> tuple[Optional[str], Optional[str], Optional[str], Optional[str]]:
    lesson_result = await db.execute(
        select(Lesson.course_id, Lesson.module_id).where(Lesson.lesson_id == lesson_id)
    )
    lesson_row = lesson_result.one_or_none()
    if not lesson_row:
        return None, None, None, None

    activity_stmt = select(
        LessonActivity.activity_id,
        LessonActivity.content_version_id,
    ).where(LessonActivity.lesson_id == lesson_id)
    if activity_id:
        activity_stmt = activity_stmt.where(LessonActivity.activity_id == activity_id)
    activity_stmt = activity_stmt.order_by(LessonActivity.order_index, LessonActivity.created_at).limit(1)
    activity_result = await db.execute(activity_stmt)
    activity_row = activity_result.one_or_none()
    resolved_activity_id = activity_row.activity_id if activity_row else activity_id
    resolved_version_id = activity_row.content_version_id if activity_row else None
    return lesson_row.course_id, lesson_row.module_id, resolved_activity_id, resolved_version_id


@router.post("", response_model=SessionOut, summary="Tạo session mới khi user bắt đầu học")
async def create_session(
    body: SessionCreate,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    session_type = body.session_type or "student_learning"
    if session_type not in {"student_learning", "admin_test"}:
        raise HTTPException(status_code=400, detail="session_type không hợp lệ")
    if session_type == "admin_test" and role != "admin":
        raise HTTPException(status_code=403, detail="Chỉ admin được tạo phiên kiểm thử")
    if session_type == "student_learning" and role != "student":
        raise HTTPException(status_code=403, detail="Chỉ student được tạo phiên học chính thức")

    lesson_id = body.lesson_id or body.lecture_id or await _get_default_lesson_id(db)
    if lesson_id == "L002":
        await ensure_mlops_data_lesson(db)
    result = await db.execute(select(Lesson.lesson_id).where(Lesson.lesson_id == lesson_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Lesson không tồn tại")
    if session_type == "student_learning":
        await ensure_student_can_access_lesson(db, user, lesson_id)

    course_id, module_id, activity_id, content_version_id = await _resolve_activity_context(
        db,
        lesson_id,
        body.activity_id,
    )

    session = Session(
        session_id=body.session_id or f"S_{user.user_id}_{int(time() * 1000)}",
        user_id=user.user_id,
        lesson_id=lesson_id,
        course_id=body.course_id or course_id,
        module_id=body.module_id or module_id,
        activity_id=body.activity_id or activity_id,
        content_version_id=body.content_version_id or content_version_id,
        calibration_group_id=body.calibration_group_id,
        is_fullscreen=body.is_fullscreen,
        viewport_w=body.viewport_w or body.screen_width,
        viewport_h=body.viewport_h or body.screen_height,
        session_type=session_type,
        created_by_role=role,
        status="preparing" if session_type == "student_learning" else "preparing",
    )
    db.add(session)
    await db.flush()

    return session


@router.get("/{session_id}", response_model=SessionOut, summary="Lấy thông tin session")
async def get_session(
    session_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Session).where(Session.session_id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")
    role = normalize_role(user.role)
    if role == "admin":
        return session
    if session.user_id == user.user_id:
        return session
    if role == "teacher":
        from web.authz import teacher_can_access_lesson
        if session.session_type == "student_learning" and await teacher_can_access_lesson(db, user, session.lesson_id):
            return session
    raise HTTPException(status_code=403, detail="Bạn không có quyền xem phiên này")
    return session


@router.patch("/{session_id}/load-lecture", response_model=SessionOut, summary="Backward-compatible lesson load")
async def load_lecture(
    session_id: str,
    body: SessionLoadLesson,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    return await load_lesson(session_id, body, user, db)


@router.patch("/{session_id}/load-lesson", response_model=SessionOut, summary="User bấm load bài học")
async def load_lesson(
    session_id: str,
    body: SessionLoadLesson,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Session).where(Session.session_id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")
    if session.user_id != user.user_id:
        raise HTTPException(status_code=403, detail="Bạn không có quyền thao tác với phiên này")

    lesson_id = body.lesson_id or body.lecture_id
    if not lesson_id:
        raise HTTPException(status_code=400, detail="lesson_id là bắt buộc")

    result = await db.execute(select(Lesson.lesson_id).where(Lesson.lesson_id == lesson_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Lesson không tồn tại")
    if session.session_type == "student_learning":
        await ensure_student_can_access_lesson(db, user, lesson_id)

    session.lesson_id = lesson_id
    course_id, module_id, activity_id, content_version_id = await _resolve_activity_context(db, lesson_id, None)
    session.course_id = course_id
    session.module_id = module_id
    session.activity_id = activity_id
    session.content_version_id = content_version_id
    return session


async def _render_heatmap_in_background(session_id: str) -> None:
    """Chạy sau khi response /finish đã trả về, dùng DB session riêng vì
    session của request gốc đã đóng lúc response return."""
    async with AsyncSessionLocal() as db:
        try:
            await calculate_aoi_metrics_for_session(db, session_id=session_id)
            await generate_slide_heatmaps_for_session(db, session_id=session_id)
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("Auto-generate heatmap failed for session_id=%s", session_id)


@router.patch("/{session_id}/finish", response_model=SessionOut, summary="User bấm Finish")
async def finish_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    session = await ensure_student_owns_session(db, user, session_id)
    if session.status == "finished":
        raise HTTPException(status_code=400, detail="Session đã kết thúc")

    session.ended_at = datetime.now(timezone.utc)
    session.status = "finished"

    # Heatmap sinh ở background, KHÔNG chặn response /finish — user bấm Finish
    # thấy phản hồi ngay, không phải đợi render ảnh xong.
    background_tasks.add_task(_render_heatmap_in_background, session_id)

    return session
