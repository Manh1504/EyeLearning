import logging
from time import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from web.authz import current_user_from_cookie, ensure_student_can_access_course_item, ensure_student_owns_session, normalize_role
from web.database import get_db
from web.models import CourseItem, PDFLesson, Session, User
from web.schemas import SessionOut

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sessions", tags=["sessions"])


class SessionCreate(BaseModel):
    session_id: Optional[str] = None
    course_id: Optional[str] = None
    course_item_id: Optional[str] = None
    pdf_lesson_id: Optional[str] = None
    test_id: Optional[str] = None
    lesson_id: Optional[str] = None
    calibration_group_id: Optional[str] = None
    is_fullscreen: Optional[bool] = None
    viewport_w: Optional[int] = None
    viewport_h: Optional[int] = None


class ProfileSetupSessionCreate(BaseModel):
    viewport_w: Optional[int] = None
    viewport_h: Optional[int] = None
    is_fullscreen: Optional[bool] = None


@router.post("", response_model=SessionOut)
async def create_session(
    body: SessionCreate,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role not in {"student", "admin"}:
        raise HTTPException(status_code=403, detail="Chỉ student hoặc admin mới được tạo session")
    if not body.course_item_id:
        raise HTTPException(status_code=400, detail="course_item_id là bắt buộc")

    item = await db.scalar(select(CourseItem).where(CourseItem.course_item_id == body.course_item_id))
    if not item:
        raise HTTPException(status_code=404, detail="Course item không tồn tại")
    if role == "student":
        await ensure_student_can_access_course_item(db, user, body.course_item_id)

    pdf_lesson = None
    if item.item_type == "PDF_LESSON":
        pdf_lesson = await db.scalar(select(PDFLesson).where(PDFLesson.course_item_id == item.course_item_id))
        if not pdf_lesson:
            raise HTTPException(status_code=500, detail="PDF lesson chưa được cấu hình đầy đủ")

    session = Session(
        session_id=body.session_id or f"S_{user.user_id}_{int(time() * 1000)}",
        user_id=user.user_id,
        lesson_id=body.lesson_id,
        course_id=item.course_id,
        course_item_id=item.course_item_id,
        pdf_lesson_id=pdf_lesson.pdf_lesson_id if pdf_lesson else None,
        pdf_document_version=pdf_lesson.storage_key if pdf_lesson else None,
        test_id=body.test_id,
        calibration_group_id=body.calibration_group_id,
        is_fullscreen=body.is_fullscreen,
        viewport_w=body.viewport_w,
        viewport_h=body.viewport_h,
        session_type="admin_test" if role == "admin" else "student_learning",
        created_by_role=role,
        status="preparing",
    )
    db.add(session)
    await db.flush()
    return session


@router.post("/profile-setup", response_model=SessionOut)
async def create_profile_setup_session(
    body: ProfileSetupSessionCreate,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role != "student":
        raise HTTPException(status_code=403, detail="Chỉ học sinh mới được tạo phiên hiệu chuẩn cá nhân")
    session = Session(
        session_id=f"S_PROFILE_{user.user_id}_{int(time() * 1000)}",
        user_id=user.user_id,
        is_fullscreen=body.is_fullscreen,
        viewport_w=body.viewport_w,
        viewport_h=body.viewport_h,
        # Schema production/dev hiện tại chưa cho phép giá trị "profile_setup".
        # Dùng "student_learning" để giữ session student-owned hợp lệ cho
        # calibration/account-level profile management mà không cần migration mới.
        session_type="student_learning",
        created_by_role=role,
        status="preparing",
    )
    db.add(session)
    await db.flush()
    return session


@router.get("/{session_id}", response_model=SessionOut)
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
    if role == "admin" or session.user_id == user.user_id:
        return session
    raise HTTPException(status_code=403, detail="Bạn không có quyền xem phiên này")


@router.patch("/{session_id}/finish", response_model=SessionOut)
async def finish_session(
    session_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    session = await ensure_student_owns_session(db, user, session_id)
    session.status = "finished"
    if session.ended_at is None:
        from datetime import datetime, timezone

        session.ended_at = datetime.now(timezone.utc)
    await db.flush()
    return session
