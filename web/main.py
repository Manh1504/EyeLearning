import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from web.config import client_config
from web.routers import admin, sessions, calibration, gaze_chunks, lessons, tracking, metrics, heatmaps, page_snapshots, debug

app = FastAPI(
    title="EyeLearn — Web Service",
    version="0.1.0",
    description="Web Service cho hệ thống Eye Tracking học online",
)

# CORS — frontend giờ là app React riêng biệt (xem thư mục /frontend).
# Trong production (nginx reverse-proxy cùng origin), CORS gần như không cần thiết,
# nhưng vẫn giữ lại để hỗ trợ `npm run dev` / `vite preview` gọi thẳng vào backend.
_default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:3000",
    "http://localhost:63342",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:63342",
]
_extra_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_default_origins + _extra_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Routers
app.include_router(sessions.router)
app.include_router(calibration.router)
app.include_router(gaze_chunks.router)
app.include_router(lessons.router)
app.include_router(tracking.router)
app.include_router(metrics.router)
app.include_router(heatmaps.router)
app.include_router(page_snapshots.router)
app.include_router(debug.router)
app.include_router(admin.router)


@app.get("/client-config")
async def get_client_config():
    return client_config()


@app.get("/health")
async def health():
    return {"status": "ok"}
