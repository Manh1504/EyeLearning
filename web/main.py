from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import sessions, calibration, gaze_chunks

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


@app.get("/health")
async def health():
    return {"status": "ok"}