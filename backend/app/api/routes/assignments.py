from datetime import datetime, timedelta, timezone
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import ValidationError
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import can_access_course, get_current_user, require_roles
from app.core.ratelimit import rate_limit
from app.core.config import settings
from app.db.session import get_db
from app.models.auth import User
from app.models.course import Course, CourseTeacher, Enrollment, Lesson, Module
from app.models.quiz import QuizAssignment, QuizAttempt, QuizAttemptSession
from app.schemas.quiz import (
    QuizAssignmentCreate,
    QuizAssignmentOut,
    QuizAttemptCreate,
    QuizAttemptOut,
    QuizChatIn,
    QuizChatOut,
)

router = APIRouter(prefix="/api/assignments", tags=["assignments"])


async def _assignment_or_404(db: AsyncSession, assignment_id: str) -> QuizAssignment:
    assignment = await db.get(QuizAssignment, assignment_id)
    if assignment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài tập")
    return assignment


async def _course_or_404(db: AsyncSession, course_id: str) -> Course:
    course = await db.get(Course, course_id)
    if course is None or course.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khóa học")
    return course


async def _is_enrolled(db: AsyncSession, course_id: str, student_id: str) -> bool:
    stmt = select(Enrollment.id).where(
        Enrollment.course_id == course_id,
        Enrollment.student_id == student_id,
        Enrollment.status == "active",
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None


async def _require_assignment_access(
    db: AsyncSession, assignment: QuizAssignment, user: User
) -> tuple[Course, QuizAttempt | None]:
    course = await _course_or_404(db, assignment.course_id)
    if "admin" in user.role_codes or "teacher" in user.role_codes:
        if not await can_access_course(db, course, user):
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")
        return course, None
    if "student" not in user.role_codes or not await _is_enrolled(db, course.id, user.id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Bạn chưa tham gia khóa học")
    attempt = (
        await db.execute(
            select(QuizAttempt).where(
                QuizAttempt.assignment_id == assignment.id,
                QuizAttempt.student_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if assignment.status == "draft":
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài tập")
    return course, attempt


async def _assignment_out(
    db: AsyncSession,
    assignment: QuizAssignment,
    reveal_answers: bool,
    expires_at: datetime | None = None,
) -> QuizAssignmentOut:
    course = await db.get(Course, assignment.course_id)
    lesson = await db.get(Lesson, assignment.lesson_id) if assignment.lesson_id else None
    questions = assignment.questions
    if not reveal_answers:
        questions = [
            {**question, "correctOptionId": "", "explanation": ""}
            for question in questions
        ]
    effective_status = assignment.status
    if effective_status == "published" and assignment.due_at < datetime.now(timezone.utc):
        effective_status = "closed"
    return QuizAssignmentOut(
        id=assignment.id,
        course_id=assignment.course_id,
        course_title=course.title if course else "",
        lesson_id=assignment.lesson_id,
        lesson_title=lesson.title if lesson else None,
        title=assignment.title,
        instructions=assignment.instructions,
        due_at=assignment.due_at,
        duration_minutes=assignment.duration_minutes,
        status=effective_status,
        created_at=assignment.created_at,
        expires_at=expires_at,
        questions=questions,
    )


@router.get("", response_model=list[QuizAssignmentOut])
async def list_assignments(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    if "admin" in user.role_codes:
        stmt = select(QuizAssignment)
        reveal = True
    elif "teacher" in user.role_codes:
        stmt = (
            select(QuizAssignment)
            .join(Course, Course.id == QuizAssignment.course_id)
            .outerjoin(
                CourseTeacher,
                (CourseTeacher.course_id == Course.id) & (CourseTeacher.teacher_id == user.id),
            )
            .where(
                or_(Course.teacher_id == user.id, CourseTeacher.teacher_id == user.id),
                Course.deleted_at.is_(None),
            )
        )
        reveal = True
    elif "student" in user.role_codes:
        stmt = (
            select(QuizAssignment)
            .join(Enrollment, Enrollment.course_id == QuizAssignment.course_id)
            .where(
                Enrollment.student_id == user.id,
                Enrollment.status == "active",
                QuizAssignment.status != "draft",
            )
        )
        reveal = False
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    assignments = list((await db.execute(stmt.order_by(QuizAssignment.due_at))).scalars().all())
    return [await _assignment_out(db, item, reveal) for item in assignments]


@router.post("", response_model=QuizAssignmentOut, status_code=201)
async def create_assignment(
    body: QuizAssignmentCreate,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    course_id = str(body.course_id)
    lesson_id = str(body.lesson_id) if body.lesson_id else None
    course = await _course_or_404(db, course_id)
    if not await can_access_course(db, course, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    if lesson_id:
        lesson_course_id = (
            await db.execute(
                select(Module.course_id).join(Lesson, Lesson.module_id == Module.id).where(Lesson.id == lesson_id)
            )
        ).scalar_one_or_none()
        if lesson_course_id != course.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Bài học không thuộc khóa học")
    assignment = QuizAssignment(
        course_id=course.id,
        lesson_id=lesson_id,
        created_by=user.id,
        title=body.title.strip(),
        instructions=body.instructions.strip(),
        due_at=body.due_at,
        duration_minutes=body.duration_minutes,
        status=body.status,
        questions=[question.model_dump(by_alias=True) for question in body.questions],
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return await _assignment_out(db, assignment, True)


@router.get("/{assignment_id}", response_model=QuizAssignmentOut)
async def get_assignment(
    assignment_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    assignment = await _assignment_or_404(db, str(assignment_id))
    _, attempt = await _require_assignment_access(db, assignment, user)
    reveal = bool({"teacher", "admin"} & set(user.role_codes)) or attempt is not None
    expires_at = None
    if (
        "student" in user.role_codes
        and attempt is None
        and assignment.status == "published"
        and assignment.due_at > datetime.now(timezone.utc)
    ):
        session = await db.get(
            QuizAttemptSession,
            {"assignment_id": assignment.id, "student_id": user.id},
        )
        if session is None:
            session = QuizAttemptSession(assignment_id=assignment.id, student_id=user.id)
            db.add(session)
            try:
                await db.commit()
            except IntegrityError:
                await db.rollback()
                session = await db.get(
                    QuizAttemptSession,
                    {"assignment_id": assignment.id, "student_id": user.id},
                )
            else:
                await db.refresh(session)
        if session is not None:
            expires_at = min(
                assignment.due_at,
                session.started_at + timedelta(minutes=assignment.duration_minutes),
            )
    return await _assignment_out(db, assignment, reveal, expires_at)


@router.get("/{assignment_id}/attempt", response_model=QuizAttemptOut | None)
async def get_attempt(
    assignment_id: UUID,
    user: User = Depends(require_roles("student")),
    db: AsyncSession = Depends(get_db),
):
    assignment = await _assignment_or_404(db, str(assignment_id))
    _, attempt = await _require_assignment_access(db, assignment, user)
    return attempt


@router.post("/{assignment_id}/attempts", response_model=QuizAttemptOut, status_code=201)
async def submit_attempt(
    assignment_id: UUID,
    body: QuizAttemptCreate,
    user: User = Depends(require_roles("student")),
    db: AsyncSession = Depends(get_db),
):
    assignment = await _assignment_or_404(db, str(assignment_id))
    _, existing = await _require_assignment_access(db, assignment, user)
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Bài tập đã được nộp")
    if assignment.status != "published" or assignment.due_at < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Bài tập đã đóng")
    session = await db.get(
        QuizAttemptSession,
        {"assignment_id": assignment.id, "student_id": user.id},
    )
    if session is None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Bài làm chưa được bắt đầu")
    if session.started_at + timedelta(minutes=assignment.duration_minutes) < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Đã hết thời gian làm bài")
    valid_answers: dict[str, str] = {}
    score = 0
    max_score = 0
    for question in assignment.questions:
        question_id = question["id"]
        points = int(question["points"])
        max_score += points
        selected = body.answers.get(question_id)
        valid_option_ids = {option["id"] for option in question["options"]}
        if selected in valid_option_ids:
            valid_answers[question_id] = selected
            if selected == question["correctOptionId"]:
                score += points
    attempt = QuizAttempt(
        assignment_id=assignment.id,
        student_id=user.id,
        answers=valid_answers,
        score=score,
        max_score=max_score,
    )
    db.add(attempt)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Bài tập đã được nộp")
    await db.refresh(attempt)
    return attempt


@router.post("/{assignment_id}/chat", response_model=QuizChatOut)
async def chat_about_assignment(
    assignment_id: UUID,
    body: QuizChatIn,
    user: User = Depends(require_roles("student")),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(rate_limit(10, 60, "assignment-chat")),
):
    assignment = await _assignment_or_404(db, str(assignment_id))
    course, attempt = await _require_assignment_access(db, assignment, user)
    if not settings.chatbot_url or not settings.chatbot_internal_token:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, detail="Trợ lý học tập chưa được cấu hình")
    review = attempt is not None
    context_lines = [f"Bài tập: {assignment.title}"]
    for index, question in enumerate(assignment.questions, start=1):
        context_lines.append(f"Câu {index}: {question['prompt']}")
        for option in question["options"]:
            context_lines.append(f"- {option['id']}: {option['text']}")
        # Chỉ gửi đáp án/giải thích sau khi học viên đã nộp; nếu chưa nộp,
        # chatbot không được biết đáp án để tránh lộ bài qua kênh trò chuyện.
        if review:
            context_lines.append(f"Học viên chọn: {attempt.answers.get(question['id'], 'chưa trả lời')}")
            context_lines.append(f"Đáp án đúng: {question['correctOptionId']}")
            context_lines.append(f"Giải thích: {question['explanation']}")
    payload = {
        "message": body.message,
        "course_id": course.id,
        "thread_id": f"{user.id}:{assignment.id}:{body.thread_id}",
        "assignment_context": "\n".join(context_lines)[:30000],
        "support_mode": "review" if review else "hint",
    }
    try:
        async with httpx.AsyncClient(
            timeout=settings.chatbot_timeout_seconds,
            headers={"X-Chatbot-Token": settings.chatbot_internal_token},
        ) as client:
            response = await client.post(f"{settings.chatbot_url.rstrip('/')}/chat", json=payload)
            response.raise_for_status()
            return QuizChatOut.model_validate(response.json())
    except (httpx.HTTPError, ValueError, ValidationError):
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, detail="Trợ lý học tập tạm thời không phản hồi")
