import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from web.config import client_config
from web.routers import admin, auth, calibration, calibration_profiles, courses, debug, gaze_chunks, heatmaps, learning_analytics, lessons, metrics, page_snapshots, sessions, tracking

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
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://localhost:9080",
    "http://127.0.0.1:9080",
    "http://localhost:3000",
    "http://localhost:63342",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:63342",
]
_extra_origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
_allowed_origins = set(_default_origins + _extra_origins)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def reject_untrusted_write_origins(request: Request, call_next):
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        if origin and origin not in _allowed_origins:
            return JSONResponse({"detail": "Origin không được phép"}, status_code=403)
    return await call_next(request)

# Routers
app.include_router(auth.router)
app.include_router(courses.router)
app.include_router(sessions.router)
app.include_router(calibration.router)
app.include_router(calibration_profiles.router)
app.include_router(gaze_chunks.router)
app.include_router(lessons.router)
app.include_router(tracking.router)
app.include_router(metrics.router)
app.include_router(learning_analytics.router)
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
