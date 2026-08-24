from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    can_access_course,
    can_manage_course,
    get_current_user,
    require_roles,
)
from app.core.helpers import color_for, gradient_for, relative_time_vn
from app.db.session import get_db
from app.models.analytics import EngagementScore
from app.models.auth import User
from app.models.course import (
    Course,
    CourseStatus,
    CourseTeacher,
    Enrollment,
    Lesson,
    LessonProgress,
    Module,
)
from app.models.profile import StudentProfile, TeacherProfile, UserProfile
from app.schemas.course import (
    CourseCreateIn,
    CourseOutlineOut,
    CourseUpdateIn,
    LessonItemOut,
    LessonNodeOut,
    ModuleItemOut,
    ModuleNodeOut,
    StudentDirectoryOut,
    StudentLessonOut,
    StudentRowOut,
    StudentsAddIn,
    TeacherCourseOut,
)
from app.services import course_stats

router = APIRouter(tags=["courses"])


async def _course_status_id(db: AsyncSession, code: str) -> int:
    stmt = select(CourseStatus.id).where(CourseStatus.code == code)
    result = (await db.execute(stmt)).scalar_one_or_none()
    if result is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Trạng thái không hợp lệ")
    return result


async def _get_course_or_404(db: AsyncSession, course_id: str) -> Course:
    course = await db.get(Course, course_id)
    if course is None or course.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khóa học")
    return course


async def _get_owned_course(db: AsyncSession, course_id: str, user: User) -> Course:
    """Khóa học mà user quản lý được (admin hoặc chủ khóa)."""
    course = await _get_course_or_404(db, course_id)
    if not await can_manage_course(db, course, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    return course


async def _get_viewable_course(db: AsyncSession, course_id: str, user: User) -> Course:
    """Khóa học mà user xem được (admin / chủ khóa / GV được phân công)."""
    course = await _get_course_or_404(db, course_id)
    if not await can_access_course(db, course, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    return course


@router.get("/teacher/courses", response_model=list[TeacherCourseOut])
async def list_teacher_courses(
    status_filter: str | None = Query(default=None, alias="status"),
    q: str | None = Query(default=None),
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    # Admin xem được toàn bộ khóa học; giáo viên xem khóa học mình sở hữu
    # hoặc được admin phân công vào.
    if "admin" in user.role_codes:
        stmt = select(Course).where(Course.deleted_at.is_(None))
    else:
        assigned_stmt = select(CourseTeacher.course_id).where(
            CourseTeacher.teacher_id == user.id
        )
        assigned_ids = set((await db.execute(assigned_stmt)).scalars().all())
        stmt = select(Course).where(
            or_(
                Course.teacher_id == user.id,
                Course.id.in_(assigned_ids) if assigned_ids else False,
            ),
            Course.deleted_at.is_(None),
        )
    if status_filter:
        status_id = await _course_status_id(db, status_filter)
        stmt = stmt.where(Course.status_id == status_id)
    if q:
        stmt = stmt.where(Course.title.ilike(f"%{q}%"))
    stmt = stmt.order_by(Course.updated_at.desc())
    courses = list((await db.execute(stmt)).scalars().all())

    ids = [c.id for c in courses]
    enroll_counts = await course_stats.enrollment_counts(db, ids)
    lesson_counts = await course_stats.lesson_counts(db, ids)
    completed_counts = await course_stats.completed_progress_counts(db, ids)
    attention = await course_stats.attention_avg_by_course(db, ids)
    sessions = await course_stats.session_counts_by_course(db, ids)

    return [
        TeacherCourseOut(
            id=c.id,
            title=c.title,
            description=c.description or "",
            level=c.level or "beginner",
            gradient=gradient_for(c.id),
            status=c.status.code,
            students=enroll_counts.get(c.id, 0),
            completion=course_stats.completion_percent(
                completed_counts.get(c.id, 0),
                enroll_counts.get(c.id, 0),
                lesson_counts.get(c.id, 0),
            ),
            attention=round(attention[c.id], 1) if c.id in attention else None,
            sessions=sessions.get(c.id, 0),
            updated_at=c.updated_at,
            is_owner="admin" in user.role_codes or c.teacher_id == user.id,
        )
        for c in courses
    ]


@router.post("/teacher/courses", response_model=TeacherCourseOut, status_code=201)
async def create_course(
    body: CourseCreateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    teacher = await db.get(TeacherProfile, user.id)
    if teacher is None and "admin" not in user.role_codes:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Tài khoản không phải giáo viên"
        )
    if teacher is None:
        # Admin không có teacher_profiles nhưng courses.teacher_id
        # trỏ tới teacher_profiles(user_id) nên tự cấp hồ sơ giáo viên cho admin.
        teacher = TeacherProfile(
            user_id=user.id,
            teacher_code=f"ADM{user.id[:8].upper()}",
            department="Quản trị hệ thống",
        )
        db.add(teacher)
        await db.flush()
    course = Course(
        title=body.title,
        description=body.description,
        level=body.level,
        thumbnail_url=body.thumbnail_url,
        status_id=await _course_status_id(db, body.status),
        teacher_id=user.id,
        created_by=user.id,
    )
    db.add(course)
    await db.flush()
    await db.refresh(course)
    await db.commit()
    return TeacherCourseOut(
        id=course.id,
        title=course.title,
        description=course.description or "",
        level=course.level or "beginner",
        gradient=gradient_for(course.id),
        status=course.status.code,
        students=0,
        completion=0,
        attention=None,
        sessions=0,
        updated_at=course.updated_at,
    )


@router.patch("/teacher/courses/{course_id}", response_model=TeacherCourseOut)
async def update_course(
    course_id: str,
    body: CourseUpdateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_owned_course(db, course_id, user)
    if body.title is not None:
        course.title = body.title
    if body.description is not None:
        course.description = body.description
    if body.level is not None:
        course.level = body.level
    if body.thumbnail_url is not None:
        course.thumbnail_url = body.thumbnail_url
    if body.status is not None:
        course.status_id = await _course_status_id(db, body.status)
    await db.commit()
    await db.refresh(course)
    ids = [course.id]
    enroll_counts = await course_stats.enrollment_counts(db, ids)
    lesson_counts = await course_stats.lesson_counts(db, ids)
    completed_counts = await course_stats.completed_progress_counts(db, ids)
    attention = await course_stats.attention_avg_by_course(db, ids)
    sessions = await course_stats.session_counts_by_course(db, ids)
    return TeacherCourseOut(
        id=course.id,
        title=course.title,
        description=course.description or "",
        level=course.level or "beginner",
        gradient=gradient_for(course.id),
        status=course.status.code,
        students=enroll_counts.get(course.id, 0),
        completion=course_stats.completion_percent(
            completed_counts.get(course.id, 0),
            enroll_counts.get(course.id, 0),
            lesson_counts.get(course.id, 0),
        ),
        attention=round(attention[course.id], 1) if course.id in attention else None,
        sessions=sessions.get(course.id, 0),
        updated_at=course.updated_at,
    )


@router.delete("/teacher/courses/{course_id}")
async def delete_course(
    course_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    from datetime import datetime, timezone

    course = await _get_owned_course(db, course_id, user)
    course.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"ok": True}


@router.get("/teacher/courses/{course_id}", response_model=list[ModuleNodeOut])
async def get_course_tree(
    course_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_viewable_course(db, course_id, user)

    completed_stmt = (
        select(LessonProgress.lesson_id, func.count(LessonProgress.id))
        .join(Enrollment, Enrollment.id == LessonProgress.enrollment_id)
        .where(
            Enrollment.course_id == course.id, LessonProgress.status == "completed"
        )
        .group_by(LessonProgress.lesson_id)
    )
    completed = {r[0]: r[1] for r in await db.execute(completed_stmt)}

    attention_stmt = (
        select(EngagementScore.lesson_id, func.avg(EngagementScore.score))
        .join(Enrollment, Enrollment.id == EngagementScore.enrollment_id)
        .where(Enrollment.course_id == course.id)
        .group_by(EngagementScore.lesson_id)
    )
    attention = {r[0]: float(r[1]) for r in await db.execute(attention_stmt)}

    students_stmt = (
        select(func.count(Enrollment.id))
        .where(Enrollment.course_id == course.id, Enrollment.status != "dropped")
    )
    students = (await db.execute(students_stmt)).scalar_one()

    return [
        ModuleNodeOut(
            id=m.id,
            title=m.title,
            lessons=[
                LessonNodeOut(
                    id=l.id,
                    title=l.title,
                    slides=len(l.contents),
                    completion=(
                        round(completed[l.id] / students * 100, 1)
                        if students and l.id in completed
                        else 0.0
                    ),
                    attention=round(attention[l.id], 1) if l.id in attention else None,
                )
                for l in m.lessons
            ],
        )
        for m in course.modules
    ]


@router.get("/teacher/courses/{course_id}/students", response_model=list[StudentRowOut])
async def get_course_students(
    course_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_viewable_course(db, course_id, user)

    lessons = list(
        (
            await db.execute(
                select(Lesson)
                .join(Module, Module.id == Lesson.module_id)
                .where(Module.course_id == course.id)
                .order_by(Module.order_index, Lesson.order_index)
            )
        ).scalars().all()
    )
    lesson_slide_counts = {
        l.id: len(l.contents) for l in lessons
    }

    enroll_stmt = (
        select(Enrollment, User, UserProfile, StudentProfile)
        .join(User, User.id == Enrollment.student_id)
        .outerjoin(UserProfile, UserProfile.user_id == User.id)
        .outerjoin(StudentProfile, StudentProfile.user_id == User.id)
        .where(Enrollment.course_id == course.id)
        .order_by(Enrollment.enrolled_at)
    )
    rows = (await db.execute(enroll_stmt)).all()
    if not rows:
        return []

    enrollment_ids = [e.id for e, *_ in rows]

    progress_stmt = select(LessonProgress).where(
        LessonProgress.enrollment_id.in_(enrollment_ids)
    )
    progress_rows = (await db.execute(progress_stmt)).scalars().all()
    progress_map = {(p.enrollment_id, p.lesson_id): p for p in progress_rows}

    engagement_stmt = select(EngagementScore).where(
        EngagementScore.enrollment_id.in_(enrollment_ids)
    )
    engagement_rows = (await db.execute(engagement_stmt)).scalars().all()
    engagement_map = {(s.enrollment_id, s.lesson_id): s for s in engagement_rows}

    from app.models.gaze import LearningSession

    last_active_stmt = (
        select(LearningSession.enrollment_id, func.max(LearningSession.started_at))
        .where(LearningSession.enrollment_id.in_(enrollment_ids))
        .group_by(LearningSession.enrollment_id)
    )
    last_active = {r[0]: r[1] for r in await db.execute(last_active_stmt)}

    total_lessons = len(lessons)
    out: list[StudentRowOut] = []
    for enrollment, student, profile, sp in rows:
        completed_count = sum(
            1
            for l in lessons
            if (enrollment.id, l.id) in progress_map
            and progress_map[(enrollment.id, l.id)].status == "completed"
        )
        scores = [
            s.score
            for l in lessons
            if (s := engagement_map.get((enrollment.id, l.id))) is not None
        ]
        lesson_outs = []
        for l in lessons:
            p = progress_map.get((enrollment.id, l.id))
            eng = engagement_map.get((enrollment.id, l.id))
            lesson_outs.append(
                StudentLessonOut(
                    lesson_id=l.id,
                    viewed=len(p.viewed_slides) if p else 0,
                    total=lesson_slide_counts[l.id],
                    attention=round(eng.score, 1) if eng else None,
                )
            )
        out.append(
            StudentRowOut(
                id=student.id,
                name=profile.full_name if profile else student.email,
                code=sp.student_code if sp else "",
                color=color_for(student.id),
                avatar_url=profile.avatar_url if profile else None,
                progress=(
                    round(completed_count / total_lessons * 100, 1)
                    if total_lessons
                    else 0.0
                ),
                attention=round(sum(scores) / len(scores), 1) if scores else None,
                last_active=relative_time_vn(last_active.get(enrollment.id)),
                status=enrollment.status,
                lessons=lesson_outs,
            )
        )
    return out


@router.get("/teacher/students", response_model=list[StudentDirectoryOut])
async def list_student_directory(
    q: str | None = Query(default=None, max_length=100),
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Danh mục học viên để thêm vào khóa học (tìm theo tên / mã SV / email)."""
    stmt = (
        select(User, UserProfile, StudentProfile)
        .outerjoin(UserProfile, UserProfile.user_id == User.id)
        .outerjoin(StudentProfile, StudentProfile.user_id == User.id)
        .where(
            User.deleted_at.is_(None),
            User.status.has(code="active"),
            User.roles.any(code="student"),
        )
        .order_by(UserProfile.full_name)
        .limit(200)
    )
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                UserProfile.full_name.ilike(like),
                StudentProfile.student_code.ilike(like),
                User.email.ilike(like),
            )
        )
    rows = (await db.execute(stmt)).all()
    return [
        StudentDirectoryOut(
            id=u.id,
            name=p.full_name if p else u.email,
            code=sp.student_code if sp else "",
            email=u.email,
            color=color_for(u.id),
        )
        for u, p, sp in rows
    ]


@router.post("/teacher/courses/{course_id}/students", status_code=201)
async def add_course_students(
    course_id: str,
    body: StudentsAddIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_owned_course(db, course_id, user)
    ids = list(dict.fromkeys(body.student_ids))
    if not ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Chưa chọn học viên nào")

    valid_stmt = select(User.id).where(
        User.id.in_(ids),
        User.deleted_at.is_(None),
        User.roles.any(code="student"),
    )
    valid_ids = set((await db.execute(valid_stmt)).scalars().all())

    existing_stmt = select(Enrollment).where(
        Enrollment.course_id == course.id, Enrollment.student_id.in_(valid_ids)
    )
    existing = {e.student_id: e for e in (await db.execute(existing_stmt)).scalars().all()}

    added = 0
    for sid in valid_ids:
        enr = existing.get(sid)
        if enr is not None:
            if enr.status != "active":
                enr.status = "active"
                added += 1
            continue
        db.add(Enrollment(course_id=course.id, student_id=sid))
        added += 1
    await db.commit()
    return {"ok": True, "added": added}


@router.delete("/teacher/courses/{course_id}/students/{student_id}")
async def remove_course_student(
    course_id: str,
    student_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_viewable_course(db, course_id, user)
    enrollment = (
        await db.execute(
            select(Enrollment).where(
                Enrollment.course_id == course.id, Enrollment.student_id == student_id
            )
        )
    ).scalar_one_or_none()
    if enrollment is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Học viên chưa đăng ký khóa học này"
        )
    enrollment.status = "dropped"
    await db.commit()
    return {"ok": True}


@router.get("/api/courses/{course_id}", response_model=CourseOutlineOut)
async def get_course_outline(
    course_id: str,
    include: str | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    course = await _get_course_or_404(db, course_id)
    enrolled = (
        await db.execute(
            select(Enrollment).where(
                Enrollment.course_id == course.id, Enrollment.student_id == user.id
            )
        )
    ).scalar_one_or_none()
    is_owner = course.teacher_id == user.id or "admin" in user.role_codes
    if not is_owner and enrolled is None and course.status.code != "published":
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")

    completed_lessons: set[str] = set()
    if enrolled is not None:
        stmt = select(LessonProgress.lesson_id).where(
            LessonProgress.enrollment_id == enrolled.id,
            LessonProgress.status == "completed",
        )
        completed_lessons = set((await db.execute(stmt)).scalars().all())

    return CourseOutlineOut(
        id=course.id,
        title=course.title,
        modules=[
            ModuleItemOut(
                id=m.id,
                order_index=m.order_index,
                title=m.title,
                lessons=[
                    LessonItemOut(
                        id=l.id,
                        title=l.title,
                        slide_count=len(l.contents),
                        completed=l.id in completed_lessons,
                    )
                    for l in m.lessons
                ],
            )
            for m in course.modules
        ],
    )
