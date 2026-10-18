"""API nạp (ingest) slide vào pgvector.

`Ingestion` (app/services/ingest.py) là tiến trình nặng: gọi VLM mô tả ảnh rồi embedding.
Vì vậy ở đây dùng lazy singleton (chỉ khởi tạo khi có request đầu tiên) và một
khóa để các job ingest không chạy chồng nhau, tránh quá tải VLM/DB.
"""

import threading

from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool

from app.schemas import EmbedResult, EmbedSlideRequest
from app.services.ingest import Ingestion

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


def _embed_new(lesson_content_id: str) -> int:
    with _job_lock:
        # embed_new tự raise LookupError nếu slide không tồn tại (route -> 404)
        return get_ingestion().embed_new(lesson_content_id)


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
