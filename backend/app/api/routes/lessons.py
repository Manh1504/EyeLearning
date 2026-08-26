from datetime import datetime, timezone
from pathlib import Path
from shutil import rmtree

import pymupdf
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    can_access_course,
    can_manage_course,
    get_current_user,
    require_roles,
)
from app.core.ratelimit import rate_limit
from app.core.config import settings
from app.db.session import get_db
from app.models.auth import User
from app.models.course import (
    Course,
    Enrollment,
    Lesson,
    LessonContent,
    LessonProgress,
    Module,
)
from app.schemas.course import LessonCreateIn, SlideCreateIn, SlideOut
from app.schemas.gaze import OkOut, ProgressPatchIn

router = APIRouter(tags=["lessons"])


async def _get_lesson_or_404(db: AsyncSession, lesson_id: str) -> Lesson:
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài học")
    return lesson


async def _check_course_owner(db: AsyncSession, lesson: Lesson, user: User) -> None:
    """Chỉ admin hoặc chủ khóa học mới sửa/xóa bài học, chương, slide."""
    module = await db.get(Module, lesson.module_id)
    course = await db.get(Course, module.course_id) if module else None
    if course is None or not await can_manage_course(db, course, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")


async def _check_course_access(db: AsyncSession, lesson: Lesson, user: User) -> None:
    """Admin / chủ khóa / GV được phân công: xem và thêm slide."""
    module = await db.get(Module, lesson.module_id)
    course = await db.get(Course, module.course_id) if module else None
    if course is None or not await can_access_course(db, course, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")


async def _get_enrollment_for_lesson(
    db: AsyncSession, lesson: Lesson, user: User
) -> Enrollment | None:
    module = await db.get(Module, lesson.module_id)
    if module is None:
        return None
    stmt = select(Enrollment).where(
        Enrollment.course_id == module.course_id, Enrollment.student_id == user.id
    )
    return (await db.execute(stmt)).scalar_one_or_none()


@router.post(
    "/teacher/modules/{module_id}/lessons", response_model=dict, status_code=201
)
async def create_lesson(
    module_id: str,
    body: LessonCreateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    module = await db.get(Module, module_id)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy chương")
    course = await db.get(Course, module.course_id)
    if course is None or not await can_manage_course(db, course, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    next_index = (
        await db.execute(
            select(func.coalesce(func.max(Lesson.order_index), 0) + 1).where(
                Lesson.module_id == module_id
            )
        )
    ).scalar_one()
    lesson = Lesson(
        module_id=module_id,
        title=body.title,
        order_index=next_index,
        content_url=body.content_url,
    )
    db.add(lesson)
    await db.commit()
    await db.refresh(lesson)
    return {"id": lesson.id, "title": lesson.title, "orderIndex": lesson.order_index}


@router.patch("/teacher/lessons/{lesson_id}")
async def update_lesson(
    lesson_id: str,
    body: LessonCreateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_or_404(db, lesson_id)
    await _check_course_owner(db, lesson, user)
    lesson.title = body.title
    if body.content_url is not None:
        lesson.content_url = body.content_url
    await db.commit()
    return {"ok": True}


@router.delete("/teacher/lessons/{lesson_id}")
async def delete_lesson(
    lesson_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_or_404(db, lesson_id)
    await _check_course_owner(db, lesson, user)
    await db.delete(lesson)
    await db.commit()
    _clear_lesson_media(lesson_id)
    return {"ok": True}


@router.post("/teacher/lessons/{lesson_id}/slides", status_code=201)
async def add_slide(
    lesson_id: str,
    body: SlideCreateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_or_404(db, lesson_id)
    await _check_course_access(db, lesson, user)
    next_index = (
        await db.execute(
            select(func.coalesce(func.max(LessonContent.order_index), 0) + 1).where(
                LessonContent.lesson_id == lesson_id
            )
        )
    ).scalar_one()
    slide = LessonContent(
        lesson_id=lesson_id,
        order_index=next_index,
        image_url=body.image_url,
        content_json={"title": body.title} if body.title else {},
    )
    db.add(slide)
    await db.commit()
    await db.refresh(slide)
    return {"id": slide.id, "orderIndex": slide.order_index}


def _lesson_media_dir(lesson_id: str) -> Path:
    return settings.media_path / "lessons" / str(lesson_id)


def _clear_lesson_media(lesson_id: str) -> None:
    """Xóa toàn bộ slide ảnh đã render của bài học (file trên đĩa)."""
    rmtree(_lesson_media_dir(lesson_id), ignore_errors=True)


def _render_pdf_slides(lesson_id: str, data: bytes) -> int:
    """Render PDF thành JPEG từng trang; trả về số trang. Lỗi PDF gọi HTTPException(400)."""
    if len(data) > settings.max_pdf_bytes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="File PDF quá lớn")
    if not data.startswith(b"%PDF"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="File không phải PDF hợp lệ")
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
        count = doc.page_count
    except Exception as exc:  # PDF hỏng/encrypted
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail=f"Không đọc được PDF: {exc}"
        ) from exc
    if count == 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="PDF không có trang nào")

    if doc.needs_pass:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="PDF đang bị bảo vệ bằng mật khẩu — hãy gỡ mật khẩu trước khi tải lên",
        )

    out_dir = _lesson_media_dir(lesson_id)
    out_dir.mkdir(parents=True, exist_ok=True)
    # Render ~144dpi (matrix 2×2), đủ nét cho màn hình mà không quá nặng.
    zoom = pymupdf.Matrix(2, 2)
    try:
        for page_no in range(count):
            pix = doc.load_page(page_no).get_pixmap(matrix=zoom, colorspace=pymupdf.csRGB)
            target = out_dir / f"slide_{page_no + 1:03d}.jpg"
            pix.pil_save(target, format="JPEG", quality=85)
    except Exception as exc:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail=f"Không render được PDF: {exc}"
        ) from exc
    finally:
        doc.close()
    return count


@router.post(
    "/teacher/lessons/{lesson_id}/slides/upload",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit(15, 60, "upload"))],
)
async def upload_lesson_pdf(
    lesson_id: str,
    pdf: UploadFile = File(...),
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Upload PDF → render từng trang ra JPEG → tạo LessonContent cho mỗi trang.
    Thay thế toàn bộ slide cũ của bài. Nếu bài đã có dữ liệu gaze (kéo theo
    ràng buộc khóa ngoại), việc thay thế sẽ bị chặn để không phá dữ liệu phân tích."""
    lesson = await _get_lesson_or_404(db, lesson_id)
    await _check_course_access(db, lesson, user)

    data = await pdf.read()
    count = _render_pdf_slides(lesson_id, data)

    from sqlalchemy import delete

    stmt = delete(LessonContent).where(LessonContent.lesson_id == lesson_id)
    await db.execute(stmt)
    for page_no in range(count):
        db.add(
            LessonContent(
                lesson_id=lesson_id,
                order_index=page_no + 1,
                image_url=f"/media/lessons/{lesson_id}/slide_{page_no + 1:03d}.jpg",
                content_json={"title": f"Slide {page_no + 1}"},
            )
        )
    try:
        await db.commit()
    except Exception as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Không thay thế được slide — bài học đã có dữ liệu quan sát",
        ) from exc
    return {"ok": True, "slides": count, "filename": pdf.filename or "lesson.pdf"}


@router.delete("/teacher/slides/{slide_id}")
async def delete_slide(
    slide_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    slide = await db.get(LessonContent, slide_id)
    if slide is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy slide")
    lesson = await db.get(Lesson, slide.lesson_id)
    await _check_course_owner(db, lesson, user)
    await db.delete(slide)
    await db.commit()
    return {"ok": True}


@router.get("/api/lessons/{lesson_id}/contents", response_model=list[SlideOut])
async def get_lesson_contents(
    lesson_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_or_404(db, lesson_id)
    enrollment = await _get_enrollment_for_lesson(db, lesson, user)
    module = await db.get(Module, lesson.module_id)
    course = await db.get(Course, module.course_id) if module else None
    is_owner = course is not None and await can_access_course(db, course, user)
    if not is_owner and enrollment is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Chưa đăng ký khóa học")
    stmt = (
        select(LessonContent)
        .where(LessonContent.lesson_id == lesson_id)
        .order_by(LessonContent.order_index)
    )
    slides = (await db.execute(stmt)).scalars().all()
    return [
        SlideOut(
            id=s.id,
            title=s.content_json.get("title") or f"Slide {s.order_index}",
            image_url=s.image_url,
        )
        for s in slides
    ]


@router.patch("/api/lessons/{lesson_id}/progress", response_model=OkOut)
async def patch_lesson_progress(
    lesson_id: str,
    body: ProgressPatchIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lesson = await _get_lesson_or_404(db, lesson_id)
    enrollment = await _get_enrollment_for_lesson(db, lesson, user)
    if enrollment is None:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Chưa đăng ký khóa học")

    stmt = select(LessonProgress).where(
        LessonProgress.enrollment_id == enrollment.id,
        LessonProgress.lesson_id == lesson_id,
    )
    progress = (await db.execute(stmt)).scalar_one_or_none()
    if progress is None:
        progress = LessonProgress(enrollment_id=enrollment.id, lesson_id=lesson_id)
        db.add(progress)

    slide_order = body.last_slide + 1
    viewed = set(progress.viewed_slides or [])
    viewed.add(slide_order)
    progress.viewed_slides = sorted(viewed)
    progress.last_watched_at = datetime.now(timezone.utc)

    total_slides = (
        await db.execute(
            select(func.count(LessonContent.id)).where(
                LessonContent.lesson_id == lesson_id
            )
        )
    ).scalar_one()
    if body.completed or (total_slides and len(viewed) >= total_slides):
        progress.status = "completed"
        progress.completed_at = progress.completed_at or datetime.now(timezone.utc)
    await db.commit()
    return OkOut()
