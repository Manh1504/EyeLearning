from datetime import datetime, timezone
from pathlib import Path
from time import time
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from web.authz import current_user_from_cookie, normalize_role, require_admin_user
from web.config import DATA_DIR
from web.database import get_db
from web.models import (
    Course,
    CourseEnrollment,
    CourseItem,
    PDFLesson,
    PDFLessonProgress,
    Session,
    TeacherCourseAssignment,
    Test,
    TrackingPoint,
    User,
)
from web.schemas import (
    CourseItemOut,
    CourseOverviewOut,
    PDFLessonCreateOut,
    PDFLessonProgressOut,
    PDFLessonSummaryOut,
    TeacherAttentionOut,
    TeacherCourseAnalyticsOut,
    TeacherCourseCardOut,
    TeacherPdfLessonAnalyticsOut,
    TeacherPdfLessonHeatmapOut,
    TeacherPdfLessonPageOut,
    TeacherCourseSummaryOut,
    TeacherDashboardOut,
    TeacherRecentSessionOut,
)
from web.services.pdf_teacher_analytics_service import (
    build_course_analytics,
    build_lesson_analytics as build_pdf_lesson_analytics,
    build_page_heatmap,
)
from web.services.pdf_lesson_service import (
    extract_pdf_page_count,
    pdf_file_response,
    store_pdf_file,
    validate_pdf_upload,
)

router = APIRouter(prefix="/courses", tags=["courses"])


class AssignmentIn(BaseModel):
    teacher_id: str
    course_id: str


class EnrollmentIn(BaseModel):
    student_id: str
    course_id: str
    status: str = "active"


class CourseItemUpdateIn(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    is_enabled: Optional[bool] = None
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None


class CourseItemReorderIn(BaseModel):
    item_ids: list[str]


class CourseItemBulkUpdateIn(BaseModel):
    item_ids: list[str]
    action: str
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _course_item_access_state(item: CourseItem, now: datetime) -> str:
    if not item.is_enabled:
        return "disabled"
    if item.available_from and item.available_from > now:
        return "scheduled"
    if item.available_until and item.available_until <= now:
        return "closed"
    return "available"


def _availability_label(item: CourseItem, now: datetime) -> str:
    if not item.is_enabled:
        return "Disabled by teacher"
    if item.available_from and item.available_from > now:
        return f"Opens on {item.available_from.astimezone().strftime('%Y-%m-%d %H:%M')}"
    if item.available_until and item.available_until <= now:
        return f"Closed on {item.available_until.astimezone().strftime('%Y-%m-%d %H:%M')}"
    if item.available_until:
        return f"Available now until {item.available_until.astimezone().strftime('%Y-%m-%d %H:%M')}"
    return "Available now"


def _item_action_label(item_type: str, access_state: str, completed: bool, progress_ratio: float) -> str:
    if access_state == "scheduled":
        return "Opens on..."
    if access_state == "closed":
        return "Access period has ended"
    if access_state == "disabled":
        return "Teacher has not opened this lesson"
    if item_type == "TEST":
        return "Start test"
    if completed:
        return "Review"
    if progress_ratio > 0:
        return "Continue"
    return "Start"


async def _user_with_role(db: AsyncSession, user_id: str, role: str) -> User:
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user or normalize_role(user.role) != role or not user.is_active:
        raise HTTPException(status_code=400, detail=f"Tài khoản không phải {role} hợp lệ")
    return user


async def _course_exists(db: AsyncSession, course_id: str) -> Course:
    course = await db.scalar(select(Course).where(Course.course_id == course_id))
    if not course:
        raise HTTPException(status_code=404, detail="Course không tồn tại")
    return course


async def _can_access_course(db: AsyncSession, user: User, course_id: str) -> bool:
    role = normalize_role(user.role)
    if role == "admin":
        return True
    if role == "student":
        return bool(
            await db.scalar(
                select(CourseEnrollment.course_id).where(
                    CourseEnrollment.course_id == course_id,
                    CourseEnrollment.student_id == user.user_id,
                    CourseEnrollment.status == "active",
                )
            )
        )
    if role == "teacher":
        return bool(
            await db.scalar(
                select(TeacherCourseAssignment.course_id).where(
                    TeacherCourseAssignment.course_id == course_id,
                    TeacherCourseAssignment.teacher_id == user.user_id,
                )
            )
        )
    return False


async def _course_items_for_course(db: AsyncSession, course_id: str) -> list[CourseItem]:
    result = await db.execute(
        select(CourseItem)
        .where(CourseItem.course_id == course_id)
        .order_by(CourseItem.display_order, CourseItem.created_at)
    )
    return list(result.scalars().all())


async def _pdf_lessons_by_item(db: AsyncSession, item_ids: list[str]) -> dict[str, PDFLesson]:
    if not item_ids:
        return {}
    result = await db.execute(select(PDFLesson).where(PDFLesson.course_item_id.in_(item_ids)))
    return {row.course_item_id: row for row in result.scalars().all()}


async def _tests_by_item(db: AsyncSession, item_ids: list[str]) -> dict[str, Test]:
    if not item_ids:
        return {}
    result = await db.execute(select(Test).where(Test.course_item_id.in_(item_ids)))
    return {row.course_item_id: row for row in result.scalars().all()}


async def _progress_by_pdf_lesson(db: AsyncSession, user_id: str, pdf_lesson_ids: list[str]) -> dict[str, PDFLessonProgress]:
    if not pdf_lesson_ids:
        return {}
    result = await db.execute(
        select(PDFLessonProgress).where(
            PDFLessonProgress.user_id == user_id,
            PDFLessonProgress.pdf_lesson_id.in_(pdf_lesson_ids),
        )
    )
    return {row.pdf_lesson_id: row for row in result.scalars().all()}


def _pdf_summary(pdf_lesson: Optional[PDFLesson]) -> Optional[PDFLessonSummaryOut]:
    if not pdf_lesson:
        return None
    return PDFLessonSummaryOut(
        pdf_lesson_id=pdf_lesson.pdf_lesson_id,
        storage_key=pdf_lesson.storage_key,
        pdf_url=pdf_lesson.pdf_url or f"/courses/pdf-lessons/file/{pdf_lesson.storage_key}",
        original_filename=pdf_lesson.original_filename,
        file_size=pdf_lesson.file_size,
        page_count=pdf_lesson.page_count,
        processing_status=pdf_lesson.processing_status,
    )


def _progress_ratio(progress: Optional[PDFLessonProgress], pdf_lesson: Optional[PDFLesson]) -> float:
    if not progress or not pdf_lesson or not pdf_lesson.page_count:
        return 0
    return min(1.0, max(0.0, progress.max_page_number_seen / pdf_lesson.page_count))


async def _course_overview(db: AsyncSession, user: User, course: Course) -> CourseOverviewOut:
    items = await _course_items_for_course(db, course.course_id)
    item_ids = [item.course_item_id for item in items]
    pdf_by_item = await _pdf_lessons_by_item(db, item_ids)
    test_by_item = await _tests_by_item(db, item_ids)
    progress_by_lesson = await _progress_by_pdf_lesson(
        db,
        user.user_id,
        [pdf.pdf_lesson_id for pdf in pdf_by_item.values()],
    ) if normalize_role(user.role) == "student" else {}

    now = _utc_now()
    item_outs: list[CourseItemOut] = []
    completed_count = 0
    available_count = 0
    next_course_item_id = None

    for item in items:
        pdf_lesson = pdf_by_item.get(item.course_item_id)
        progress = progress_by_lesson.get(pdf_lesson.pdf_lesson_id) if pdf_lesson else None
        ratio = _progress_ratio(progress, pdf_lesson)
        completed = bool(progress and progress.completed_at)
        access_state = _course_item_access_state(item, now)
        if access_state == "available":
            available_count += 1
            if next_course_item_id is None:
                next_course_item_id = item.course_item_id
        if completed:
            completed_count += 1
        item_outs.append(
            CourseItemOut(
                course_item_id=item.course_item_id,
                course_id=item.course_id,
                item_type=item.item_type,
                title=item.title,
                description=item.description,
                display_order=item.display_order,
                is_enabled=bool(item.is_enabled),
                available_from=item.available_from,
                available_until=item.available_until,
                availability_label=_availability_label(item, now),
                access_state=access_state,
                pdf_lesson=_pdf_summary(pdf_lesson),
                test=(
                    {
                        "test_id": test_by_item[item.course_item_id].test_id,
                        "question_count": test_by_item[item.course_item_id].question_count,
                    }
                    if item.course_item_id in test_by_item
                    else None
                ),
                progress_ratio=ratio,
                last_page_number=progress.last_page_number if progress else None,
                completed=completed,
                action_label=_item_action_label(item.item_type, access_state, completed, ratio),
            )
        )

    item_count = len(item_outs)
    next_action = "Bắt đầu"
    if item_outs:
        first_next = next((item for item in item_outs if item.course_item_id == next_course_item_id), None)
        if first_next:
            next_action = first_next.action_label
    return CourseOverviewOut(
        course_id=course.course_id,
        course_title=course.course_title,
        course_description=course.course_description,
        status=course.status,
        progress_ratio=(completed_count / item_count) if item_count else 0,
        item_count=item_count,
        available_item_count=available_count,
        next_course_item_id=next_course_item_id,
        next_action_label=next_action,
        items=item_outs,
    )


async def _item_for_course(db: AsyncSession, course_id: str, course_item_id: str) -> CourseItem:
    result = await db.execute(
        select(CourseItem).where(
            CourseItem.course_id == course_id,
            CourseItem.course_item_id == course_item_id,
        )
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Course item không tồn tại")
    return item


async def _teacher_courses(db: AsyncSession, user: User) -> list[Course]:
    role = normalize_role(user.role)
    stmt = select(Course).order_by(Course.course_title)
    if role == "teacher":
        stmt = stmt.join(TeacherCourseAssignment, TeacherCourseAssignment.course_id == Course.course_id).where(
            TeacherCourseAssignment.teacher_id == user.user_id
        )
    elif role != "admin":
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập khu vực giảng viên")
    return list((await db.execute(stmt)).scalars().all())


async def _recent_sessions_for_courses(
    db: AsyncSession,
    course_ids: list[str],
    *,
    limit: int = 10,
) -> list[TeacherRecentSessionOut]:
    if not course_ids:
        return []

    tracking_counts = (
        select(
            TrackingPoint.session_id.label("session_id"),
            func.count(TrackingPoint.point_id).label("tracking_points_count"),
        )
        .group_by(TrackingPoint.session_id)
        .subquery()
    )

    item_titles = (
        select(
            CourseItem.course_item_id.label("course_item_id"),
            CourseItem.title.label("item_title"),
            PDFLesson.pdf_lesson_id.label("pdf_lesson_id"),
        )
        .join(PDFLesson, PDFLesson.course_item_id == CourseItem.course_item_id, isouter=True)
        .subquery()
    )

    result = await db.execute(
        select(
            Session.session_id,
            Session.user_id,
            User.full_name,
            User.student_code,
            Session.course_id,
            Course.course_title,
            Session.course_item_id,
            item_titles.c.item_title,
            item_titles.c.pdf_lesson_id,
            Session.started_at,
            Session.ended_at,
            func.coalesce(tracking_counts.c.tracking_points_count, 0),
        )
        .join(Course, Course.course_id == Session.course_id)
        .join(User, User.user_id == Session.user_id, isouter=True)
        .join(item_titles, item_titles.c.course_item_id == Session.course_item_id, isouter=True)
        .join(tracking_counts, tracking_counts.c.session_id == Session.session_id, isouter=True)
        .where(Session.course_id.in_(course_ids))
        .where(Session.session_type == "student_learning")
        .order_by(Session.started_at.desc().nullslast())
        .limit(limit)
    )
    return [
        TeacherRecentSessionOut(
            session_id=row[0],
            user_id=row[1],
            student_name=row[2],
            student_code=row[3],
            course_id=row[4],
            course_title=row[5],
            course_item_id=row[6],
            pdf_lesson_id=row[8],
            item_title=row[7],
            started_at=row[9],
            ended_at=row[10],
            tracking_points_count=int(row[11] or 0),
            has_tracking_data=bool(row[11]),
        )
        for row in result.all()
    ]


async def _teacher_course_card(db: AsyncSession, course: Course) -> TeacherCourseCardOut:
    lesson_count = int(
        (
            await db.execute(
                select(func.count(CourseItem.course_item_id)).where(
                    CourseItem.course_id == course.course_id,
                    CourseItem.item_type == "PDF_LESSON",
                )
            )
        ).scalar_one()
        or 0
    )
    student_count = int(
        (
            await db.execute(
                select(func.count(CourseEnrollment.student_id)).where(
                    CourseEnrollment.course_id == course.course_id,
                    CourseEnrollment.status == "active",
                )
            )
        ).scalar_one()
        or 0
    )
    active_student_count = int(
        (
            await db.execute(
                select(func.count(distinct(Session.user_id))).where(
                    Session.course_id == course.course_id,
                    Session.session_type == "student_learning",
                )
            )
        ).scalar_one()
        or 0
    )
    session_count = int(
        (
            await db.execute(
                select(func.count(Session.session_id)).where(
                    Session.course_id == course.course_id,
                    Session.session_type == "student_learning",
                )
            )
        ).scalar_one()
        or 0
    )
    tracked_session_count = int(
        (
            await db.execute(
                select(func.count(distinct(TrackingPoint.session_id)))
                .join(Session, Session.session_id == TrackingPoint.session_id)
                .where(
                    Session.course_id == course.course_id,
                    Session.session_type == "student_learning",
                )
            )
        ).scalar_one()
        or 0
    )
    recent_activity_at = (
        await db.execute(
            select(func.max(Session.started_at)).where(
                Session.course_id == course.course_id,
                Session.session_type == "student_learning",
            )
        )
    ).scalar_one_or_none()
    return TeacherCourseCardOut(
        course_id=course.course_id,
        course_title=course.course_title,
        course_description=course.course_description,
        lesson_count=lesson_count,
        class_count=0,
        student_count=student_count,
        active_student_count=active_student_count,
        session_count=session_count,
        valid_tracking_session_rate=(tracked_session_count / session_count) if session_count else 0,
        recent_activity_at=recent_activity_at,
    )


async def _teacher_course_summary(db: AsyncSession, course: Course) -> TeacherCourseSummaryOut:
    card = await _teacher_course_card(db, course)
    completed_lesson_count = int(
        (
            await db.execute(
                select(func.count(distinct(PDFLessonProgress.pdf_lesson_id))).where(
                    PDFLessonProgress.course_id == course.course_id,
                    PDFLessonProgress.completed_at.is_not(None),
                )
            )
        ).scalar_one()
        or 0
    )
    recent_sessions = await _recent_sessions_for_courses(db, [course.course_id], limit=8)
    attention_items: list[TeacherAttentionOut] = []
    if card.lesson_count == 0:
        attention_items.append(
            TeacherAttentionOut(
                key="empty-course",
                title="Khóa học chưa có bài học",
                detail="Tạo bài học PDF đầu tiên để học viên có thể bắt đầu học.",
                severity="info",
            )
        )
    elif card.student_count > 0 and card.active_student_count == 0:
        attention_items.append(
            TeacherAttentionOut(
                key="not-started",
                title="Chưa có học viên bắt đầu học",
                detail=f"{card.student_count} học viên đã được ghi danh nhưng chưa có phiên học nào.",
                severity="warning",
            )
        )
    if card.session_count > 0 and card.valid_tracking_session_rate < 0.5:
        attention_items.append(
            TeacherAttentionOut(
                key="tracking-low",
                title="Tỷ lệ phiên có tracking còn thấp",
                detail=f"Chỉ {round(card.valid_tracking_session_rate * 100)}% phiên học hiện có dữ liệu tracking.",
                severity="warning",
            )
        )
    return TeacherCourseSummaryOut(
        course_id=card.course_id,
        course_title=card.course_title,
        course_description=card.course_description,
        lesson_count=card.lesson_count,
        class_count=card.class_count,
        student_count=card.student_count,
        active_student_count=card.active_student_count,
        session_count=card.session_count,
        valid_tracking_session_rate=card.valid_tracking_session_rate,
        completed_lesson_count=completed_lesson_count,
        recent_activity_at=card.recent_activity_at,
        recent_sessions=recent_sessions,
        attention_items=attention_items,
    )


@router.get("/my", response_model=list[CourseOverviewOut])
async def my_courses(
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    stmt = select(Course).order_by(Course.course_title)
    if role == "student":
        stmt = stmt.join(CourseEnrollment, CourseEnrollment.course_id == Course.course_id).where(
            CourseEnrollment.student_id == user.user_id,
            CourseEnrollment.status == "active",
        )
    elif role == "teacher":
        stmt = stmt.join(TeacherCourseAssignment, TeacherCourseAssignment.course_id == Course.course_id).where(
            TeacherCourseAssignment.teacher_id == user.user_id
        )
    elif role != "admin":
        raise HTTPException(status_code=403, detail="Vai trò không hợp lệ")

    courses = list((await db.execute(stmt)).scalars().all())
    return [await _course_overview(db, user, course) for course in courses]


@router.get("/teacher/dashboard", response_model=TeacherDashboardOut)
async def teacher_dashboard(
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    courses = await _teacher_courses(db, user)
    course_cards = [await _teacher_course_card(db, course) for course in courses]
    recent_sessions = await _recent_sessions_for_courses(db, [course.course_id for course in courses], limit=10)
    course_count = len(course_cards)
    student_count = sum(course.student_count for course in course_cards)
    session_count = sum(course.session_count for course in course_cards)
    tracked_sessions = sum(int(round(course.valid_tracking_session_rate * course.session_count)) for course in course_cards)
    attention_items: list[TeacherAttentionOut] = []
    if course_count == 0:
        attention_items.append(
            TeacherAttentionOut(
                key="no-course",
                title="Chưa có khóa học được phân công",
                detail="Quản trị viên cần gán khóa học cho giảng viên trước khi bắt đầu quản lý nội dung.",
                severity="info",
            )
        )
    no_content_count = sum(1 for course in course_cards if course.lesson_count == 0)
    if no_content_count:
        attention_items.append(
            TeacherAttentionOut(
                key="empty-courses",
                title="Có khóa học chưa có bài học",
                detail=f"{no_content_count} khóa học hiện chưa có bài học PDF nào.",
                severity="warning",
            )
        )
    not_started_students = sum(max(0, course.student_count - course.active_student_count) for course in course_cards)
    if not_started_students:
        attention_items.append(
            TeacherAttentionOut(
                key="students-not-started",
                title="Có học viên chưa bắt đầu học",
                detail=f"{not_started_students} lượt ghi danh chưa tạo phiên học nào.",
                severity="info",
            )
        )
    if session_count and tracked_sessions / session_count < 0.5:
        attention_items.append(
            TeacherAttentionOut(
                key="tracking-rate-low",
                title="Tỷ lệ phiên có tracking còn thấp",
                detail=f"Chỉ {round((tracked_sessions / session_count) * 100)}% phiên gần đây có dữ liệu tracking.",
                severity="warning",
            )
        )
    return TeacherDashboardOut(
        course_count=course_count,
        class_count=0,
        student_count=student_count,
        session_count=session_count,
        valid_tracking_session_rate=(tracked_sessions / session_count) if session_count else 0,
        courses=course_cards,
        classes=[],
        recent_sessions=recent_sessions,
        attention_items=attention_items,
    )


@router.get("/{course_id}", response_model=CourseOverviewOut)
async def course_detail(
    course_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    if not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=404, detail="Khóa học không tồn tại hoặc bạn chưa được cấp quyền")
    course = await _course_exists(db, course_id)
    return await _course_overview(db, user, course)


@router.get("/{course_id}/teacher-summary", response_model=TeacherCourseSummaryOut)
async def teacher_course_summary(
    course_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role not in {"teacher", "admin"} or not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=404, detail="Khóa học không tồn tại hoặc bạn chưa được cấp quyền")
    course = await _course_exists(db, course_id)
    return await _teacher_course_summary(db, course)


@router.get("/teacher/{course_id}/analytics", response_model=TeacherCourseAnalyticsOut)
async def teacher_course_analytics(
    course_id: str,
    student_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    minimum_confidence: float = 0,
    document_version: str | None = None,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role not in {"teacher", "admin"} or not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem dữ liệu phân tích này.")
    payload = await build_course_analytics(
        db,
        course_id=course_id,
        student_id=student_id,
        date_from=date_from,
        date_to=date_to,
        minimum_confidence=minimum_confidence,
        document_version=document_version,
    )
    if not payload:
        raise HTTPException(status_code=404, detail="Khóa học không tồn tại")
    payload["recent_sessions"] = await _recent_sessions_for_courses(db, [course_id], limit=8)
    return TeacherCourseAnalyticsOut(**payload)


@router.get("/teacher/{course_id}/lessons/{lesson_id}/analytics", response_model=TeacherPdfLessonAnalyticsOut)
async def teacher_pdf_lesson_analytics(
    course_id: str,
    lesson_id: str,
    student_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    minimum_confidence: float = 0,
    document_version: str | None = None,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role not in {"teacher", "admin"} or not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem dữ liệu phân tích này.")
    payload = await build_pdf_lesson_analytics(
        db,
        course_id=course_id,
        lesson_id=lesson_id,
        student_id=student_id,
        date_from=date_from,
        date_to=date_to,
        minimum_confidence=minimum_confidence,
        document_version=document_version,
    )
    if not payload:
        raise HTTPException(status_code=404, detail="Bài học không tồn tại")
    return TeacherPdfLessonAnalyticsOut(**{key: value for key, value in payload.items() if key != "session_ids" and key != "pdf_url"})


@router.get("/teacher/{course_id}/lessons/{lesson_id}/pages", response_model=list[TeacherPdfLessonPageOut])
async def teacher_pdf_lesson_pages(
    course_id: str,
    lesson_id: str,
    student_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    minimum_confidence: float = 0,
    document_version: str | None = None,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role not in {"teacher", "admin"} or not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem dữ liệu phân tích này.")
    payload = await build_pdf_lesson_analytics(
        db,
        course_id=course_id,
        lesson_id=lesson_id,
        student_id=student_id,
        date_from=date_from,
        date_to=date_to,
        minimum_confidence=minimum_confidence,
        document_version=document_version,
    )
    if not payload:
        raise HTTPException(status_code=404, detail="Bài học không tồn tại")
    return [TeacherPdfLessonPageOut(**row) for row in payload["pages"]]


@router.get("/teacher/{course_id}/lessons/{lesson_id}/pages/{page_number}/heatmap", response_model=TeacherPdfLessonHeatmapOut)
async def teacher_pdf_lesson_heatmap(
    course_id: str,
    lesson_id: str,
    page_number: int,
    student_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    minimum_confidence: float = 0,
    document_version: str | None = None,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role not in {"teacher", "admin"} or not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem dữ liệu phân tích này.")
    try:
        payload = await build_page_heatmap(
            db,
            course_id=course_id,
            lesson_id=lesson_id,
            page_number=page_number,
            student_id=student_id,
            date_from=date_from,
            date_to=date_to,
            minimum_confidence=minimum_confidence,
            document_version=document_version,
        )
    except ValueError:
        raise HTTPException(status_code=404, detail="Trang không tồn tại") from None
    if not payload:
        raise HTTPException(status_code=404, detail="Bài học không tồn tại")
    return TeacherPdfLessonHeatmapOut(**payload)


@router.get("/teacher/{course_id}/lessons/{lesson_id}/document")
async def teacher_pdf_lesson_document(
    course_id: str,
    lesson_id: str,
    document_version: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role not in {"teacher", "admin"} or not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem dữ liệu phân tích này.")
    path = DATA_DIR / "uploads" / "pdf_lessons" / document_version
    if not path.exists():
        raise HTTPException(status_code=404, detail="Không tìm thấy tệp PDF cho phiên bản này")
    return FileResponse(path, media_type="application/pdf")


@router.post("/{course_id}/lessons/pdf", response_model=PDFLessonCreateOut)
async def create_pdf_lesson(
    course_id: str,
    title: str = Form(...),
    description: Optional[str] = Form(default=None),
    is_enabled: bool = Form(default=True),
    available_from: Optional[datetime] = Form(default=None),
    available_until: Optional[datetime] = Form(default=None),
    file: UploadFile = File(...),
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role not in {"teacher", "admin"} or not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền tạo lesson cho khóa học này")

    await _course_exists(db, course_id)
    file_bytes = await file.read()
    validate_pdf_upload(file, file_bytes)
    storage_key, stored_path = store_pdf_file(course_id, file, file_bytes)

    try:
        page_count = extract_pdf_page_count(stored_path)
    except Exception as exc:
        if stored_path.exists():
            stored_path.unlink()
        raise HTTPException(status_code=400, detail=f"Không thể đọc metadata PDF: {exc}") from exc

    existing_items = await _course_items_for_course(db, course_id)
    display_order = (max((item.display_order for item in existing_items), default=0) + 1)
    course_item_id = f"CI_{course_id}_{int(time() * 1000)}"
    pdf_lesson_id = f"PDF_{course_id}_{int(time() * 1000)}"

    course_item = CourseItem(
        course_item_id=course_item_id,
        course_id=course_id,
        item_type="PDF_LESSON",
        title=title.strip(),
        description=(description or "").strip() or None,
        display_order=display_order,
        is_enabled=is_enabled,
        available_from=available_from,
        available_until=available_until,
    )
    db.add(course_item)
    db.add(
        PDFLesson(
            pdf_lesson_id=pdf_lesson_id,
            course_item_id=course_item_id,
            storage_key=storage_key,
            pdf_url=f"/courses/pdf-lessons/file/{storage_key}",
            original_filename=file.filename or Path(storage_key).name,
            file_size=len(file_bytes),
            page_count=page_count,
            processing_status="READY",
        )
    )
    await db.flush()

    overview = await _course_overview(db, user, await _course_exists(db, course_id))
    created = next(item for item in overview.items if item.course_item_id == course_item_id)
    return PDFLessonCreateOut(course_item=created)


@router.patch("/{course_id}/items/{course_item_id}", response_model=CourseItemOut)
async def update_course_item(
    course_id: str,
    course_item_id: str,
    body: CourseItemUpdateIn,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role not in {"teacher", "admin"} or not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền cập nhật item của khóa học này")

    item = await _item_for_course(db, course_id, course_item_id)
    for field in ("title", "description", "is_enabled", "available_from", "available_until"):
        value = getattr(body, field)
        if value is not None:
            setattr(item, field, value)
    await db.flush()

    overview = await _course_overview(db, user, await _course_exists(db, course_id))
    return next(item_out for item_out in overview.items if item_out.course_item_id == course_item_id)


@router.patch("/{course_id}/lessons/pdf/{pdf_lesson_id}", response_model=CourseItemOut)
async def replace_pdf_lesson(
    course_id: str,
    pdf_lesson_id: str,
    title: Optional[str] = Form(default=None),
    description: Optional[str] = Form(default=None),
    is_enabled: Optional[bool] = Form(default=None),
    available_from: Optional[datetime] = Form(default=None),
    available_until: Optional[datetime] = Form(default=None),
    file: Optional[UploadFile] = File(default=None),
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role not in {"teacher", "admin"} or not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền cập nhật lesson PDF của khóa học này")

    pdf_lesson = await db.scalar(select(PDFLesson).where(PDFLesson.pdf_lesson_id == pdf_lesson_id))
    if not pdf_lesson:
        raise HTTPException(status_code=404, detail="PDF lesson không tồn tại")
    item = await _item_for_course(db, course_id, pdf_lesson.course_item_id)

    if title is not None:
        item.title = title.strip()
    if description is not None:
        item.description = description.strip() or None
    if is_enabled is not None:
        item.is_enabled = is_enabled
    if available_from is not None:
        item.available_from = available_from
    if available_until is not None:
        item.available_until = available_until

    if file is not None:
        file_bytes = await file.read()
        validate_pdf_upload(file, file_bytes)
        storage_key, updated_path = store_pdf_file(course_id, file, file_bytes)
        pdf_lesson.storage_key = storage_key
        pdf_lesson.pdf_url = f"/courses/pdf-lessons/file/{storage_key}"
        pdf_lesson.original_filename = file.filename or pdf_lesson.original_filename
        pdf_lesson.file_size = len(file_bytes)
        pdf_lesson.page_count = extract_pdf_page_count(updated_path)
        pdf_lesson.processing_status = "READY"

    await db.flush()
    overview = await _course_overview(db, user, await _course_exists(db, course_id))
    return next(item_out for item_out in overview.items if item_out.course_item_id == item.course_item_id)


@router.delete("/{course_id}/items/{course_item_id}")
async def delete_course_item(
    course_id: str,
    course_item_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role not in {"teacher", "admin"} or not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền xóa item của khóa học này")
    item = await _item_for_course(db, course_id, course_item_id)
    pdf_lesson = await db.scalar(select(PDFLesson).where(PDFLesson.course_item_id == course_item_id))
    await db.delete(item)
    await db.flush()
    if pdf_lesson and pdf_lesson.storage_key:
        path = DATA_DIR / "uploads" / "pdf_lessons" / pdf_lesson.storage_key
        if path.exists():
            path.unlink()
    return {"ok": True}


@router.post("/{course_id}/items/reorder")
async def reorder_course_items(
    course_id: str,
    body: CourseItemReorderIn,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role not in {"teacher", "admin"} or not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền sắp xếp item của khóa học này")
    items = {item.course_item_id: item for item in await _course_items_for_course(db, course_id)}
    if set(body.item_ids) != set(items):
        raise HTTPException(status_code=400, detail="Danh sách item reorder không khớp với khóa học")
    for index, item_id in enumerate(body.item_ids, start=1):
        items[item_id].display_order = index
    await db.flush()
    return {"ok": True}


@router.post("/{course_id}/items/bulk")
async def bulk_update_course_items(
    course_id: str,
    body: CourseItemBulkUpdateIn,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role not in {"teacher", "admin"} or not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền cập nhật hàng loạt item của khóa học này")

    items = await _course_items_for_course(db, course_id)
    targets = [item for item in items if item.course_item_id in set(body.item_ids)]
    if len(targets) != len(set(body.item_ids)):
        raise HTTPException(status_code=400, detail="Có item không thuộc khóa học này")

    if body.action == "enable":
        for item in targets:
            item.is_enabled = True
    elif body.action == "disable":
        for item in targets:
            item.is_enabled = False
    elif body.action == "set_availability":
        for item in targets:
            item.available_from = body.available_from
            item.available_until = body.available_until
    else:
        raise HTTPException(status_code=400, detail="Bulk action không hợp lệ")

    await db.flush()
    return {"ok": True}


@router.get("/pdf-lessons/file/{storage_key:path}")
async def get_pdf_lesson_file(
    storage_key: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    pdf_lesson = await db.scalar(select(PDFLesson).where(PDFLesson.storage_key == storage_key))
    if not pdf_lesson:
        raise HTTPException(status_code=404, detail="PDF lesson không tồn tại")
    item = await db.scalar(select(CourseItem).where(CourseItem.course_item_id == pdf_lesson.course_item_id))
    if not item or not await _can_access_course(db, user, item.course_id):
        raise HTTPException(status_code=404, detail="PDF lesson không tồn tại hoặc bạn chưa được cấp quyền")
    return pdf_file_response(storage_key)


@router.get("/pdf-lessons/{pdf_lesson_id}/progress", response_model=PDFLessonProgressOut)
async def get_pdf_lesson_progress(
    pdf_lesson_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    progress = await db.scalar(
        select(PDFLessonProgress).where(
            PDFLessonProgress.pdf_lesson_id == pdf_lesson_id,
            PDFLessonProgress.user_id == user.user_id,
        )
    )
    if not progress:
        return PDFLessonProgressOut(
            pdf_lesson_id=pdf_lesson_id,
            user_id=user.user_id,
            last_page_number=1,
            max_page_number_seen=1,
            completed_at=None,
            progress_ratio=0,
        )
    pdf_lesson = await db.scalar(select(PDFLesson).where(PDFLesson.pdf_lesson_id == pdf_lesson_id))
    ratio = _progress_ratio(progress, pdf_lesson)
    return PDFLessonProgressOut(
        pdf_lesson_id=pdf_lesson_id,
        user_id=user.user_id,
        last_page_number=progress.last_page_number,
        max_page_number_seen=progress.max_page_number_seen,
        completed_at=progress.completed_at,
        progress_ratio=ratio,
    )


@router.post("/pdf-lessons/{pdf_lesson_id}/progress", response_model=PDFLessonProgressOut)
async def update_pdf_lesson_progress(
    pdf_lesson_id: str,
    last_page_number: int = Form(...),
    max_page_number_seen: int = Form(...),
    completed: bool = Form(default=False),
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    pdf_lesson = await db.scalar(select(PDFLesson).where(PDFLesson.pdf_lesson_id == pdf_lesson_id))
    if not pdf_lesson:
        raise HTTPException(status_code=404, detail="PDF lesson không tồn tại")
    item = await db.scalar(select(CourseItem).where(CourseItem.course_item_id == pdf_lesson.course_item_id))
    if not item or not await _can_access_course(db, user, item.course_id):
        raise HTTPException(status_code=404, detail="PDF lesson không tồn tại hoặc bạn chưa được cấp quyền")

    progress = await db.scalar(
        select(PDFLessonProgress).where(
            PDFLessonProgress.pdf_lesson_id == pdf_lesson_id,
            PDFLessonProgress.user_id == user.user_id,
        )
    )
    if not progress:
        progress = PDFLessonProgress(
            progress_id=f"PLP_{user.user_id}_{pdf_lesson_id}",
            user_id=user.user_id,
            course_id=item.course_id,
            course_item_id=item.course_item_id,
            pdf_lesson_id=pdf_lesson_id,
        )
        db.add(progress)

    progress.last_page_number = max(1, last_page_number)
    progress.max_page_number_seen = max(progress.max_page_number_seen or 1, max_page_number_seen, progress.last_page_number)
    if completed:
        progress.completed_at = _utc_now()
    await db.flush()
    return PDFLessonProgressOut(
        pdf_lesson_id=pdf_lesson_id,
        user_id=user.user_id,
        last_page_number=progress.last_page_number,
        max_page_number_seen=progress.max_page_number_seen,
        completed_at=progress.completed_at,
        progress_ratio=_progress_ratio(progress, pdf_lesson),
    )


@router.post("/{course_id}/imports")
async def upload_course_content_deprecated(
    course_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role not in {"teacher", "admin"} or not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền upload nội dung cho khóa học này")
    raise HTTPException(status_code=410, detail="Endpoint cũ đã bị loại bỏ. Hãy dùng POST /courses/{course_id}/lessons/pdf.")


@router.post("/teacher-assignments")
async def assign_teacher(
    body: AssignmentIn,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    require_admin_user(user)
    await _user_with_role(db, body.teacher_id, "teacher")
    await _course_exists(db, body.course_id)

    existing = await db.scalar(
        select(TeacherCourseAssignment).where(
            TeacherCourseAssignment.teacher_id == body.teacher_id,
            TeacherCourseAssignment.course_id == body.course_id,
        )
    )
    if existing:
        return {"ok": True, "created": False}

    db.add(
        TeacherCourseAssignment(
            teacher_id=body.teacher_id,
            course_id=body.course_id,
            assigned_by=user.user_id,
        )
    )
    await db.flush()
    return {"ok": True, "created": True}


@router.delete("/teacher-assignments/{teacher_id}/{course_id}")
async def unassign_teacher(
    teacher_id: str,
    course_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    require_admin_user(user)
    result = await db.execute(
        select(TeacherCourseAssignment).where(
            TeacherCourseAssignment.teacher_id == teacher_id,
            TeacherCourseAssignment.course_id == course_id,
        )
    )
    assignment = result.scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment không tồn tại")
    await db.delete(assignment)
    return {"ok": True}


@router.post("/enrollments")
async def enroll_student(
    body: EnrollmentIn,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    require_admin_user(user)
    if body.status not in {"active", "inactive"}:
        raise HTTPException(status_code=400, detail="Trạng thái enrollment không hợp lệ")
    await _user_with_role(db, body.student_id, "student")
    await _course_exists(db, body.course_id)

    existing = await db.scalar(
        select(CourseEnrollment).where(
            CourseEnrollment.student_id == body.student_id,
            CourseEnrollment.course_id == body.course_id,
        )
    )
    if existing:
        existing.status = body.status
        return {"ok": True, "created": False}

    db.add(
        CourseEnrollment(
            student_id=body.student_id,
            course_id=body.course_id,
            enrolled_by=user.user_id,
            status=body.status,
        )
    )
    await db.flush()
    return {"ok": True, "created": True}


@router.delete("/enrollments/{student_id}/{course_id}")
async def unenroll_student(
    student_id: str,
    course_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    require_admin_user(user)
    result = await db.execute(
        select(CourseEnrollment).where(
            CourseEnrollment.student_id == student_id,
            CourseEnrollment.course_id == course_id,
        )
    )
    enrollment = result.scalar_one_or_none()
    if not enrollment:
        raise HTTPException(status_code=404, detail="Enrollment không tồn tại")
    await db.delete(enrollment)
    return {"ok": True}
