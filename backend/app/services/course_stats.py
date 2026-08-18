from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analytics import EngagementScore
from app.models.course import Course, Enrollment, Lesson, LessonProgress, Module
from app.models.gaze import LearningSession


async def course_ids_of_teacher(db: AsyncSession, teacher_id: str) -> list[str]:
    stmt = select(Course.id).where(
        Course.teacher_id == teacher_id, Course.deleted_at.is_(None)
    )
    return list((await db.execute(stmt)).scalars().all())


async def enrollment_counts(db: AsyncSession, course_ids: list[str]) -> dict[str, int]:
    if not course_ids:
        return {}
    stmt = (
        select(Enrollment.course_id, func.count(Enrollment.id))
        .where(Enrollment.course_id.in_(course_ids), Enrollment.status != "dropped")
        .group_by(Enrollment.course_id)
    )
    return {row[0]: row[1] for row in await db.execute(stmt)}


async def lesson_counts(db: AsyncSession, course_ids: list[str]) -> dict[str, int]:
    if not course_ids:
        return {}
    stmt = (
        select(Module.course_id, func.count(Lesson.id))
        .join(Lesson, Lesson.module_id == Module.id)
        .where(Module.course_id.in_(course_ids))
        .group_by(Module.course_id)
    )
    return {row[0]: row[1] for row in await db.execute(stmt)}


async def completed_progress_counts(
    db: AsyncSession, course_ids: list[str]
) -> dict[str, int]:
    if not course_ids:
        return {}
    stmt = (
        select(Module.course_id, func.count(LessonProgress.id))
        .join(Lesson, Lesson.id == LessonProgress.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .join(Enrollment, Enrollment.id == LessonProgress.enrollment_id)
        .where(
            Module.course_id.in_(course_ids), LessonProgress.status == "completed"
        )
        .group_by(Module.course_id)
    )
    return {row[0]: row[1] for row in await db.execute(stmt)}


async def attention_avg_by_course(
    db: AsyncSession, course_ids: list[str]
) -> dict[str, float]:
    if not course_ids:
        return {}
    stmt = (
        select(Enrollment.course_id, func.avg(EngagementScore.score))
        .join(EngagementScore, EngagementScore.enrollment_id == Enrollment.id)
        .where(Enrollment.course_id.in_(course_ids))
        .group_by(Enrollment.course_id)
    )
    return {row[0]: float(row[1]) for row in await db.execute(stmt)}


async def session_counts_by_course(
    db: AsyncSession, course_ids: list[str]
) -> dict[str, int]:
    if not course_ids:
        return {}
    stmt = (
        select(Module.course_id, func.count(LearningSession.id))
        .join(Lesson, Lesson.id == LearningSession.lesson_id)
        .join(Module, Module.id == Lesson.module_id)
        .where(Module.course_id.in_(course_ids))
        .group_by(Module.course_id)
    )
    return {row[0]: row[1] for row in await db.execute(stmt)}


def completion_percent(completed: int, students: int, lessons: int) -> float:
    if students <= 0 or lessons <= 0:
        return 0.0
    return round(min(100.0, completed / (students * lessons) * 100), 1)
