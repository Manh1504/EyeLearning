from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Query
from fastapi.middleware.cors import CORSMiddleware
from typing import List
from pydantic import BaseModel
import json
import numpy as np
import cv2
from models import Pipline
from calibration import Calibration
try:
    from calibration import MODEL_FORMAT
except ImportError:
    MODEL_FORMAT = "linear_tan_json_v1"
import base64
import hashlib
import hmac
import time
import os
from dotenv import load_dotenv

load_dotenv()


# ─── Config ───────────────────────────────────────────────────
class Config:
    def __init__(self):
        self.device = os.getenv("DEVICE", "cuda")
        self.tracking_token_secret = os.getenv(
            "TRACKING_TOKEN_SECRET",
            "dev-tracking-token-secret",
        )
        self.allowed_ws_origins = [
            origin.strip()
            for origin in os.getenv(
                "AI_WS_ORIGINS",
                "http://localhost:5173,http://localhost:9080",
            ).split(",")
            if origin.strip()
]


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


class CalibrationLoadRequest(BaseModel):
    model_config = {"protected_namespaces": ()}

    session_id: str
    model_x_b64: str
    model_y_b64: str
    model_format: str

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
    model_x_b64, model_y_b64 = calibrator.export_linear_tan_artifacts()

    train_predictions = np.asarray([calibrator.predict_normalized(pitch, yaw) for pitch, yaw in gaze_arr], dtype=float)
    errors_norm = np.linalg.norm(train_predictions - points_arr, axis=1)
    viewport_diag = float(np.hypot(viewport_w, viewport_h))
    avg_error_px = float(np.mean(errors_norm) * viewport_diag) if len(errors_norm) else None

    return {
        "message": "Calibration successful",
        "session_id": session_id,
        "n_points": len(points_list),
        "avg_error_px": avg_error_px,
        "model_x_b64": model_x_b64,
        "model_y_b64": model_y_b64,
        "model_format": MODEL_FORMAT,
        "per_point": per_point,
    }


@app.post("/calibration/load")
def load_calibration(body: CalibrationLoadRequest):
    if body.model_format == "joblib":
        return {"error": "Legacy joblib calibration artifacts are not supported. Please calibrate again once."}
    if body.model_format != MODEL_FORMAT:
        return {"error": f"Unsupported calibration model_format '{body.model_format}'. Please calibrate again."}

    try:
        calibrator = Calibration(root=None, viewport_w=1, viewport_h=1)
        calibrator.load_linear_tan_artifacts(body.model_x_b64, body.model_y_b64)
    except ValueError as exc:
        return {"error": str(exc)}

    calibrators[body.session_id] = calibrator
    return {"ok": True, "session_id": body.session_id, "model_format": MODEL_FORMAT}


@app.post("/calibration/validate")
async def validate_calibration(
    session_id: str              = Form(...),
    points:     str              = Form(...),
    frames:     List[UploadFile] = File(...),
    viewport_w: int              = Form(1920),
    viewport_h: int              = Form(1080),
):
    pipe = get_pipeline()
    if pipe is None:
        return {"error": f"Pipeline not available: {pipeline_error}"}

    if session_id not in calibrators:
        return {"error": f"Session '{session_id}' not calibrated yet"}

    try:
        points_list = json.loads(points)
    except json.JSONDecodeError:
        return {"error": "Invalid JSON in 'points' field"}

    if len(points_list) != len(frames):
        return {"error": f"Mismatch: {len(points_list)} points but {len(frames)} frames"}

    calibrator = calibrators[session_id]
    viewport_diag = float(np.hypot(viewport_w, viewport_h))
    predictions = []
    errors_norm = []

    for point_info, frame_file in zip(points_list, frames):
        raw = await frame_file.read()
        img_array = np.frombuffer(raw, dtype=np.uint8)
        frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        if frame is None:
            continue

        result = pipe.process(frame)
        if result is None:
            continue

        pitch, yaw, tx, ty, depth = result
        pred_x, pred_y = calibrator.predict_normalized(pitch, yaw)
        pred_x = float(np.clip(pred_x, 0.0, 1.0))
        pred_y = float(np.clip(pred_y, 0.0, 1.0))
        target_x = float(point_info["x"])
        target_y = float(point_info["y"])
        error_norm = float(np.hypot(pred_x - target_x, pred_y - target_y))
        errors_norm.append(error_norm)
        predictions.append({
            "target_x": target_x,
            "target_y": target_y,
            "pred_x": pred_x,
            "pred_y": pred_y,
            "error_px": error_norm * viewport_diag,
            "error_norm": error_norm,
        })

    valid_sample_count = len(predictions)
    sample_count = len(points_list)
    metrics = {
        "sample_count": sample_count,
        "valid_sample_count": valid_sample_count,
        "valid_sample_ratio": float(valid_sample_count / sample_count) if sample_count else 0.0,
        "median_error_norm": float(np.median(errors_norm)) if errors_norm else None,
        "max_error_norm": float(np.max(errors_norm)) if errors_norm else None,
    }
    return {"predictions": predictions, "metrics": metrics}

def _b64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode((value + padding).encode("ascii"))


def verify_tracking_token(token: str | None, session_id: str) -> bool:
    if not token or "." not in token:
        return False

    payload_part, signature_part = token.rsplit(".", 1)

    expected_signature = hmac.new(
        config.tracking_token_secret.encode("utf-8"),
        payload_part.encode("ascii"),
        hashlib.sha256,
    ).digest()

    try:
        provided_signature = _b64url_decode(signature_part)
        payload = json.loads(
            _b64url_decode(payload_part).decode("utf-8")
        )
    except (ValueError, TypeError, json.JSONDecodeError):
        return False

    if not hmac.compare_digest(expected_signature, provided_signature):
        return False

    if payload.get("session_id") != session_id:
        return False

    if payload.get("purpose") != "ai_tracking":
        return False

    if int(payload.get("exp") or 0) < int(time.time()):
        return False

    return True


def websocket_origin_allowed(websocket: WebSocket) -> bool:
    origin = websocket.headers.get("origin")
    return not origin or origin in config.allowed_ws_origins

# ─── Inference (WebSocket) ────────────────────────────────────
"""
Kết nối: ws://host:port/inference?session_id=xxx

Gửi  : bytes — ảnh JPEG của frame webcam
Nhận : JSON  — {"x": float, "y": float}          nếu thành công
              {"error": str}                       nếu lỗi
"""
@app.websocket("/inference")
async def inference(
    websocket: WebSocket,
    session_id: str = Query(...),
    token: str | None = Query(default=None),
):
    if not websocket_origin_allowed(websocket):
        await websocket.close(code=1008)
        return

    if not verify_tracking_token(token, session_id):
        await websocket.close(code=1008)
        return

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
            x, y = calibrator.predict_normalized(pitch, yaw)
            await websocket.send_json({
                "x": float(np.clip(x, 0.0, 1.0)),
                "y": float(np.clip(y, 0.0, 1.0)),
            })

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
