import logging
import base64
import hashlib
import hmac
import json
import os
from datetime import datetime, timezone
from time import time
from typing import Literal, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from web.authz import current_user_from_cookie, ensure_student_can_access_course_item, ensure_student_owns_session, normalize_role
from web.database import get_db
from web.models import CourseItem, PDFLesson, PDFLessonProgress, Session, User
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


class ClosePdfSessionRequest(BaseModel):
    last_page_number: int
    max_page_number_seen: int
    action: Literal["complete", "exit"]


class TrackingTokenOut(BaseModel):
    session_id: str
    token: str
    expires_at: int


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _tracking_token_secret() -> str:
    return os.getenv("TRACKING_TOKEN_SECRET", "dev-tracking-token-secret")


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _sign_tracking_token(session_id: str, ttl_seconds: int = 600) -> tuple[str, int]:
    expires_at = int(time()) + ttl_seconds
    payload = {
        "session_id": session_id,
        "exp": expires_at,
        "purpose": "ai_tracking",
    }
    payload_part = _b64url(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    signature = hmac.new(
        _tracking_token_secret().encode("utf-8"),
        payload_part.encode("ascii"),
        hashlib.sha256,
    ).digest()
    return f"{payload_part}.{_b64url(signature)}", expires_at


def _clamped_page(value: int, page_count: int) -> int:
    return min(max(1, int(value or 1)), max(1, page_count))


async def _update_pdf_progress_for_session(
    db: AsyncSession,
    session: Session,
    pdf_lesson: PDFLesson,
    *,
    last_page_number: int,
    max_page_number_seen: int,
    completed: bool,
) -> PDFLessonProgress:
    page_count = pdf_lesson.page_count or 1
    last_page = _clamped_page(last_page_number, page_count)
    max_seen = _clamped_page(max(max_page_number_seen, last_page), page_count)

    progress = await db.scalar(
        select(PDFLessonProgress).where(
            PDFLessonProgress.pdf_lesson_id == pdf_lesson.pdf_lesson_id,
            PDFLessonProgress.user_id == session.user_id,
        )
    )
    if not progress:
        course_id = session.course_id
        if not course_id:
            item = await db.scalar(select(CourseItem).where(CourseItem.course_item_id == pdf_lesson.course_item_id))
            course_id = item.course_id if item else None
        if not course_id:
            raise HTTPException(status_code=400, detail="Session không gắn với khóa học hợp lệ")
        progress = PDFLessonProgress(
            progress_id=f"PLP_{session.user_id}_{pdf_lesson.pdf_lesson_id}",
            user_id=session.user_id,
            course_id=course_id,
            course_item_id=session.course_item_id or pdf_lesson.course_item_id,
            pdf_lesson_id=pdf_lesson.pdf_lesson_id,
        )
        db.add(progress)

    progress.last_page_number = last_page
    progress.max_page_number_seen = max(progress.max_page_number_seen or 1, max_seen, progress.last_page_number)
    if completed:
        progress.completed_at = _utc_now()
    return progress


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
        last_heartbeat_at=_utc_now(),
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
        last_heartbeat_at=_utc_now(),
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
    if session.status in {"finished", "abandoned", "failed"}:
        return session
    if session.pdf_lesson_id:
        raise HTTPException(status_code=409, detail="Hãy dùng endpoint close để kết thúc phiên PDF.")
    session.status = "finished"
    session.ended_at = session.ended_at or _utc_now()
    await db.flush()
    return session


@router.patch("/{session_id}/close", response_model=SessionOut)
async def close_session(
    session_id: str,
    body: ClosePdfSessionRequest,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    session = await ensure_student_owns_session(db, user, session_id)

    if session.status in {"finished", "abandoned", "failed"}:
        return session

    if not session.pdf_lesson_id:
        raise HTTPException(status_code=400, detail="Session không gắn với PDF lesson hợp lệ")

    pdf_lesson = await db.scalar(select(PDFLesson).where(PDFLesson.pdf_lesson_id == session.pdf_lesson_id))
    if not pdf_lesson:
        raise HTTPException(status_code=400, detail="Session không gắn với PDF lesson hợp lệ")

    page_count = pdf_lesson.page_count or 1
    max_seen = _clamped_page(max(body.max_page_number_seen, body.last_page_number), page_count)

    if body.action == "complete":
        if max_seen < page_count:
            raise HTTPException(status_code=409, detail="Bạn chưa xem tới trang cuối của bài học.")
        session.status = "finished"
        completed = True
    else:
        session.status = "abandoned"
        completed = False

    await _update_pdf_progress_for_session(
        db,
        session,
        pdf_lesson,
        last_page_number=body.last_page_number,
        max_page_number_seen=max_seen,
        completed=completed,
    )
    session.ended_at = _utc_now()
    session.last_heartbeat_at = session.ended_at
    await db.flush()
    return session


@router.patch("/{session_id}/heartbeat")
async def heartbeat_session(
    session_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    session = await ensure_student_owns_session(db, user, session_id)
    if session.status not in {"preparing", "validating", "learning"}:
        return {"ok": True, "ignored": True}

    session.last_heartbeat_at = _utc_now()
    await db.flush()
    return {"ok": True}


@router.post("/{session_id}/tracking-token", response_model=TrackingTokenOut)
async def create_tracking_token(
    session_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    session = await ensure_student_owns_session(db, user, session_id)
    if session.status not in {"preparing", "validating", "learning"}:
        raise HTTPException(status_code=409, detail="Phiên không còn nhận tracking.")
    token, expires_at = _sign_tracking_token(session.session_id)
    return {"session_id": session.session_id, "token": token, "expires_at": expires_at}
