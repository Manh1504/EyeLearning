import logging
from datetime import datetime, timezone
from time import time
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from web.database import AsyncSessionLocal, get_db
from web.models import Lesson, Session, User
from web.schemas import SessionOut
from web.services.heatmap_service import generate_heatmap_for_session

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])


class SessionCreate(BaseModel):
    session_id: Optional[str] = None
    student_code: str
    full_name: Optional[str] = None
    role: Optional[str] = "student"
    lesson_id: Optional[str] = None
    lecture_id: Optional[str] = Field(default=None, description="Backward-compatible alias for lesson_id")
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


@router.post("", response_model=SessionOut, summary="Tạo session mới khi user bắt đầu học")
async def create_session(body: SessionCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.student_code == body.student_code))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            user_id=f"U_{body.student_code}",
            role=body.role or "student",
            full_name=body.full_name or body.student_code,
            student_code=body.student_code,
        )
        db.add(user)
        await db.flush()
    elif body.full_name and user.full_name != body.full_name:
        user.full_name = body.full_name
    if body.role and user.role != body.role:
        user.role = body.role

    lesson_id = body.lesson_id or body.lecture_id or await _get_default_lesson_id(db)
    result = await db.execute(select(Lesson.lesson_id).where(Lesson.lesson_id == lesson_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Lesson không tồn tại")

    session = Session(
        session_id=body.session_id or f"S_{body.student_code}_{int(time() * 1000)}",
        user_id=user.user_id,
        lesson_id=lesson_id,
        calibration_group_id=body.calibration_group_id,
        is_fullscreen=body.is_fullscreen,
        viewport_w=body.viewport_w or body.screen_width,
        viewport_h=body.viewport_h or body.screen_height,
    )
    db.add(session)
    await db.flush()

    return session


@router.get("/{session_id}", response_model=SessionOut, summary="Lấy thông tin session")
async def get_session(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.session_id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")
    return session


@router.patch("/{session_id}/load-lecture", response_model=SessionOut, summary="Backward-compatible lesson load")
async def load_lecture(session_id: str, body: SessionLoadLesson, db: AsyncSession = Depends(get_db)):
    return await load_lesson(session_id, body, db)


@router.patch("/{session_id}/load-lesson", response_model=SessionOut, summary="User bấm load bài học")
async def load_lesson(session_id: str, body: SessionLoadLesson, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.session_id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    lesson_id = body.lesson_id or body.lecture_id
    if not lesson_id:
        raise HTTPException(status_code=400, detail="lesson_id là bắt buộc")

    result = await db.execute(select(Lesson.lesson_id).where(Lesson.lesson_id == lesson_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Lesson không tồn tại")

    session.lesson_id = lesson_id
    return session


async def _render_heatmap_in_background(session_id: str) -> None:
    """Chạy sau khi response /finish đã trả về, dùng DB session riêng vì
    session của request gốc đã đóng lúc response return."""
    async with AsyncSessionLocal() as db:
        try:
            await generate_heatmap_for_session(db, session_id=session_id, aoi_key=None)
            await db.commit()
        except Exception:
            await db.rollback()
            logger.exception("Auto-generate heatmap failed for session_id=%s", session_id)


@router.patch("/{session_id}/finish", response_model=SessionOut, summary="User bấm Finish")
async def finish_session(
    session_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Session).where(Session.session_id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")
    if session.status == "finished":
        raise HTTPException(status_code=400, detail="Session đã kết thúc")

    session.ended_at = datetime.now(timezone.utc)
    session.status = "finished"

    # Heatmap sinh ở background, KHÔNG chặn response /finish — user bấm Finish
    # thấy phản hồi ngay, không phải đợi render ảnh xong.
    background_tasks.add_task(_render_heatmap_in_background, session_id)

    return session
