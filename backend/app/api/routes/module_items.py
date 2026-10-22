from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import can_manage_course, require_roles
from app.db.session import get_db
from app.models.auth import User
from app.models.course import Course, Lesson, Module
from app.models.quiz import QuizAssignment
from app.schemas.course import LessonNodeOut, ModuleItemsReorderIn
from app.schemas.quiz import QuizItemCreate

router = APIRouter(tags=["module-items"])


async def _module_owned(db: AsyncSession, module_id: str, user: User) -> Module:
    module = await db.get(Module, module_id)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy chương")
    course = await db.get(Course, module.course_id)
    if course is None or not await can_manage_course(db, course, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    return module


async def _module_lessons(db: AsyncSession, module_id: str) -> list[Lesson]:
    rows = (
        await db.execute(
            select(Lesson)
            .where(Lesson.module_id == module_id)
            .order_by(Lesson.order_index)
        )
    ).scalars().all()
    return list(rows)


async def _renumber(
    db: AsyncSession, module_id: str, ordered_lesson_ids: list[str]
) -> None:
    """Gán lại order_index 1..N cho toàn bộ item của chương.

    Hai lượt để tránh đụng ràng buộc UNIQUE(module_id, order_index): lượt đầu
    đẩy tất cả về giá trị âm tạm thời, lượt sau gán giá trị cuối.
    """
    lessons = await _module_lessons(db, module_id)
    by_id = {lesson.id: lesson for lesson in lessons}
    for index, lesson in enumerate(lessons, start=1):
        lesson.order_index = -index
    await db.flush()
    for index, lesson_id in enumerate(ordered_lesson_ids, start=1):
        by_id[lesson_id].order_index = index
    await db.flush()


def _lesson_node(lesson: Lesson, quiz: QuizAssignment | None) -> LessonNodeOut:
    return LessonNodeOut(
        id=lesson.id,
        title=lesson.title,
        kind=lesson.kind,
        slides=len(lesson.contents),
        quiz_id=quiz.id if quiz else None,
        quiz_status=quiz.status if quiz else None,
        question_count=len(quiz.questions) if quiz else 0,
        duration_minutes=quiz.duration_minutes if quiz else None,
        due_at=quiz.due_at if quiz else None,
    )


@router.post(
    "/teacher/modules/{module_id}/quizzes",
    response_model=LessonNodeOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_quiz_item(
    module_id: str,
    body: QuizItemCreate,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Tạo một item bài tập trắc nghiệm (nháp) trong chương — soạn câu hỏi sau."""
    module = await _module_owned(db, module_id, user)
    lessons = await _module_lessons(db, module_id)

    position = len(lessons)
    if body.after_id is not None:
        after_id = str(body.after_id)
        found = next((i for i, lesson in enumerate(lessons) if lesson.id == after_id), None)
        if found is None:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Item mốc không thuộc chương này",
            )
        position = found + 1

    lesson = Lesson(
        module_id=module_id,
        title=body.title,
        order_index=len(lessons) + 1,
        kind="quiz",
    )
    db.add(lesson)
    await db.flush()

    quiz = QuizAssignment(
        course_id=module.course_id,
        lesson_id=lesson.id,
        created_by=user.id,
        title=body.title,
        instructions="",
        due_at=body.due_at,
        duration_minutes=body.duration_minutes,
        status="draft",
        questions=[],
    )
    db.add(quiz)
    await db.flush()

    ordered_ids = [item.id for item in lessons]
    ordered_ids.insert(position, lesson.id)
    await _renumber(db, module_id, ordered_ids)
    await db.commit()
    await db.refresh(lesson)
    await db.refresh(quiz)
    return _lesson_node(lesson, quiz)


@router.post("/teacher/modules/{module_id}/items/reorder", response_model=dict)
async def reorder_module_items(
    module_id: str,
    body: ModuleItemsReorderIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Sắp xếp lại toàn bộ item (bài học + bài tập) trong một chương."""
    await _module_owned(db, module_id, user)
    lessons = await _module_lessons(db, module_id)
    by_id = {lesson.id: lesson for lesson in lessons}

    if len(body.items) != len(lessons) or {item.id for item in body.items} != set(by_id):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Danh sách item không khớp cấu trúc chương",
        )
    for item in body.items:
        if by_id[item.id].kind != item.kind:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                detail="Loại item không khớp",
            )

    await _renumber(db, module_id, [item.id for item in body.items])
    await db.commit()
    return {"ok": True}
