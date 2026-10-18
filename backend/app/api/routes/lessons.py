import asyncio
import logging
import uuid
from datetime import datetime, timezone

import pymupdf
from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import (
    can_access_course,
    can_manage_course,
    get_current_user,
    require_internal_token,
    require_roles,
)
from app.core.ratelimit import rate_limit
from app.core.config import settings
from app.db.session import get_db
from app.models.analytics import AoiRegion
from app.models.auth import User
from app.models.course import (
    Course,
    Enrollment,
    Lesson,
    LessonContent,
    LessonProgress,
    Module,
)
from app.schemas.course import (
    EmbeddingSyncOut,
    LessonCreateIn,
    SlideAdminOut,
    SlideCreateIn,
    SlideKeySetIn,
    SlideKeyUpdateIn,
    SlideOut,
)
from app.schemas.gaze import OkOut, ProgressPatchIn
from app.services import analytics, aoi, embedding, media_storage

router = APIRouter(tags=["lessons"])
logger = logging.getLogger(__name__)


async def _embed_slides(slide_ids: list[str]) -> None:
    """Background task: đồng bộ embedding và cập nhật trạng thái slide."""
    await embedding.sync_slides(slide_ids)



def _validate_uuid(value: str) -> None:
    try:
        uuid.UUID(value)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài học")


async def _get_lesson_or_404(db: AsyncSession, lesson_id: str) -> Lesson:
    _validate_uuid(lesson_id)
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
    try:
        await asyncio.to_thread(media_storage.clear_lesson, lesson_id)
    except media_storage.StorageError as exc:
        media_storage.log_cleanup_failure("delete lesson", exc)
    return {"ok": True}


@router.post("/teacher/lessons/{lesson_id}/slides", status_code=201)
async def add_slide(
    lesson_id: str,
    body: SlideCreateIn,
    background_tasks: BackgroundTasks,
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
        embedding_status=embedding.PENDING,
    )
    db.add(slide)
    await db.commit()
    await db.refresh(slide)
    background_tasks.add_task(_embed_slides, [slide.id])
    return {"id": slide.id, "orderIndex": slide.order_index}


def _render_pdf_slides(lesson_id: str, data: bytes) -> tuple[int, str, list[str]]:
    """Render PDF thành JPEG và lưu qua media storage.

    Trả về (số trang, version, URL ảnh). Version đổi mỗi lần upload để bust
    cache trình duyệt/CDN.

    Lỗi PDF gọi HTTPException(400)."""
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
        doc.close()
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="PDF không có trang nào")
    if doc.needs_pass:
        doc.close()
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="PDF đang bị bảo vệ bằng mật khẩu — hãy gỡ mật khẩu trước khi tải lên",
        )
    if count > settings.max_pdf_pages:
        doc.close()
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail=(
                f"PDF có {count} trang, vượt quá {settings.max_pdf_pages} trang cho phép. "
                "Vui lòng chia nhỏ file rồi tải lên từng phần."
            ),
        )

    version = uuid.uuid4().hex[:12]
    prefix = f"lessons/{lesson_id}/{version}"
    try:
        media_storage.put_bytes(f"{prefix}/source.pdf", data, "application/pdf")
    except media_storage.StorageError as exc:
        doc.close()
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không thể lưu PDF lên kho tệp",
        ) from exc

    # Render ~144dpi (matrix 2×2), đủ nét cho màn hình mà không quá nặng.
    zoom = pymupdf.Matrix(2, 2)
    image_urls: list[str] = []
    try:
        for page_no in range(count):
            page = doc.load_page(page_no)
            render_pixels = int(page.rect.width * 2) * int(page.rect.height * 2)
            if render_pixels > settings.max_slide_render_pixels:
                raise ValueError(f"Trang {page_no + 1} có kích thước quá lớn")
            pix = page.get_pixmap(matrix=zoom, colorspace=pymupdf.csRGB)
            image = pix.tobytes("jpeg", jpg_quality=85)
            image_urls.append(
                media_storage.put_bytes(
                    f"{prefix}/slide_{page_no + 1:03d}.jpg", image, "image/jpeg"
                )
            )
    except media_storage.StorageError as exc:
        try:
            media_storage.cleanup_version(lesson_id, version)
        except media_storage.StorageError as cleanup_exc:
            media_storage.log_cleanup_failure("failed upload", cleanup_exc)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không thể lưu slide lên kho tệp",
        ) from exc
    except Exception as exc:
        try:
            media_storage.cleanup_version(lesson_id, version)
        except media_storage.StorageError as cleanup_exc:
            media_storage.log_cleanup_failure("failed render", cleanup_exc)
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail=f"Không render được PDF: {exc}"
        ) from exc
    finally:
        doc.close()
    return count, version, image_urls


async def _read_pdf_limited(pdf: UploadFile) -> bytes:
    data = bytearray()
    while chunk := await pdf.read(1024 * 1024):
        data.extend(chunk)
        if len(data) > settings.max_pdf_bytes:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="File PDF quá lớn")
    return bytes(data)


@router.post(
    "/teacher/lessons/{lesson_id}/slides/upload",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(rate_limit(15, 60, "upload"))],
)
async def upload_lesson_pdf(
    lesson_id: str,
    background_tasks: BackgroundTasks,
    pdf: UploadFile = File(...),
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Upload PDF → render từng trang ra JPEG → tạo LessonContent cho mỗi trang.
    Thay thế toàn bộ slide cũ của bài. Nếu bài đã có dữ liệu gaze (kéo theo
    ràng buộc khóa ngoại), việc thay thế sẽ bị chặn để không phá dữ liệu phân tích."""
    lesson = await _get_lesson_or_404(db, lesson_id)
    await _check_course_access(db, lesson, user)

    data = await _read_pdf_limited(pdf)

    # Tuần tự hóa việc thay PDF cùng bài học để hai request không ghi đè nhau.
    await db.execute(
        select(Lesson.id).where(Lesson.id == lesson_id).with_for_update()
    )
    old_urls = list(
        (
            await db.execute(
                select(LessonContent.image_url).where(
                    LessonContent.lesson_id == lesson_id
                )
            )
        ).scalars()
    )

    version: str | None = None
    new_slide_ids: list[str] = []
    try:
        count, version, image_urls = await asyncio.to_thread(
            _render_pdf_slides, lesson_id, data
        )
        pages_aois = await asyncio.to_thread(aoi.extract_slide_aois, data)

        await db.execute(
            delete(LessonContent).where(LessonContent.lesson_id == lesson_id)
        )
        contents: list[tuple[LessonContent, list[dict]]] = []
        for page_no in range(count):
            page_aois = pages_aois[page_no] if page_no < len(pages_aois) else []
            if not page_aois:
                page_aois = aoi.grid_cells(
                    settings.mastery_grid_cols, settings.mastery_grid_rows
                )
                aoi_source = "grid"
            else:
                aoi_source = "pdf"
            content = LessonContent(
                lesson_id=lesson_id,
                order_index=page_no + 1,
                image_url=image_urls[page_no],
                content_json={"title": f"Slide {page_no + 1}"},
                aoi_source=aoi_source,
                embedding_status=embedding.PENDING,
            )
            db.add(content)
            contents.append((content, page_aois))

        await db.flush()
        new_slide_ids = [content.id for content, _ in contents]
        for content, page_aois in contents:
            for a in page_aois:
                db.add(
                    AoiRegion(
                        lesson_content_id=content.id,
                        name=a["name"],
                        x_min=a["x_min"],
                        y_min=a["y_min"],
                        x_max=a["x_max"],
                        y_max=a["y_max"],
                        source=a["source"],
                        weight=a["weight"],
                        char_count=a["char_count"],
                        block_index=a["block_index"],
                    )
                )
        await db.commit()
    except HTTPException:
        await db.rollback()
        if version is not None:
            try:
                await asyncio.to_thread(
                    media_storage.cleanup_version, lesson_id, version
                )
            except media_storage.StorageError as cleanup_exc:
                media_storage.log_cleanup_failure("request rollback", cleanup_exc)
        raise
    except Exception as exc:
        await db.rollback()
        if version is not None:
            try:
                await asyncio.to_thread(
                    media_storage.cleanup_version, lesson_id, version
                )
            except media_storage.StorageError as cleanup_exc:
                media_storage.log_cleanup_failure("database rollback", cleanup_exc)
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            detail="Không thay thế được slide — bài học đã có dữ liệu quan sát",
        ) from exc
    old_versions = {
        old_version
        for url in old_urls
        if (old_version := media_storage.version_from_url(url, lesson_id)) is not None
        and old_version != version
    }
    for old_version in old_versions:
        try:
            await asyncio.to_thread(
                media_storage.cleanup_version, lesson_id, old_version
            )
        except media_storage.StorageError as exc:
            media_storage.log_cleanup_failure("prune replaced version", exc)
    await analytics.invalidate_heatmap_cache(lesson_id)
    background_tasks.add_task(_embed_slides, new_slide_ids)
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


@router.get(
    "/teacher/lessons/{lesson_id}/slides", response_model=list[SlideAdminOut]
)
async def list_lesson_slides(
    lesson_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Danh sách slide của bài để GV đánh dấu trọng tâm (kèm isKey, số AOI)."""
    lesson = await _get_lesson_or_404(db, lesson_id)
    await _check_course_access(db, lesson, user)

    rows = (
        await db.execute(
            select(LessonContent, func.count(AoiRegion.id))
            .outerjoin(AoiRegion, AoiRegion.lesson_content_id == LessonContent.id)
            .where(LessonContent.lesson_id == lesson_id)
            .group_by(LessonContent.id)
            .order_by(LessonContent.order_index)
        )
    ).all()
    return [
        SlideAdminOut(
            id=c.id,
            order_index=c.order_index,
            title=c.content_json.get("title") or f"Slide {c.order_index}",
            image_url=c.image_url,
            is_key=c.is_key,
            aoi_count=aoi_count,
            aoi_source=c.aoi_source,
            embedding_status=c.embedding_status,
        )
        for c, aoi_count in rows
    ]


@router.patch("/teacher/slides/{slide_id}", response_model=OkOut)
async def set_slide_key(
    slide_id: str,
    body: SlideKeyUpdateIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    slide = await db.get(LessonContent, slide_id)
    if slide is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy slide")
    lesson = await db.get(Lesson, slide.lesson_id)
    await _check_course_access(db, lesson, user)
    slide.is_key = body.is_key
    await db.commit()
    return OkOut()


@router.post("/teacher/lessons/{lesson_id}/slides/key", response_model=OkOut)
async def set_slide_keys(
    lesson_id: str,
    body: SlideKeySetIn,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Đặt danh sách trang trọng tâm (theo order_index), các trang khác bỏ đánh dấu."""
    lesson = await _get_lesson_or_404(db, lesson_id)
    await _check_course_access(db, lesson, user)
    key_set = set(body.order_indexes)
    slides = (
        (
            await db.execute(
                select(LessonContent).where(LessonContent.lesson_id == lesson_id)
            )
        )
        .scalars()
        .all()
    )
    for s in slides:
        s.is_key = s.order_index in key_set
    await db.commit()
    return OkOut()


@router.post("/teacher/lessons/{lesson_id}/aoi/rebuild", response_model=dict)
async def rebuild_lesson_aois(
    lesson_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Trích lại AOI từ source.pdf đã lưu (dùng khi muốn sửa vùng đo độ bao phủ)."""
    lesson = await _get_lesson_or_404(db, lesson_id)
    await _check_course_access(db, lesson, user)
    try:
        updated = await aoi.rebuild_lesson_aois(db, lesson_id)
    except media_storage.StorageError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Không thể đọc PDF nguồn từ kho tệp",
        ) from exc
    await db.commit()
    await analytics.invalidate_heatmap_cache(lesson_id)
    return {"ok": True, "slides": updated}


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


@router.get("/api/lessons/{lesson_id}/progress")
async def get_lesson_progress(
    lesson_id: str,
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
        return {"lastSlide": 0, "viewed": [], "completed": False, "updatedAt": None}
    max_viewed = max(progress.viewed_slides) if progress.viewed_slides else 0
    return {
        "lastSlide": max(0, max_viewed - 1),
        "viewed": progress.viewed_slides or [],
        "completed": progress.status == "completed",
        "updatedAt": progress.last_watched_at,
    }


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


@router.post(
    "/teacher/lessons/{lesson_id}/reindex",
    response_model=EmbeddingSyncOut,
    dependencies=[Depends(rate_limit(10, 60, "reindex"))],
)
async def reindex_lesson(
    lesson_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Embedding lại các slide còn thiếu/lỗi của một bài học (đồng bộ)."""
    lesson = await _get_lesson_or_404(db, lesson_id)
    await _check_course_access(db, lesson, user)
    stats = await embedding.reindex_lesson(lesson_id)
    return EmbeddingSyncOut(**stats)


@router.post(
    "/teacher/courses/{course_id}/reindex",
    response_model=EmbeddingSyncOut,
    dependencies=[Depends(rate_limit(5, 60, "reindex"))],
)
async def reindex_course(
    course_id: str,
    user: User = Depends(require_roles("teacher", "admin")),
    db: AsyncSession = Depends(get_db),
):
    """Backfill embedding cho toàn bộ slide còn thiếu/lỗi của một khóa học."""
    course = await db.get(Course, course_id)
    if course is None or course.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khóa học")
    if not await can_access_course(db, course, user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    stats = await embedding.reindex_course(course_id)
    return EmbeddingSyncOut(**stats)


@router.post(
    "/internal/embeddings/reindex-all",
    dependencies=[Depends(require_internal_token)],
    status_code=202,
)
async def internal_reindex_all():
    """Kích hoạt backfill embedding toàn bộ slide còn thiếu (chạy nền).

    Trả về ngay (202) để tránh gateway timeout (Cloudflare 504). Theo dõi tiến
    độ bằng `GET /internal/embeddings/status`. Không dùng JWT người dùng; xác
    thực bằng header `X-Chatbot-Token` chia sẻ.
    """
    return await embedding.start_reindex_all_job()


@router.get(
    "/internal/embeddings/status",
    dependencies=[Depends(require_internal_token)],
)
async def internal_embedding_status():
    """Thống kê trạng thái embedding + tiến độ job backfill + độ lệch vector."""
    return {
        "counts": await embedding.counts(),
        "drift": await embedding.drift(),
        "job": embedding.job_status(),
    }
