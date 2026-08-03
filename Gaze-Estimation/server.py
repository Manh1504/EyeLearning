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
from pydantic import BaseModel

load_dotenv()

# ─── Config ───────────────────────────────────────────────────
class Config:
    face_detector          = os.environ.get("face_detector")
    face_detector_weight   = os.environ.get("face_detector_weight")
    gaze_estimator         = os.environ.get("gaze_estimator")
    gaze_estimator_weight  = os.environ.get("gaze_estimator_weight")
    calibrator             = os.environ.get("calibrator")
    device                 = os.environ.get("device")
    size                   = int(os.environ.get("size"))

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


class LoadCalibrationRequest(BaseModel):
    session_id: str
    model_x_b64: str
    model_y_b64: str
    model_format: str = "joblib"


def validation_metrics(predictions: list[dict], viewport_w: int, viewport_h: int) -> dict:
    valid = [item for item in predictions if item.get("ok")]
    if not predictions:
        return {
            "sample_count": 0,
            "valid_sample_count": 0,
            "valid_sample_ratio": 0,
            "median_error_norm": None,
            "max_error_norm": None,
        }
    diagonal = float(np.sqrt(viewport_w ** 2 + viewport_h ** 2)) or 1.0
    errors = [item["error_px"] / diagonal for item in valid]
    return {
        "sample_count": len(predictions),
        "valid_sample_count": len(valid),
        "valid_sample_ratio": len(valid) / len(predictions),
        "median_error_norm": float(np.median(errors)) if errors else None,
        "max_error_norm": float(np.max(errors)) if errors else None,
    }

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
        "device": config.device,
        "pipeline_loaded": pipeline is not None,
        "pipeline_error": pipeline_error,
    }


# ─── Calibration ──────────────────────────────────────────────
"""
Nhận N ảnh + N tọa độ (x, y normalized 0–1) → train SVR → lưu vào calibrators[session_id]

Form fields:
  - session_id  : str
  - points      : JSON string, VD: [{"x": 0.5, "y": 0.5, "name": "top-left"}, ...]
  - frames      : List[UploadFile] — ảnh JPEG tương ứng với từng điểm
  - viewport_w  : int — window.innerWidth lúc calib (dùng để quy avg_error ra pixel thật)
  - viewport_h  : int — window.innerHeight lúc calib

Response:
  - {
      "message": str, "session_id": str, "n_points": int,
      "avg_error_px": float,
      "per_point": [{"name": str, "x": float, "y": float, "pitch": float, "yaw": float}, ...],
      "model_x_b64": str, "model_y_b64": str, "model_format": "joblib"
    }
  - {"error": str}
"""
@app.post("/calibrate")
async def calibrate(
    session_id: str              = Form(...),
    points:     str              = Form(...),
    frames:     List[UploadFile] = File(...),
    viewport_w: int               = Form(1920),
    viewport_h: int               = Form(1080),
):
    try:
        active_pipeline = get_pipeline()
        if active_pipeline is None:
            return {"error": f"AI pipeline failed to load: {pipeline_error}"}

        points_list = json.loads(points)

        if len(points_list) != len(frames):
            return {"error": f"Số điểm ({len(points_list)}) và số ảnh ({len(frames)}) không khớp."}

        if len(points_list) < 5:
            return {"error": "Cần ít nhất 5 điểm calibration."}

        points_arr = np.array([[p["x"], p["y"]] for p in points_list])  # (N, 2)
        names_list = [p.get("name") for p in points_list]

        # Decode ảnh
        images = []
        for file in frames:
            image_bytes = await file.read()
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                return {"error": f"Lỗi đọc ảnh: {file.filename}"}
            images.append(img)

        # Chạy pipeline lấy pitch/yaw cho từng frame
        rgb_images = [cv2.cvtColor(img, cv2.COLOR_BGR2RGB) for img in images]
        raw_results = [active_pipeline(img) for img in rgb_images]

        # Lọc bỏ frame không detect được khuôn mặt
        valid = [
            (r, p, n) for r, p, n in zip(raw_results, points_arr, names_list) if r is not None
        ]
        if len(valid) < 5:
            return {"error": f"Chỉ detect được {len(valid)} khuôn mặt, cần ít nhất 5."}

        results_arr = np.array([v[0] for v in valid])   # (M, 2) — pitch/yaw
        points_arr  = np.array([v[1] for v in valid])   # (M, 2) — x/y
        names_arr   = [v[2] for v in valid]

        # Train SVR
        cal = Calibration(model_name=config.calibrator)
        cal.creat_calibration_model(results_arr, points_arr)
        calibrators[session_id] = cal

        avg_error_px = cal.compute_avg_error_px(results_arr, points_arr, viewport_w, viewport_h)
        model_x_b64, model_y_b64 = cal.export_models_b64()

        per_point = [
            {
                "name": name,
                "x": float(point[0]),
                "y": float(point[1]),
                "pitch": float(result[0]),
                "yaw": float(result[1]),
            }
            for result, point, name in zip(results_arr, points_arr, names_arr)
        ]

        return {
            "message":      "Calibration thành công",
            "session_id":   session_id,
            "n_points":     len(valid),
            "avg_error_px": avg_error_px,
            "per_point":    per_point,
            "model_x_b64":  model_x_b64,
            "model_y_b64":  model_y_b64,
            "model_format": "joblib",
        }

    except Exception as e:
        return {"error": f"Lỗi server: {str(e)}"}


@app.post("/calibration/load")
async def load_calibration(body: LoadCalibrationRequest):
    if body.model_format != "joblib":
        return {"error": "Unsupported calibration model format"}
    try:
        cal = Calibration(model_name=config.calibrator)
        cal.import_models_b64(body.model_x_b64, body.model_y_b64)
        calibrators[body.session_id] = cal
        return {"ok": True, "session_id": body.session_id, "model_format": body.model_format}
    except Exception as exc:
        return {"error": f"Không thể tải hồ sơ căn chỉnh: {str(exc)}"}


@app.post("/calibration/validate")
async def validate_calibration(
    session_id: str = Form(...),
    points: str = Form(...),
    frames: List[UploadFile] = File(...),
    viewport_w: int = Form(1920),
    viewport_h: int = Form(1080),
):
    try:
        active_pipeline = get_pipeline()
        if active_pipeline is None:
            return {"error": f"AI pipeline failed to load: {pipeline_error}"}
        if session_id not in calibrators:
            return {"error": "session_id chưa được load hồ sơ căn chỉnh"}

        points_list = json.loads(points)
        if len(points_list) != len(frames):
            return {"error": f"Số điểm ({len(points_list)}) và số ảnh ({len(frames)}) không khớp."}

        predictions = []
        cal = calibrators[session_id]
        diagonal = float(np.sqrt(viewport_w ** 2 + viewport_h ** 2)) or 1.0
        for point, file in zip(points_list, frames):
            image_bytes = await file.read()
            nparr = np.frombuffer(image_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                predictions.append({"name": point.get("name"), "ok": False, "error": "Invalid image"})
                continue
            result = active_pipeline(cv2.cvtColor(img, cv2.COLOR_BGR2RGB))
            if result is None:
                predictions.append({"name": point.get("name"), "ok": False, "error": "No face detected"})
                continue
            pred_x, pred_y = cal.predict_gaze(result[0], result[1])
            err_x_px = (pred_x - float(point["x"])) * viewport_w
            err_y_px = (pred_y - float(point["y"])) * viewport_h
            error_px = float(np.sqrt(err_x_px ** 2 + err_y_px ** 2))
            predictions.append({
                "name": point.get("name"),
                "ok": True,
                "target_x": float(point["x"]),
                "target_y": float(point["y"]),
                "pred_x": float(pred_x),
                "pred_y": float(pred_y),
                "error_px": error_px,
                "error_norm": error_px / diagonal,
            })

        return {
            "session_id": session_id,
            "predictions": predictions,
            "metrics": validation_metrics(predictions, viewport_w, viewport_h),
        }
    except Exception as exc:
        return {"error": f"Lỗi validation: {str(exc)}"}


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

    active_pipeline = get_pipeline()
    if active_pipeline is None:
        await websocket.send_text(json.dumps({"error": f"AI pipeline failed to load: {pipeline_error}"}))
        await websocket.close()
        return

    if session_id not in calibrators:
        await websocket.send_text(json.dumps({"error": "session_id chưa được calibrate"}))
        await websocket.close()
        return

    cal = calibrators[session_id]

    try:
        while True:
            payload = await websocket.receive_bytes()
            if not payload:
                continue

            try:
                nparr = np.frombuffer(payload, np.uint8)
                img   = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

                if img is None:
                    await websocket.send_text(json.dumps({"error": "Invalid image"}))
                    continue

                rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
                result  = active_pipeline(rgb_img)

                if result is not None:
                    pred_x, pred_y = cal.predict_gaze(result[0], result[1])
                    await websocket.send_text(json.dumps({
                        "x": float(pred_x),
                        "y": float(pred_y),
                    }))
                else:
                    await websocket.send_text(json.dumps({"error": "No face detected"}))

            except Exception as e:
                print(f"[Frame error] {e}")
                await websocket.send_text(json.dumps({"error": "Frame processing error"}))

    except WebSocketDisconnect:
        print(f"[Disconnected] session_id={session_id}")
