from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.api.routes import (
    admin,
    analytics,
    auth,
    calibration,
    courses,
    enrollments,
    gaze,
    lessons,
    modules,
    proxy,
    users,
)
from app.core.config import settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.media_path.mkdir(parents=True, exist_ok=True)
    yield


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
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


@app.get("/health", tags=["system"])
async def health():
    return {"status": "ok", "app": settings.app_name}


# Slide ảnh render từ PDF (đường dẫn trong lesson_contents.image_url bắt đầu /media).
# Tạo thư mục tránh lỗi khi không có file nào.
settings.media_path.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=str(settings.media_path)), name="media")
