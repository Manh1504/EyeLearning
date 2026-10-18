from contextlib import asynccontextmanager
import logging
import re
import secrets
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
    admin,
    assignments,
    analytics,
    auth,
    calibration,
    courses,
    enrollments,
    gaze,
    lessons,
    media,
    modules,
    proxy,
    users,
)
from app.core.config import settings
from app.db.redis import close_redis, init_redis


@asynccontextmanager
async def lifespan(_: FastAPI):
    if "*" in settings.cors_origin_list:
        raise RuntimeError("CORS_ORIGINS không được chứa '*' khi allow_credentials=True — hãy liệt kê origin cụ thể")
    _ = settings.r2_enabled  # validate partial R2 configuration at startup
    settings.media_path.mkdir(parents=True, exist_ok=True)
    await init_redis()
    yield
    await close_redis()


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)
performance_logger = logging.getLogger("app.performance")
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


@app.middleware("http")
async def request_timing(request, call_next):
    incoming_id = request.headers.get("x-request-id", "")
    request_id = incoming_id if REQUEST_ID_PATTERN.fullmatch(incoming_id) else secrets.token_hex(8)
    started = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception:
        performance_logger.exception(
            "request id=%s method=%s path=%s status=500 duration_ms=%.1f",
            request_id,
            request.method,
            request.url.path,
            (time.perf_counter() - started) * 1000,
        )
        raise

    duration_ms = (time.perf_counter() - started) * 1000
    response.headers["X-Request-ID"] = request_id
    existing_timing = response.headers.get("Server-Timing")
    app_timing = f"app;dur={duration_ms:.1f}"
    response.headers["Server-Timing"] = f"{existing_timing}, {app_timing}" if existing_timing else app_timing
    if duration_ms >= 250 or request.url.path.startswith("/api/auth/"):
        performance_logger.info(
            "request id=%s method=%s path=%s status=%s duration_ms=%.1f",
            request_id,
            request.method,
            request.url.path,
            response.status_code,
            duration_ms,
        )
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Server-Timing", "X-Request-ID"],
)

app.include_router(auth.router)
app.include_router(assignments.router)
app.include_router(users.router)
app.include_router(courses.router)
app.include_router(admin.router)
app.include_router(modules.router)
app.include_router(lessons.router)
app.include_router(enrollments.router)
app.include_router(gaze.router)
app.include_router(calibration.router)
app.include_router(analytics.router)
app.include_router(proxy.router)
app.include_router(media.router)


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "app": settings.app_name}


# Slide ảnh render từ PDF (đường dẫn trong lesson_contents.image_url bắt đầu /media).
# Tạo thư mục tránh lỗi khi không có file nào. /media giờ qua router có auth (media.py)
settings.media_path.mkdir(parents=True, exist_ok=True)
