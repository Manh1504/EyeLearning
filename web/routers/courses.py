import re
from pathlib import Path
from time import time
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, literal, select
from sqlalchemy.ext.asyncio import AsyncSession

from web.authz import current_user_from_cookie, normalize_role, require_admin_user
from web.database import get_db
from web.models import (
    ContentImport,
    Course,
    CourseEnrollment,
    CourseModule,
    Lesson,
    LessonActivity,
    TeacherCourseAssignment,
    User,
)
from web.services.lesson_seed_service import ensure_mlops_data_lesson

router = APIRouter(prefix="/courses", tags=["courses"])
IMPORT_ROOT = Path("data/imports")
MAX_IMPORT_BYTES = 100 * 1024 * 1024


class CourseOut(BaseModel):
    course_id: str
    course_title: str
    course_description: Optional[str] = None
    lesson_id: Optional[str] = None
    lesson_title: Optional[str] = None
    enrollment_status: Optional[str] = None
    instructor_name: Optional[str] = None
    module_count: int = 0
    lesson_count: int = 0
    activity_count: int = 0
    completed_activity_count: int = 0
    progress_ratio: float = 0
    next_module_id: Optional[str] = None
    next_module_title: Optional[str] = None
    next_lesson_id: Optional[str] = None
    next_lesson_title: Optional[str] = None
    next_activity_id: Optional[str] = None
    next_activity_title: Optional[str] = None
    next_activity_type: Optional[str] = None
    next_content_version_id: Optional[str] = None
    next_estimated_duration_min: Optional[int] = None
    next_tracking_required: bool = False
    primary_cta_label: str = "Bắt đầu khóa học"


class ActivityOut(BaseModel):
    activity_id: str
    activity_type: str
    title: str
    description: Optional[str] = None
    order_index: int
    estimated_duration_min: Optional[int] = None
    tracking_enabled: bool
    tracking_mode: Optional[str] = None
    content_version_id: Optional[str] = None
    status: str = "available"


class LessonNodeOut(BaseModel):
    lesson_id: str
    lesson_title: str
    lesson_description: Optional[str] = None
    order_index: int
    estimated_duration_min: Optional[int] = None
    activities: list[ActivityOut]


class ModuleOut(BaseModel):
    module_id: str
    module_title: str
    module_description: Optional[str] = None
    order_index: int
    estimated_duration_min: Optional[int] = None
    lessons: list[LessonNodeOut]


class CourseDetailOut(CourseOut):
    modules: list[ModuleOut]


class ContentImportOut(BaseModel):
    import_id: str
    course_id: str
    lesson_id: Optional[str] = None
    source_filename: str
    source_mime_type: Optional[str] = None
    source_size_bytes: Optional[int] = None
    status: str
    adapter_key: Optional[str] = None
    error_message: Optional[str] = None
    metadata_json: Optional[dict] = None

    class Config:
        from_attributes = True


class AssignmentIn(BaseModel):
    teacher_id: str
    course_id: str


class EnrollmentIn(BaseModel):
    student_id: str
    course_id: str
    status: str = "active"


async def _user_with_role(db: AsyncSession, user_id: str, role: str) -> User:
    result = await db.execute(select(User).where(User.user_id == user_id))
    user = result.scalar_one_or_none()
    if not user or normalize_role(user.role) != role or not user.is_active:
        raise HTTPException(status_code=400, detail=f"Tài khoản không phải {role} hợp lệ")
    return user


async def _course_exists(db: AsyncSession, course_id: str) -> None:
    if not await db.scalar(select(Course.course_id).where(Course.course_id == course_id)):
        raise HTTPException(status_code=404, detail="Course không tồn tại")


def _course_row(row) -> dict:
    return {
        "course_id": row.course_id,
        "course_title": row.course_title,
        "course_description": row.course_description,
        "lesson_id": row.next_lesson_id,
        "lesson_title": row.next_lesson_title,
        "enrollment_status": getattr(row, "enrollment_status", None),
        "instructor_name": getattr(row, "instructor_name", None),
        "module_count": int(getattr(row, "module_count", 0) or 0),
        "lesson_count": int(getattr(row, "lesson_count", 0) or 0),
        "activity_count": int(getattr(row, "activity_count", 0) or 0),
        "completed_activity_count": 0,
        "progress_ratio": 0,
        "next_module_id": getattr(row, "next_module_id", None),
        "next_module_title": getattr(row, "next_module_title", None),
        "next_lesson_id": row.next_lesson_id,
        "next_lesson_title": row.next_lesson_title,
        "next_activity_id": getattr(row, "next_activity_id", None),
        "next_activity_title": getattr(row, "next_activity_title", None),
        "next_activity_type": getattr(row, "next_activity_type", None),
        "next_content_version_id": getattr(row, "next_content_version_id", None),
        "next_estimated_duration_min": getattr(row, "next_estimated_duration_min", None),
        "next_tracking_required": bool(getattr(row, "next_tracking_required", False)),
        "primary_cta_label": "Bắt đầu khóa học",
    }


def _slug_filename(filename: str) -> str:
    stem = re.sub(r"[^A-Za-z0-9._-]+", "-", Path(filename).name).strip("-")
    return stem or "upload"


def _activity_type_label(activity_type: Optional[str]) -> str:
    labels = {
        "SLIDE_DECK": "Bộ slide",
        "DOCUMENT": "Tài liệu đọc",
        "VIDEO": "Video",
        "QUIZ": "Quiz",
        "TEXT": "Bài đọc",
    }
    return labels.get(activity_type or "", activity_type or "Hoạt động")


async def _can_access_course(db: AsyncSession, user: User, course_id: str) -> bool:
    role = normalize_role(user.role)
    if role == "admin":
        return True
    if role == "student":
        exists = await db.scalar(
            select(CourseEnrollment.course_id).where(
                CourseEnrollment.course_id == course_id,
                CourseEnrollment.student_id == user.user_id,
                CourseEnrollment.status == "active",
            )
        )
        return bool(exists)
    if role == "teacher":
        exists = await db.scalar(
            select(TeacherCourseAssignment.course_id).where(
                TeacherCourseAssignment.course_id == course_id,
                TeacherCourseAssignment.teacher_id == user.user_id,
            )
        )
        return bool(exists)
    return False


async def _course_summary_rows(db: AsyncSession, user: User) -> list:
    role = normalize_role(user.role)
    base = (
        select(
            Course.course_id,
            Course.course_title,
            Course.course_description,
            (CourseEnrollment.status if role == "student" else literal(None)).label("enrollment_status"),
            func.count(func.distinct(CourseModule.module_id)).label("module_count"),
            func.count(func.distinct(Lesson.lesson_id)).label("lesson_count"),
            func.count(func.distinct(LessonActivity.activity_id)).label("activity_count"),
        )
        .outerjoin(CourseModule, CourseModule.course_id == Course.course_id)
        .outerjoin(Lesson, Lesson.course_id == Course.course_id)
        .outerjoin(LessonActivity, LessonActivity.lesson_id == Lesson.lesson_id)
        .group_by(Course.course_id)
        .order_by(Course.course_title)
    )
    if role == "student":
        base = (
            base.join(CourseEnrollment, CourseEnrollment.course_id == Course.course_id)
            .where(CourseEnrollment.student_id == user.user_id)
            .where(CourseEnrollment.status == "active")
            .group_by(CourseEnrollment.status)
        )
    elif role == "teacher":
        base = base.join(TeacherCourseAssignment, TeacherCourseAssignment.course_id == Course.course_id).where(
            TeacherCourseAssignment.teacher_id == user.user_id
        )
    elif role != "admin":
        raise HTTPException(status_code=403, detail="Vai trò không hợp lệ")

    rows = list((await db.execute(base)).all())
    enriched = []
    for row in rows:
        next_stmt = (
            select(
                CourseModule.module_id.label("next_module_id"),
                CourseModule.module_title.label("next_module_title"),
                Lesson.lesson_id.label("next_lesson_id"),
                Lesson.lesson_title.label("next_lesson_title"),
                LessonActivity.activity_id.label("next_activity_id"),
                LessonActivity.title.label("next_activity_title"),
                LessonActivity.activity_type.label("next_activity_type"),
                LessonActivity.content_version_id.label("next_content_version_id"),
                LessonActivity.estimated_duration_min.label("next_estimated_duration_min"),
                LessonActivity.tracking_enabled.label("next_tracking_required"),
            )
            .select_from(LessonActivity)
            .join(Lesson, Lesson.lesson_id == LessonActivity.lesson_id)
            .outerjoin(CourseModule, CourseModule.module_id == Lesson.module_id)
            .where(Lesson.course_id == row.course_id)
            .order_by(CourseModule.order_index.nullslast(), Lesson.order_index, LessonActivity.order_index)
            .limit(1)
        )
        next_row = (await db.execute(next_stmt)).one_or_none()
        teacher_result = await db.execute(
            select(User.full_name)
            .join(Lesson, Lesson.teacher_id == User.user_id)
            .where(Lesson.course_id == row.course_id)
            .order_by(Lesson.created_at)
            .limit(1)
        )
        enriched.append(
            type(
                "CourseSummaryRow",
                (),
                {
                    **row._mapping,
                    **(next_row._mapping if next_row else {}),
                    "instructor_name": teacher_result.scalar_one_or_none(),
                },
            )()
        )
    return enriched


@router.get("/my", response_model=list[CourseOut])
async def my_courses(
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await ensure_mlops_data_lesson(db)
    return [_course_row(row) for row in await _course_summary_rows(db, user)]


@router.get("/{course_id}", response_model=CourseDetailOut)
async def course_detail(
    course_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await ensure_mlops_data_lesson(db)
    if not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=404, detail="Khóa học không tồn tại hoặc bạn chưa được cấp quyền")

    course = await db.scalar(select(Course).where(Course.course_id == course_id))
    if not course:
        raise HTTPException(status_code=404, detail="Course không tồn tại")

    summary = next((row for row in await _course_summary_rows(db, user) if row.course_id == course_id), None)
    modules_result = await db.execute(
        select(CourseModule).where(CourseModule.course_id == course_id).order_by(CourseModule.order_index, CourseModule.created_at)
    )
    modules = []
    for module in modules_result.scalars().all():
        lesson_result = await db.execute(
            select(Lesson)
            .where(Lesson.course_id == course_id, Lesson.module_id == module.module_id)
            .order_by(Lesson.order_index, Lesson.created_at)
        )
        lessons = []
        for lesson in lesson_result.scalars().all():
            activity_result = await db.execute(
                select(LessonActivity)
                .where(LessonActivity.lesson_id == lesson.lesson_id)
                .order_by(LessonActivity.order_index, LessonActivity.created_at)
            )
            activities = [
                ActivityOut(
                    activity_id=activity.activity_id,
                    activity_type=activity.activity_type,
                    title=activity.title,
                    description=activity.description,
                    order_index=activity.order_index,
                    estimated_duration_min=activity.estimated_duration_min,
                    tracking_enabled=activity.tracking_enabled,
                    tracking_mode=activity.tracking_mode,
                    content_version_id=activity.content_version_id,
                    status="available",
                )
                for activity in activity_result.scalars().all()
            ]
            lessons.append(
                LessonNodeOut(
                    lesson_id=lesson.lesson_id,
                    lesson_title=lesson.lesson_title,
                    lesson_description=lesson.lesson_description,
                    order_index=lesson.order_index,
                    estimated_duration_min=lesson.estimated_duration_min,
                    activities=activities,
                )
            )
        modules.append(
            ModuleOut(
                module_id=module.module_id,
                module_title=module.module_title,
                module_description=module.module_description,
                order_index=module.order_index,
                estimated_duration_min=module.estimated_duration_min,
                lessons=lessons,
            )
        )

    base = _course_row(summary) if summary else {
        "course_id": course.course_id,
        "course_title": course.course_title,
        "course_description": course.course_description,
    }
    return {**base, "modules": modules}


@router.post("/{course_id}/imports", response_model=ContentImportOut)
async def upload_course_content(
    course_id: str,
    request: Request,
    filename: str,
    lesson_id: Optional[str] = None,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    role = normalize_role(user.role)
    if role not in {"teacher", "admin"} or not await _can_access_course(db, user, course_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền import nội dung cho khóa học này")

    if lesson_id:
        lesson_exists = await db.scalar(select(Lesson.lesson_id).where(Lesson.lesson_id == lesson_id, Lesson.course_id == course_id))
        if not lesson_exists:
            raise HTTPException(status_code=404, detail="Lesson không thuộc khóa học này")

    safe_filename = _slug_filename(filename)
    extension = Path(safe_filename).suffix.lower()
    if extension not in {".pdf", ".pptx"}:
        raise HTTPException(status_code=400, detail="ELA hiện hỗ trợ import PDF hoặc PPTX")

    data = await request.body()
    if not data:
        raise HTTPException(status_code=400, detail="File import rỗng")
    if len(data) > MAX_IMPORT_BYTES:
        raise HTTPException(status_code=413, detail="File import vượt quá giới hạn 100MB")

    import_id = f"IMP_{course_id}_{int(time() * 1000)}"
    target_dir = IMPORT_ROOT / course_id / import_id
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / safe_filename
    target_path.write_bytes(data)

    adapter_key = "pdf_adapter_pending" if extension == ".pdf" else "pptx_adapter_pending"
    status = "uploaded"
    metadata = {
        "storage_path": str(target_path),
        "original_filename": filename,
        "next_step": "preview_and_publish",
        "supported_activity_types": ["SLIDE_DECK", "DOCUMENT"],
        "processing_note": "File đã được lưu. Bước trích xuất cấu trúc/preview cần adapter xử lý nội dung trước khi publish.",
    }
    row = ContentImport(
        import_id=import_id,
        course_id=course_id,
        lesson_id=lesson_id,
        uploaded_by=user.user_id,
        source_filename=safe_filename,
        source_mime_type=request.headers.get("content-type"),
        source_size_bytes=len(data),
        status=status,
        adapter_key=adapter_key,
        metadata_json=metadata,
    )
    db.add(row)
    await db.flush()
    return row


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
