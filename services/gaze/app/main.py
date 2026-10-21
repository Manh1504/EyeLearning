"""Gaze API — FastAPI app cho ước lượng hướng nhìn + calibration.

Chạy:
    uvicorn app.main:app --host 0.0.0.0 --port 8000

Tài liệu đầy đủ các endpoint: README.md cùng thư mục.

Endpoint vận hành:
    GET /health  -> liveness, luôn 200 khi tiến trình còn sống
    GET /ready   -> readiness, 503 khi pipeline (mediapipe + unigaze) chưa load
"""

import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from app.api.session import router as session_router
from app.api.session import sessions
from app.services import inference

logger = logging.getLogger("app.gaze")


@asynccontextmanager
async def lifespan(app: FastAPI):
    inference.init_pipeline()  # load mediapipe + unigaze 1 lần
    logger.info("Pipeline sẵn sàng (gpu=%s)", inference.gpu_available())
    task = asyncio.create_task(cleanup_loop())
    try:
        yield
    finally:
        task.cancel()
        with contextlib.suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="Gaze API", lifespan=lifespan)
app.include_router(session_router)


async def cleanup_loop():
    """Xoá session hết TTL mỗi phút (giới hạn MAX_SESSIONS)."""
    while True:
        await asyncio.sleep(60)
        sessions.cleanup_expired()


def _pipeline_status() -> dict:
    ready = inference.pipeline_ready()
    return {
        "status": "ok" if ready else "degraded",
        "gpu_available": inference.gpu_available(),
        "pipeline_ready": ready,
    }


@app.get("/health")
def health():
    """Liveness: tiến trình HTTP còn phản hồi."""
    return _pipeline_status()


@app.get("/ready")
def ready():
    """Readiness: chỉ 200 khi pipeline đã load xong, ngược lại 503."""
    status = _pipeline_status()
    if not status["pipeline_ready"]:
        return JSONResponse(status, status_code=503)
    return status


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
