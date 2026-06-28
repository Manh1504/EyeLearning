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
    face_detector          = os.environ.get("face_detector")
    face_detector_weight   = os.environ.get("face_detector_weight")
    gaze_estimator         = os.environ.get("gaze_estimator")
    gaze_estimator_weight  = os.environ.get("gaze_estimator_weight")
    calibrator             = os.environ.get("calibrator")
    device                 = os.environ.get("device")
    size                   = int(os.environ.get("size"))

config = Config()

# ─── Khởi tạo pipeline (load 1 lần duy nhất khi server start) ─
pipeline = Pipline(args=config)

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
    return {"status": "ok"}


# ─── Calibration ──────────────────────────────────────────────
"""
Nhận N ảnh + N tọa độ (x, y normalized 0–1) → train SVR → lưu vào calibrators[session_id]

Form fields:
  - session_id : str
  - points     : JSON string, VD: [{"x": 0.5, "y": 0.5}, ...]
  - frames     : List[UploadFile] — ảnh JPEG tương ứng với từng điểm

Response:
  - {"message": str, "session_id": str, "n_points": int}
  - {"error": str}
"""
@app.post("/calibrate")
async def calibrate(
    session_id: str              = Form(...),
    points:     str              = Form(...),
    frames:     List[UploadFile] = File(...),
):
    try:
        points_list = json.loads(points)

        if len(points_list) != len(frames):
            return {"error": f"Số điểm ({len(points_list)}) và số ảnh ({len(frames)}) không khớp."}

        if len(points_list) < 5:
            return {"error": "Cần ít nhất 5 điểm calibration."}

        points_arr = np.array([[p["x"], p["y"]] for p in points_list])  # (N, 2)

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
        raw_results = [pipeline(img) for img in rgb_images]

        # Lọc bỏ frame không detect được khuôn mặt
        valid = [(r, p) for r, p in zip(raw_results, points_arr) if r is not None]
        if len(valid) < 5:
            return {"error": f"Chỉ detect được {len(valid)} khuôn mặt, cần ít nhất 5."}

        results_arr = np.array([v[0] for v in valid])   # (M, 2) — pitch/yaw
        points_arr  = np.array([v[1] for v in valid])   # (M, 2) — x/y

        # Train SVR
        cal = Calibration(model_name=config.calibrator)
        cal.creat_calibration_model(results_arr, points_arr)
        calibrators[session_id] = cal

        return {
            "message":    "Calibration thành công",
            "session_id": session_id,
            "n_points":   len(valid),
        }

    except Exception as e:
        return {"error": f"Lỗi server: {str(e)}"}


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
                result  = pipeline(rgb_img)

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