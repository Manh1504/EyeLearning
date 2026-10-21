from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import can_access_course, get_current_user, require_roles
from app.db.session import get_db
from app.models.auth import User
from app.models.course import Course, CourseTeacher, Enrollment, Lesson, Module
from app.models.quiz import QuizAssignment, QuizAttempt, QuizAttemptSession
from app.schemas.quiz import (
    QuizAssignmentCreate,
    QuizAssignmentOut,
    QuizAssignmentUpdate,
    QuizAttemptCreate,
    QuizAttemptOut,
)
from app.services.study_chat import question_correct_ids

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


def _public_question(question: dict) -> dict:
    """Bản câu hỏi cho học viên chưa nộp: ẩn đáp án đúng và giải thích."""
    clean = {key: value for key, value in question.items() if key != "correctOptionId"}
    clean["correctOptionIds"] = []
    clean["explanation"] = ""
    return clean


def _reveal_question(question: dict) -> dict:
    """Bản câu hỏi đầy đủ (giáo viên hoặc học viên đã nộp)."""
    clean = {key: value for key, value in question.items() if key != "correctOptionId"}
    clean["correctOptionIds"] = question_correct_ids(question)
    return clean


async def _assignment_out(
    db: AsyncSession,
    assignment: QuizAssignment,
    reveal_answers: bool,
    expires_at: datetime | None = None,
) -> QuizAssignmentOut:
    course = await db.get(Course, assignment.course_id)
    lesson = await db.get(Lesson, assignment.lesson_id) if assignment.lesson_id else None
    questions = [
        _reveal_question(question) if reveal_answers else _public_question(question)
        for question in assignment.questions
    ]
    effective_status = assignment.status
    if (
        effective_status == "published"
        and assignment.due_at is not None
        and assignment.due_at < datetime.now(timezone.utc)
    ):
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
        allow_retry=assignment.allow_retry,
        questions=questions,
    )


def _deadline(assignment: QuizAssignment, session: QuizAttemptSession) -> datetime:
    """Hạn chót của lượt làm: min(hạn nộp bài, lúc bắt đầu + thời lượng)."""
    deadline = session.started_at + timedelta(minutes=assignment.duration_minutes)
    if assignment.due_at is not None:
        return min(assignment.due_at, deadline)
    return deadline


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
    assignments = list(
        (
            await db.execute(
                stmt.order_by(
                    QuizAssignment.due_at.asc().nullslast(),
                    QuizAssignment.created_at.desc(),
                )
            )
        ).scalars().all()
    )
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
        allow_retry=body.allow_retry,
        questions=[question.model_dump(by_alias=True) for question in body.questions],
    )
    db.add(assignment)
    await db.commit()
    await db.refresh(assignment)
    return await _assignment_out(db, assignment, True)


@router.patch("/{assignment_id}", response_model=QuizAssignmentOut)
async def update_assignment(
    assignment_id: UUID,
    body: QuizAssignmentUpdate,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Sửa hoặc publish/close bài tập (dùng để giao bài nháp đã tạo)."""
    assignment = await _assignment_or_404(db, str(assignment_id))
    course = await _course_or_404(db, assignment.course_id)
    if not await can_access_course(db, course, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    if body.title is not None:
        assignment.title = body.title.strip()
        if assignment.lesson_id:
            lesson = await db.get(Lesson, assignment.lesson_id)
            if lesson is not None and lesson.kind == "quiz":
                lesson.title = assignment.title
    if body.instructions is not None:
        assignment.instructions = body.instructions.strip()
    if body.due_at is not None:
        assignment.due_at = body.due_at
    if body.duration_minutes is not None:
        assignment.duration_minutes = body.duration_minutes
    if body.status is not None:
        assignment.status = body.status
    if body.allow_retry is not None:
        assignment.allow_retry = body.allow_retry
    if body.questions is not None:
        assignment.questions = [
            question.model_dump(by_alias=True) for question in body.questions
        ]
    if assignment.status == "published" and not assignment.questions:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Cần ít nhất một câu hỏi trước khi giao bài",
        )
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
    due_open = assignment.due_at is None or assignment.due_at > datetime.now(timezone.utc)
    if (
        "student" in user.role_codes
        and attempt is None
        and assignment.status == "published"
        and due_open
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
            expires_at = _deadline(assignment, session)
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


@router.post("/{assignment_id}/retry", response_model=QuizAssignmentOut)
async def retry_attempt(
    assignment_id: UUID,
    user: User = Depends(require_roles("student")),
    db: AsyncSession = Depends(get_db),
):
    """Xoá lượt làm cũ để học viên làm lại (chỉ khi giáo viên cho phép).

    Mỗi học viên vẫn chỉ giữ 1 lượt: bản ghi cũ bị xoá hẳn và đồng hồ làm bài
    được đặt lại từ đầu. Đáp án vì thế cũng bị ẩn lại cho tới lần nộp kế tiếp.
    """
    assignment = await _assignment_or_404(db, str(assignment_id))
    _, attempt = await _require_assignment_access(db, assignment, user)
    if not assignment.allow_retry:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, detail="Giáo viên chưa cho phép làm lại bài này"
        )
    if assignment.status != "published" or (
        assignment.due_at is not None and assignment.due_at < datetime.now(timezone.utc)
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Bài tập đã đóng")
    # Không cho reset đồng hồ khi chưa từng nộp (tránh gia hạn thời gian làm bài).
    if attempt is None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Bạn chưa nộp bài")
    await db.delete(attempt)
    session = await db.get(
        QuizAttemptSession,
        {"assignment_id": assignment.id, "student_id": user.id},
    )
    if session is None:
        session = QuizAttemptSession(assignment_id=assignment.id, student_id=user.id)
        db.add(session)
    session.started_at = datetime.now(timezone.utc)
    await db.commit()
    return await _assignment_out(db, assignment, False, _deadline(assignment, session))


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
    if assignment.status != "published" or (
        assignment.due_at is not None
        and assignment.due_at < datetime.now(timezone.utc)
    ):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Bài tập đã đóng")
    session = await db.get(
        QuizAttemptSession,
        {"assignment_id": assignment.id, "student_id": user.id},
    )
    if session is None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Bài làm chưa được bắt đầu")
    if session.started_at + timedelta(minutes=assignment.duration_minutes) < datetime.now(timezone.utc):
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Đã hết thời gian làm bài")
    valid_answers: dict[str, list[str]] = {}
    score = 0
    max_score = 0
    for question in assignment.questions:
        question_id = question["id"]
        points = int(question["points"])
        max_score += points
        valid_option_ids = {option["id"] for option in question["options"]}
        selected = body.answers.get(question_id) or []
        if isinstance(selected, str):
            selected = [selected]
        chosen = {option_id for option_id in selected if option_id in valid_option_ids}
        valid_answers[question_id] = sorted(chosen)
        # Chấm "tất cả hoặc không": đúng đủ và không dư đáp án mới được điểm.
        if chosen and chosen == set(question_correct_ids(question)):
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

