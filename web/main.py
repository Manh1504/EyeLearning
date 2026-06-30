from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from web.config import client_config
from web.routers import admin, sessions, calibration, gaze_chunks, lessons, tracking, metrics, heatmaps, page_snapshots, debug

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(
    title="EyeLearn — Web Service",
    version="0.1.0",
    description="Web Service cho hệ thống Eye Tracking học online",
)

# CORS — cho phép frontend (React/HTML) gọi API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:63342",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:63342",
    ],
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

app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/", include_in_schema=False)
async def start_page():
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/lesson", include_in_schema=False)
async def lesson_page():
    return FileResponse(STATIC_DIR / "lesson.html")


@app.get("/calibration", include_in_schema=False)
async def calibration_page():
    return FileResponse(STATIC_DIR / "calibration.html")


@app.get("/analytics", include_in_schema=False)
async def analytics_page():
    return FileResponse(STATIC_DIR / "analytics.html")


@app.get("/teacher", include_in_schema=False)
async def teacher_page():
    return FileResponse(STATIC_DIR / "teacher.html")


@app.get("/admin", include_in_schema=False)
async def admin_page():
    return FileResponse(STATIC_DIR / "admin.html")


@app.get("/client-config")
async def get_client_config():
    return client_config()


@app.get("/health")
async def health():
    return {"status": "ok"}
