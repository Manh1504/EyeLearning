from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List
import json
import numpy as np
import cv2
from models import Pipline
from calibration import Calibration
import os
from dotenv import load_dotenv

load_dotenv()


# ─── Config ───────────────────────────────────────────────────
class Config:
    def __init__(self):
        self.device = os.getenv("DEVICE", "cuda")


config = Config()

# ─── Khởi tạo pipeline (load 1 lần duy nhất khi server start) ─
pipeline = None
pipeline_error = None


def get_pipeline():
    global pipeline, pipeline_error
    if pipeline is not None:
        return pipeline
    try:
        pipeline = Pipline(args=config)
        pipeline_error = None
        return pipeline
    except Exception as exc:
        pipeline_error = str(exc)
        print(f"[Pipeline load error] {pipeline_error}", flush=True)
        return None

# ─── Buffer calibration theo session_id ───────────────────────
# { session_id: Calibration }
calibrators: dict[str, Calibration] = {}

# ─── App ──────────────────────────────────────────────────────
app = FastAPI(title="EyeLearn — AI Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Health check ─────────────────────────────────────────────
@app.get("/health_check")
def health_check():
    return {
        "status": "ok",
        "pipeline_loaded": pipeline is not None,
        "pipeline_error": pipeline_error,
    }


# ─── Calibration ──────────────────────────────────────────────
"""
Nhận N ảnh + N tọa độ (x, y normalized 0–1) → train model → lưu vào calibrators[session_id]

Form fields:
  - session_id  : str
  - points      : JSON string, VD: [{"x": 0.5, "y": 0.5, "name": "top-left"}, ...]
  - frames      : List[UploadFile] — ảnh JPEG tương ứng với từng điểm
  - viewport_w  : int — window.innerWidth lúc calib
  - viewport_h  : int — window.innerHeight lúc calib

Response:
  - {
      "message": str, "session_id": str, "n_points": int,
      "per_point": [{"name": str, "x": float, "y": float, "pitch": float, "yaw": float}, ...],
    }
  - {"error": str}
"""
@app.post("/calibrate")
async def calibrate(
    session_id: str              = Form(...),
    points:     str              = Form(...),
    frames:     List[UploadFile] = File(...),
    viewport_w: int              = Form(1920),
    viewport_h: int              = Form(1080),
):
    pipe = get_pipeline()
    if pipe is None:
        return {"error": f"Pipeline not available: {pipeline_error}"}

    try:
        points_list = json.loads(points)
    except json.JSONDecodeError:
        return {"error": "Invalid JSON in 'points' field"}

    if len(points_list) != len(frames):
        return {"error": f"Mismatch: {len(points_list)} points but {len(frames)} frames"}

    gaze_data = []
    per_point = []

    for point_info, frame_file in zip(points_list, frames):
        raw = await frame_file.read()
        img_array = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if frame is None:
            return {"error": f"Cannot decode frame for point '{point_info.get('name', '?')}'"}

        result = pipe.process(frame)
        if result is None:
            return {"error": f"No face detected in frame '{point_info.get('name', '?')}'"}

        pitch, yaw, tx, ty, depth = result
        gaze_data.append([pitch, yaw])
        per_point.append({
            "name": point_info.get("name", ""),
            "x": point_info["x"],
            "y": point_info["y"],
            "pitch": float(pitch),
            "yaw": float(yaw),
        })

    gaze_arr = np.array(gaze_data)
    points_arr = np.array([[p["x"], p["y"]] for p in points_list])

    model_path = f"weights/calibration_{session_id}.ubj"
    calibrator = Calibration(
        root=None,
        model_path=model_path,
        viewport_w=viewport_w,
        viewport_h=viewport_h,
    )
    calibrator.create_calibration_model_for_api_version(gaze_arr, points_arr)
    calibrators[session_id] = calibrator

    return {
        "message": "Calibration successful",
        "session_id": session_id,
        "n_points": len(points_list),
        "per_point": per_point,
    }


# ─── Inference (WebSocket) ────────────────────────────────────
"""
Kết nối: ws://host:port/inference?session_id=xxx

Gửi  : bytes — ảnh JPEG của frame webcam
Nhận : JSON  — {"x": float, "y": float}          nếu thành công
              {"error": str}                       nếu lỗi
"""
@app.websocket("/inference")
async def inference(
    websocket:  WebSocket,
    session_id: str = Query(...),
):
    await websocket.accept()

    if session_id not in calibrators:
        await websocket.send_json({"error": f"Session '{session_id}' not calibrated yet"})
        await websocket.close(code=4000)
        return

    pipe = get_pipeline()
    if pipe is None:
        await websocket.send_json({"error": f"Pipeline not available: {pipeline_error}"})
        await websocket.close(code=4001)
        return

    calibrator = calibrators[session_id]

    try:
        while True:
            data = await websocket.receive_bytes()
            img_array = np.frombuffer(data, dtype=np.uint8)
            frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
            if frame is None:
                await websocket.send_json({"error": "Cannot decode frame"})
                continue

            result = pipe.process(frame)
            if result is None:
                await websocket.send_json({"error": "No face detected"})
                continue

            pitch, yaw, tx, ty, depth = result
            x_px, y_px = calibrator.predict(pitch, yaw)
            await websocket.send_json({"x": float(x_px), "y": float(y_px)})

    except WebSocketDisconnect:
        pass


# ─── Calibration status ───────────────────────────────────────
@app.get("/calibration_status")
def calibration_status(session_id: str = Query(...)):
    if session_id in calibrators:
        return {"status": "calibrated", "session_id": session_id}
    return {"status": "not_found", "session_id": session_id}


# ─── Delete calibration ───────────────────────────────────────
@app.delete("/calibration")
def delete_calibration(session_id: str = Query(...)):
    if session_id not in calibrators:
        return {"error": f"Session '{session_id}' not found"}

    del calibrators[session_id]

    model_path = f"weights/calibration_{session_id}.ubj"
    if os.path.exists(model_path):
        os.remove(model_path)

    return {"message": f"Session '{session_id}' deleted"}
