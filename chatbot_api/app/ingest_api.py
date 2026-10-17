"""API nạp (ingest) slide vào pgvector.

`Ingestion` (ingest.py) là tiến trình nặng: gọi VLM mô tả ảnh rồi embedding.
Vì vậy ở đây dùng lazy singleton (chỉ khởi tạo khi có request đầu tiên) và một
khóa để các job ingest không chạy chồng nhau, tránh quá tải VLM/DB.
"""

import threading

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from ingest import Ingestion

router = APIRouter(prefix="/ingest", tags=["ingest"])

# Singleton + khóa tạo/khóa chạy job, bảo vệ bằng lock vì endpoint chạy đa luồng
_ingestion: Ingestion | None = None
_init_lock = threading.Lock()
_job_lock = threading.Lock()


def get_ingestion() -> Ingestion:
    """Khởi tạo Ingestion một lần duy nhất (lazy)."""
    global _ingestion
    if _ingestion is None:
        with _init_lock:
            if _ingestion is None:
                _ingestion = Ingestion()
    return _ingestion


def close_ingestion() -> None:
    """Đóng kết nối Ingestion (gọi khi tắt service)."""
    global _ingestion
    if _ingestion is not None:
        _ingestion.close()
        _ingestion = None


class EmbedCourseRequest(BaseModel):
    course_id: int = Field(description="ID khóa học cần embedding các slide còn thiếu.")
    batch_size: int = Field(
        default=20, ge=1, le=200, description="Số slide xử lý mỗi batch."
    )


class EmbedSlideRequest(BaseModel):
    lesson_content_id: int = Field(description="ID slide (lesson_contents) cần embedding.")


class EmbedResult(BaseModel):
    processed: int = Field(description="Số slide đã xử lý.")


def _embed_existing(course_id: int, batch_size: int) -> int:
    with _job_lock:
        return get_ingestion().embed_existing(course_id, batch_size)


def _embed_new(lesson_content_id: int) -> int:
    with _job_lock:
        ingestion = get_ingestion()
        if ingestion._load_slide(lesson_content_id) is None:
            raise LookupError(lesson_content_id)
        ingestion.embed_new(lesson_content_id)
        return 1


@router.post("/course", response_model=EmbedResult)
async def embed_course(payload: EmbedCourseRequest):
    """Embedding toàn bộ slide chưa có vector của một khóa học."""
    processed = await run_in_threadpool(
        _embed_existing, payload.course_id, payload.batch_size
    )
    return EmbedResult(processed=processed)


@router.post("/slide", response_model=EmbedResult)
async def embed_slide(payload: EmbedSlideRequest):
    """Embedding (hoặc cập nhật) một slide đơn lẻ."""
    try:
        processed = await run_in_threadpool(_embed_new, payload.lesson_content_id)
    except LookupError:
        raise HTTPException(
            status_code=404,
            detail=f"Không tìm thấy slide: {payload.lesson_content_id}",
        )
    return EmbedResult(processed=processed)