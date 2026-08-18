from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.helpers import gradient_for
from app.db.session import get_db
from app.models.auth import User
from app.models.course import Course, Enrollment, Lesson, LessonProgress, Module
from app.models.gaze import LearningSession
from app.models.profile import UserProfile
from app.schemas.course import (
    CourseSummaryOut,
    EnrolledCourseOut,
    LearningStatsOut,
)

router = APIRouter(tags=["enrollments"])


@router.get("/api/me/enrollments", response_model=list[EnrolledCourseOut])
async def my_enrollments(
    include: str | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(Enrollment, Course, UserProfile)
        .join(Course, Course.id == Enrollment.course_id)
        .outerjoin(UserProfile, UserProfile.user_id == Course.teacher_id)
        .where(Enrollment.student_id == user.id, Course.deleted_at.is_(None))
        .order_by(Enrollment.enrolled_at.desc())
    )
    rows = (await db.execute(stmt)).all()
    if not rows:
        return []

    course_ids = [c.id for _, c, _ in rows]

    module_counts = dict(
        (
            await db.execute(
                select(Module.course_id, func.count(Module.id))
                .where(Module.course_id.in_(course_ids))
                .group_by(Module.course_id)
            )
        ).all()
    )
    lesson_counts = dict(
        (
            await db.execute(
                select(Module.course_id, func.count(Lesson.id))
                .join(Lesson, Lesson.module_id == Module.id)
                .where(Module.course_id.in_(course_ids))
                .group_by(Module.course_id)
            )
        ).all()
    )

    enrollment_ids = [e.id for e, _, _ in rows]
    completed_counts = dict(
        (
            await db.execute(
                select(LessonProgress.enrollment_id, func.count(LessonProgress.id))
                .where(
                    LessonProgress.enrollment_id.in_(enrollment_ids),
                    LessonProgress.status == "completed",
                )
                .group_by(LessonProgress.enrollment_id)
            )
        ).all()
    )

    out = []
    for enrollment, course, teacher_profile in rows:
        total_lessons = lesson_counts.get(course.id, 0)
        completed = completed_counts.get(enrollment.id, 0)
        progress = (
            round(completed / total_lessons * 100, 1) if total_lessons else 0.0
        )
        out.append(
            EnrolledCourseOut(
                enrollment_id=enrollment.id,
                enrolled_at=enrollment.enrolled_at,
                status=enrollment.status,
                progress=progress,
                course=CourseSummaryOut(
                    id=course.id,
                    title=course.title,
                    level=course.level,
                    thumbnail_url=course.thumbnail_url,
                    teacher_name=(
                        teacher_profile.full_name if teacher_profile else "—"
                    ),
                    module_count=module_counts.get(course.id, 0),
                    lesson_count=total_lessons,
                    gradient=gradient_for(course.id),
                ),
            )
        )
    return out


@router.post("/api/courses/{course_id}/enroll", status_code=201)
async def enroll(
    course_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    course = await db.get(Course, course_id)
    if course is None or course.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khóa học")
    if course.status.code != "published":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Khóa học chưa được xuất bản"
        )
    existing = (
        await db.execute(
            select(Enrollment).where(
                Enrollment.course_id == course_id, Enrollment.student_id == user.id
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Đã đăng ký khóa học này")
    enrollment = Enrollment(course_id=course_id, student_id=user.id)
    db.add(enrollment)
    await db.commit()
    await db.refresh(enrollment)
    return {"ok": True, "enrollmentId": enrollment.id}


@router.get("/api/me/stats", response_model=LearningStatsOut)
async def my_stats(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)

    enrollment_ids = list(
        (
            await db.execute(
                select(Enrollment.id).where(Enrollment.student_id == user.id)
            )
        ).scalars().all()
    )
    if not enrollment_ids:
        return LearningStatsOut(streak_days=0, week_study_minutes=0)

    minutes_stmt = select(
        func.coalesce(
            func.sum(
                func.extract(
                    "epoch",
                    func.coalesce(LearningSession.ended_at, now)
                    - LearningSession.started_at,
                )
            ),
            0,
        )
    ).where(
        LearningSession.enrollment_id.in_(enrollment_ids),
        LearningSession.started_at >= week_ago,
    )
    week_seconds = float((await db.execute(minutes_stmt)).scalar_one())

    dates_stmt = (
        select(func.date(LearningSession.started_at))
        .where(
            LearningSession.enrollment_id.in_(enrollment_ids),
            LearningSession.started_at >= now - timedelta(days=365),
        )
        .group_by(func.date(LearningSession.started_at))
    )
    study_dates: set[date] = {r[0] for r in await db.execute(dates_stmt)}

    streak = 0
    day = now.date()
    if day not in study_dates:
        day = day - timedelta(days=1)
    while day in study_dates:
        streak += 1
        day -= timedelta(days=1)

    return LearningStatsOut(
        streak_days=streak, week_study_minutes=int(week_seconds // 60)
    )
