"""Vòng đời suy luận: load Pipeline đúng 1 lần, serialize mọi lời gọi.

torch/mediapipe không thread-safe nên mọi truy cập pipeline đi qua **một**
executor 1 worker (`INFER_WORKERS`). Nhờ đó:
- không có lock chặn threadpool chung của event loop;
- frame của các session xếp hàng FIFO, kết hợp drop-frame per-session.

Các import nặng (torch/cv2/pipeline) được làm **lazy** để module này import nhẹ
(phục vụ test) và để `SET_PIPELINE` có thể cắm pipeline giả.
"""

from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Any, Callable

from app.settings import INFER_WORKERS

_pipeline: Any | None = None
_gpu_available: bool | None = None
_pool = ThreadPoolExecutor(max_workers=INFER_WORKERS, thread_name_prefix="gaze-infer")


def init_pipeline() -> None:
    """Load mediapipe + unigaze (gọi 1 lần trong lifespan)."""
    global _pipeline
    from app.services.pipeline import Pipeline

    _pipeline = Pipeline()


def set_pipeline(pipeline: Any | None) -> None:
    """Cắm pipeline tuỳ ý (dùng cho test) hoặc None để reset."""
    global _pipeline
    _pipeline = pipeline


def pipeline_ready() -> bool:
    return _pipeline is not None


def gpu_available() -> bool:
    """Có CUDA hay không (dò lazy, cache lại)."""
    global _gpu_available
    if _gpu_available is None:
        try:
            import torch

            _gpu_available = bool(torch.cuda.is_available())
        except Exception:
            _gpu_available = False
    return _gpu_available


def decode_jpeg(data: bytes):
    """bytes JPEG -> ảnh BGR, None nếu hỏng."""
    import cv2
    import numpy as np

    return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)


def process_frame(frame):
    """Ảnh BGR -> (pitch, yaw), None nếu không detect được khuôn mặt."""
    if _pipeline is None:
        raise RuntimeError("pipeline chưa sẵn sàng")
    return _pipeline.process(frame)


async def run_inference(fn: Callable, *args) -> Any:
    """Chạy 1 tác vụ suy luận trong executor chuyên dụng (không chặn threadpool)."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(_pool, fn, *args)


def predict(session, jpeg_bytes: bytes):
    """1 frame JPEG -> (error, (x, y)) cho WebSocket stream.

    Chạy trong executor; `session.smoother` chỉ được đụng tới ở đây (1 worker)
    nên không cần khoá riêng.
    """
    frame = decode_jpeg(jpeg_bytes)
    if frame is None:
        return "invalid_image", None
    result = process_frame(frame)
    if result is None:
        return "no_face", None
    x, y = session.calib.predict(*result)
    return None, session.smoother.process([x, y])
