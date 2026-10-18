"""Đồng bộ trạng thái embedding slide sang dịch vụ chatbot (pgvector).

Backend là nguồn dữ liệu slide; chatbot giữ vector trong bảng
`lesson_content_embedding`. Module này:

- Gọi `/ingest/slide` cho một slide và cập nhật trạng thái
  (`pending` → `ready` / `failed`) trên `lesson_contents`.
- Cung cấp backfill theo bài học hoặc theo khóa học để reindex các slide
  còn thiếu / đã đánh dấu `failed`.

Vì ingest gọi VLM + embedding (nặng, chạy nền), các hàm gọi endpoint ở đây
được thiết kế để chạy trong BackgroundTasks. Trạng thái được cập nhật bằng
session riêng vì background task chạy sau khi response đã trả về.
"""

import logging

import httpx
from sqlalchemy import select

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.course import Lesson, LessonContent, Module

logger = logging.getLogger(__name__)

PENDING = "pending"
READY = "ready"
FAILED = "failed"
NONE = "none"

PENDING_STATUSES = (NONE, PENDING, FAILED)


async def _mark(session, slide_id: str, status: str, error: str | None = None) -> None:
    from datetime import datetime, timezone

    slide = await session.get(LessonContent, slide_id)
    if slide is None:
        return
    slide.embedding_status = status
    slide.embedding_error = error
    slide.embedding_updated_at = datetime.now(timezone.utc)
    await session.commit()


async def _ingest_one(client: httpx.AsyncClient, slide_id: str) -> tuple[bool, str | None]:
    try:
        response = await client.post(
            f"{settings.chatbot_url.rstrip('/')}/ingest/slide",
            json={"lesson_content_id": slide_id},
        )
        response.raise_for_status()
        return True, None
    except httpx.HTTPStatusError as exc:
        detail = ""
        try:
            detail = exc.response.json().get("detail", "")
        except Exception:  # noqa: BLE001
            detail = exc.response.text[:200]
        return False, f"HTTP {exc.response.status_code}: {detail}"[:500]
    except httpx.HTTPError as exc:
        return False, str(exc)[:500]


async def sync_slides(slide_ids: list[str]) -> dict[str, int]:
    """Ingest danh sách slide, cập nhật trạng thái. Trả về thống kê."""
    stats = {"ready": 0, "failed": 0}
    if not slide_ids:
        return stats
    if not settings.chatbot_url or not settings.chatbot_internal_token:
        logger.warning("Chatbot chưa cấu hình — bỏ qua embedding %d slide", len(slide_ids))
        return stats
    async with SessionLocal() as session:
        for slide_id in slide_ids:
            await _mark(session, slide_id, PENDING)
        async with httpx.AsyncClient(
            timeout=settings.chatbot_ingest_timeout_seconds,
            headers={"X-Chatbot-Token": settings.chatbot_internal_token},
        ) as client:
            for slide_id in slide_ids:
                ok, error = await _ingest_one(client, slide_id)
                await _mark(session, slide_id, READY if ok else FAILED, error)
                stats["ready" if ok else "failed"] += 1
                if not ok:
                    logger.warning("Embedding slide %s thất bại: %s", slide_id, error)
    return stats


async def _pending_slide_ids(lesson_id: str | None, course_id: str | None) -> list[str]:
    stmt = select(LessonContent.id).where(LessonContent.embedding_status != READY)
    if lesson_id is not None:
        stmt = stmt.where(LessonContent.lesson_id == lesson_id)
    if course_id is not None:
        stmt = (
            stmt.join(Lesson, Lesson.id == LessonContent.lesson_id)
            .join(Module, Module.id == Lesson.module_id)
            .where(Module.course_id == course_id)
        )
    async with SessionLocal() as session:
        result = await session.execute(stmt)
        return [str(row[0]) for row in result.all()]


async def reindex_lesson(lesson_id: str) -> dict[str, int]:
    return await sync_slides(await _pending_slide_ids(lesson_id, None))


async def reindex_course(course_id: str) -> dict[str, int]:
    return await sync_slides(await _pending_slide_ids(None, course_id))


async def reindex_all() -> dict[str, int]:
    """Backfill toàn bộ slide còn thiếu/lỗi trên mọi khóa học.

    Dùng cho pipeline deploy (không cần JWT user): chạy tuần tự theo từng slide
    để tránh làm quá tải VLM. Trả về thống kê ready/failed.
    """
    from app.models.course import Course

    async with SessionLocal() as session:
        result = await session.execute(
            select(LessonContent.id)
            .join(Lesson, Lesson.id == LessonContent.lesson_id)
            .join(Module, Module.id == Lesson.module_id)
            .join(Course, Course.id == Module.course_id)
            .where(
                LessonContent.embedding_status != READY,
                Course.deleted_at.is_(None),
            )
        )
        slide_ids = [str(row[0]) for row in result.all()]
    return await sync_slides(slide_ids)


async def counts() -> dict[str, int]:
    """Thống kê trạng thái embedding để giám sát."""
    from sqlalchemy import func

    async with SessionLocal() as session:
        result = await session.execute(
            select(LessonContent.embedding_status, func.count(LessonContent.id))
            .group_by(LessonContent.embedding_status)
        )
        return {status: count for status, count in result.all()}
