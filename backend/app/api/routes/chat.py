"""API chat học tập của sinh viên: phiên, lịch sử tin nhắn và gửi câu hỏi.

Phạm vi hỏi là một môn (course). Khi hỏi trong ngữ cảnh bài tập đã nộp, backend
gửi kèm `assignment_id` để chữa bài. Mọi truy cập đều kiểm tra: đúng vai trò
`student`, đã ghi danh môn, và phiên thuộc chính sinh viên đó.
"""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.core.ratelimit import rate_limit
from app.db.session import get_db
from app.models.auth import User
from app.models.chat import ChatMessage, ChatSession
from app.models.course import Course, Enrollment, Lesson, Module
from app.models.quiz import QuizAssignment, QuizAttempt
from app.schemas.chat import (
    ChatMessageOut,
    ChatReplyOut,
    ChatSendIn,
    ChatSessionOut,
    ChatSessionUpdate,
)
from app.services.study_chat import answer_in_session, purge_thread

router = APIRouter(tags=["chat"])

NEW_TITLE = "Phiên mới"


async def _course_or_404(db: AsyncSession, course_id: str) -> Course:
    course = await db.get(Course, course_id)
    if course is None or course.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khóa học")
    return course


async def _require_enrolled(db: AsyncSession, course_id: str, user: User) -> None:
    stmt = select(Enrollment.id).where(
        Enrollment.course_id == course_id,
        Enrollment.student_id == user.id,
        Enrollment.status == "active",
    )
    if (await db.execute(stmt)).scalar_one_or_none() is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, detail="Bạn chưa tham gia khóa học"
        )


async def _session_or_404(db: AsyncSession, session_id: str, user: User) -> ChatSession:
    session = await db.get(ChatSession, session_id)
    if session is None or session.student_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiên chat")
    return session


async def _message_count(db: AsyncSession, session_id: str) -> int:
    stmt = select(func.count(ChatMessage.id)).where(ChatMessage.session_id == session_id)
    return int((await db.execute(stmt)).scalar_one())


async def _session_out(db: AsyncSession, session: ChatSession) -> ChatSessionOut:
    return ChatSessionOut(
        id=session.id,
        course_id=session.course_id,
        lesson_id=session.lesson_id,
        assignment_id=session.assignment_id,
        title=session.title,
        message_count=await _message_count(db, session.id),
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


async def _resolve_lesson(
    db: AsyncSession, course: Course, lesson_id: str | None
) -> Lesson | None:
    if lesson_id is None:
        return None
    lesson = await db.get(Lesson, lesson_id)
    module = await db.get(Module, lesson.module_id) if lesson is not None else None
    if lesson is None or module is None or module.course_id != course.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Bài học không thuộc khóa học"
        )
    return lesson


async def _resolve_assignment(
    db: AsyncSession, course: Course, assignment_id: str, user: User
) -> tuple[QuizAssignment, QuizAttempt]:
    """Bài tập phải thuộc môn và sinh viên đã nộp (trợ lý chỉ mở sau khi nộp)."""
    assignment = await db.get(QuizAssignment, assignment_id)
    if (
        assignment is None
        or assignment.course_id != course.id
        or assignment.status == "draft"
    ):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài tập")
    attempt = (
        await db.execute(
            select(QuizAttempt).where(
                QuizAttempt.assignment_id == assignment.id,
                QuizAttempt.student_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if attempt is None:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            detail="Hãy nộp bài trước khi dùng trợ lý học tập",
        )
    return assignment, attempt


@router.get("/api/courses/{course_id}/chat/sessions", response_model=list[ChatSessionOut])
async def list_sessions(
    course_id: str,
    user: User = Depends(require_roles("student")),
    db: AsyncSession = Depends(get_db),
):
    """Danh sách phiên chat của sinh viên trong một môn (mới nhất trước)."""
    course = await _course_or_404(db, course_id)
    await _require_enrolled(db, course.id, user)

    counts = (
        select(ChatMessage.session_id, func.count(ChatMessage.id).label("n"))
        .group_by(ChatMessage.session_id)
        .subquery()
    )
    stmt = (
        select(ChatSession, func.coalesce(counts.c.n, 0))
        .outerjoin(counts, counts.c.session_id == ChatSession.id)
        .where(
            ChatSession.student_id == user.id,
            ChatSession.course_id == course.id,
            ChatSession.archived_at.is_(None),
        )
        .order_by(ChatSession.updated_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    return [
        ChatSessionOut(
            id=session.id,
            course_id=session.course_id,
            lesson_id=session.lesson_id,
            assignment_id=session.assignment_id,
            title=session.title,
            message_count=int(count),
            created_at=session.created_at,
            updated_at=session.updated_at,
        )
        for session, count in rows
    ]


@router.post(
    "/api/courses/{course_id}/chat",
    response_model=ChatReplyOut,
    dependencies=[Depends(rate_limit(20, 60, "study-chat"))],
)
async def send_message(
    course_id: str,
    body: ChatSendIn,
    user: User = Depends(require_roles("student")),
    db: AsyncSession = Depends(get_db),
):
    """Gửi một câu hỏi. Không có `session_id` thì tạo phiên mới."""
    course = await _course_or_404(db, course_id)
    await _require_enrolled(db, course.id, user)

    lesson = await _resolve_lesson(db, course, str(body.lesson_id) if body.lesson_id else None)

    assignment: QuizAssignment | None = None
    attempt: QuizAttempt | None = None
    if body.assignment_id is not None:
        assignment, attempt = await _resolve_assignment(db, course, str(body.assignment_id), user)
        if assignment.lesson_id:
            lesson = await db.get(Lesson, assignment.lesson_id)

    if body.session_id is not None:
        session = await _session_or_404(db, str(body.session_id), user)
        if session.course_id != course.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiên chat")
    else:
        session = ChatSession(
            student_id=user.id,
            course_id=course.id,
            lesson_id=lesson.id if lesson is not None else None,
            assignment_id=assignment.id if assignment is not None else None,
            title=NEW_TITLE,
        )
        db.add(session)
        await db.flush()

    answer, citations, intent = await answer_in_session(
        db,
        course=course,
        session=session,
        message=body.message,
        lesson=lesson,
        assignment=assignment,
        attempt=attempt,
    )
    return ChatReplyOut(
        session_id=session.id, answer=answer, citations=citations, intent=intent
    )


@router.get("/api/chat/sessions/{session_id}/messages", response_model=list[ChatMessageOut])
async def list_messages(
    session_id: str,
    user: User = Depends(require_roles("student")),
    db: AsyncSession = Depends(get_db),
):
    """Lịch sử tin nhắn của một phiên (cũ → mới)."""
    session = await _session_or_404(db, session_id, user)
    rows = (
        (
            await db.execute(
                select(ChatMessage)
                .where(ChatMessage.session_id == session.id)
                .order_by(ChatMessage.created_at)
            )
        )
        .scalars()
        .all()
    )
    return [
        ChatMessageOut(
            id=message.id,
            role=message.role,
            content=message.content,
            citations=message.citations or [],
            intent=message.intent,
            created_at=message.created_at,
        )
        for message in rows
    ]


@router.patch("/api/chat/sessions/{session_id}", response_model=ChatSessionOut)
async def rename_session(
    session_id: str,
    body: ChatSessionUpdate,
    user: User = Depends(require_roles("student")),
    db: AsyncSession = Depends(get_db),
):
    """Đổi tên phiên."""
    session = await _session_or_404(db, session_id, user)
    session.title = body.title.strip()
    session.updated_at = datetime.now(timezone.utc)
    await db.commit()
    return await _session_out(db, session)


@router.delete("/api/chat/sessions/{session_id}")
async def delete_session(
    session_id: str,
    user: User = Depends(require_roles("student")),
    db: AsyncSession = Depends(get_db),
):
    """Xoá phiên (kèm bộ nhớ hội thoại bên chatbot)."""
    session = await _session_or_404(db, session_id, user)
    await purge_thread(session.id)
    await db.delete(session)
    await db.commit()
    return {"status": "ok"}
