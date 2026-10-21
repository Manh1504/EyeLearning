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

import asyncio
import logging
import os
from datetime import datetime, timezone

import httpx
from sqlalchemy import func, select, text

from app.core.config import settings
from app.db.session import SessionLocal
from app.models.course import Lesson, LessonContent, Module

logger = logging.getLogger(__name__)

PENDING = "pending"
READY = "ready"
FAILED = "failed"
NONE = "none"

PENDING_STATUSES = (NONE, PENDING, FAILED)

# Số lần thử và thời gian chờ (giây) giữa các lần khi gọi chatbot. Lỗi 5xx /
# lỗi kết nối (vd chatbot đang cold-start tải model) là tạm thời nên retry;
# lỗi 4xx (vd slide không tồn tại) là vĩnh viễn nên bỏ luôn.
INGEST_ATTEMPTS = int(os.getenv("CHATBOT_INGEST_ATTEMPTS", "3"))
INGEST_BACKOFF_SECONDS = float(os.getenv("CHATBOT_INGEST_BACKOFF_SECONDS", "5"))

# Trạng thái job backfill toàn cục (in-process). Đủ cho 1 replica backend;
# dùng để theo dõi tiến độ vì HTTP request không giữ mở tới khi xong.
_JOB: dict = {
    "running": False,
    "queued": 0,
    "processed": 0,
    "ready": 0,
    "failed": 0,
    "started_at": None,
    "finished_at": None,
}
_JOB_LOCK = asyncio.Lock()


def job_status() -> dict:
    return dict(_JOB)


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
    """Gọi chatbot ingest 1 slide, retry với backoff cho lỗi tạm thời."""
    last_error: str | None = None
    for attempt in range(1, INGEST_ATTEMPTS + 1):
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
            last_error = f"HTTP {exc.response.status_code}: {detail}"[:500]
            # 4xx: lỗi dữ liệu/cấu hình -> retry vô ích
            if 400 <= exc.response.status_code < 500:
                return False, last_error
        except httpx.HTTPError as exc:
            last_error = str(exc)[:500]
        if attempt < INGEST_ATTEMPTS:
            await asyncio.sleep(INGEST_BACKOFF_SECONDS * attempt)
    return False, last_error


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
                _JOB["processed"] += 1
                _JOB["ready" if ok else "failed"] += 1
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
    """Backfill toàn bộ slide còn thiếu/lỗi trên mọi khóa học (đồng bộ).

    Dùng cho pipeline deploy (không cần JWT user). Chạy tuần tự theo từng slide
    để tránh làm quá tải VLM. Trả về thống kê ready/failed.
    """
    return await sync_slides(await all_pending_slide_ids())


async def all_pending_slide_ids() -> list[str]:
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
        return [str(row[0]) for row in result.all()]


async def start_reindex_all_job() -> dict:
    """Chạy backfill toàn bộ trong background, trả về ngay.

    Tránh gateway 504 vì request không phải chờ toàn bộ slide. Theo dõi tiến
    độ qua `job_status()`/endpoint status.
    """
    async with _JOB_LOCK:
        if _JOB["running"]:
            return {**job_status(), "already_running": True}
        _JOB.update(
            running=True,
            queued=0,
            processed=0,
            ready=0,
            failed=0,
            started_at=datetime.now(timezone.utc).isoformat(),
            finished_at=None,
        )
        asyncio.create_task(_run_job())
        return job_status()


async def _run_job() -> None:
    try:
        slide_ids = await all_pending_slide_ids()
        _JOB["queued"] = len(slide_ids)
        await sync_slides(slide_ids)
    except Exception:  # noqa: BLE001
        logger.exception("Backfill embedding job thất bại")
    finally:
        _JOB["running"] = False
        _JOB["finished_at"] = datetime.now(timezone.utc).isoformat()


async def counts() -> dict[str, int]:
    """Thống kê trạng thái embedding để giám sát."""
    async with SessionLocal() as session:
        result = await session.execute(
            select(LessonContent.embedding_status, func.count(LessonContent.id))
            .group_by(LessonContent.embedding_status)
        )
        return {status: count for status, count in result.all()}


async def slide_count() -> int:
    """Tổng số slide (lesson_contents)."""
    async with SessionLocal() as session:
        result = await session.execute(select(func.count()).select_from(LessonContent))
        return int(result.scalar_one())


async def vector_count() -> int:
    """Số dòng vector đã lưu trong lesson_content_embedding.

    Dùng cho bootstrap lần đầu: bằng 0 nghĩa là chưa từng ingest.
    """
    async with SessionLocal() as session:
        result = await session.execute(
            text("SELECT count(*) FROM lesson_content_embedding")
        )
        return int(result.scalar_one())


# Đối chiếu `lesson_contents.embedding_status` (nguồn sự thật, do backend ghi)
# với bảng vector `lesson_content_embedding` (chatbot ghi). Lệch nghĩa là có
# người ghi vector trực tiếp không qua backend, hoặc DB khôi phục không đồng bộ.
DRIFT_SQL = text(
    """
    SELECT
        (SELECT count(*)
           FROM lesson_contents lc
          WHERE lc.embedding_status = 'ready'
            AND NOT EXISTS (
                SELECT 1 FROM lesson_content_embedding e
                 WHERE e.lesson_content_id = lc.id
            )) AS ready_without_vector,
        (SELECT count(*)
           FROM lesson_content_embedding e
           JOIN lesson_contents lc ON lc.id = e.lesson_content_id
          WHERE lc.embedding_status <> 'ready') AS vector_not_marked_ready
    """
)


async def drift() -> dict[str, int]:
    """Số slide lệch giữa trạng thái do backend ghi và vector thực tế."""
    async with SessionLocal() as session:
        row = (await session.execute(DRIFT_SQL)).mappings().one()
        return {key: int(value) for key, value in row.items()}
