from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import (
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

app = FastAPI(title=settings.app_name, version="1.0.0")

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
