"""Gaze API — FastAPI app cho ước lượng hướng nhìn + calibration.

Chạy:
    uvicorn app.main:app --host 0.0.0.0 --port 8000

Tài liệu đầy đủ các endpoint: README.md cùng thư mục.
"""

import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.api.session import router as session_router
from app.api.session import sessions
from app.services import inference


@asynccontextmanager
async def lifespan(app: FastAPI):
    inference.init_pipeline()  # load mediapipe + unigaze 1 lần
    task = asyncio.create_task(cleanup_loop())
    yield
    task.cancel()


app = FastAPI(title="Gaze API", lifespan=lifespan)
app.include_router(session_router)


async def cleanup_loop():
    """Xoá session hết TTL mỗi phút (giới hạn MAX_SESSIONS)."""
    while True:
        await asyncio.sleep(60)
        sessions.cleanup_expired()


@app.get("/health")
def health():
    return {
        "status": "ok" if inference.pipeline_ready() else "degraded",
        "gpu_available": inference.gpu_available(),
        "pipeline_ready": inference.pipeline_ready(),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
