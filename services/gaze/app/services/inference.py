"""Vòng đời suy luận: load Pipeline đúng 1 lần, serialize mọi lời gọi.

torch/mediapipe không thread-safe nên tất cả truy cập pipeline đi qua 1 lock;
FastAPI chạy `process_frame`/`predict` trong threadpool (`asyncio.to_thread`).
"""

import threading

import cv2
import numpy as np
import torch

from app.services.pipeline import Pipeline

_lock = threading.Lock()
_pipeline: Pipeline | None = None
_gpu_available = torch.cuda.is_available()  # cố định lúc khởi động (runtime không đổi)


def init_pipeline() -> None:
    """Load mediapipe + unigaze (gọi 1 lần trong lifespan)."""
    global _pipeline
    _pipeline = Pipeline()


def pipeline_ready() -> bool:
    return _pipeline is not None


def gpu_available() -> bool:
    return _gpu_available


def decode_jpeg(data: bytes):
    """bytes JPEG -> ảnh BGR, None nếu hỏng."""
    return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)


def process_frame(frame):
    """Ảnh BGR -> (pitch, yaw), None nếu không detect được khuôn mặt."""
    with _lock:
        return _pipeline.process(frame)


def predict(session, jpeg_bytes: bytes):
    """1 frame JPEG -> (error, (x, y)) cho WebSocket stream."""
    frame = decode_jpeg(jpeg_bytes)
    if frame is None:
        return "invalid_image", None
    result = process_frame(frame)
    if result is None:
        return "no_face", None
    x, y = session.calib.predict(*result)
    return None, session.smoother.process([x, y])
