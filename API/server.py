import argparse
import asyncio
import json
import pickle
import threading
from contextlib import asynccontextmanager
from typing import List

import cv2
import numpy as np
import ubjson
from fastapi import FastAPI, File, Form, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from xgboost import XGBRegressor

from models import Pipline
from preprocessing import OneEuroFilter2D, apply_correction, fit_calibration

# ===================================================== #
#                       CẤU HÌNH                        #
# ===================================================== #
CALIBRATOR_PATH = "weights/calibrator.ubj"
MIN_POINTS = 16    # Số điểm calibration tối thiểu
MAX_POINTS = 25    # Số điểm calibration tối đa
SAMPLE_SIZE = 10   # 1 mẫu: pitch, yaw, rvec(3), tvec(3), x, y
PARAMS_SIZE = 6    # Bộ tham số hiệu chỉnh: a1, a2, b1, a3, a4, b2


# ===================================================== #
#             TRẠNG THÁI SERVER + LOAD MODEL            #
# ===================================================== #
class AppState:
    """Trạng thái dùng chung: model chỉ load 1 lần lúc khởi động."""

    def __init__(self):
        self.pipeline = None        # Pipline: detect + chuẩn hóa + gaze
        self.mapping_model = None   # Model mapping (pitch, yaw, rvec, tvec) -> (x, y)
        self.calibrator_type = None # "linear" hoặc "xgb"
        self.device = "cuda"
        self.errors = {}            # Lỗi lúc khởi động (tên model -> thông báo)
        # Khóa để tuần tự hóa truy cập model (mediapipe + torch không thread-safe)
        self.inference_lock = threading.Lock()


state = AppState()


def build_pipeline_args():
    # Defaults giống utils.get_args() nhưng không đọc sys.argv,
    # tránh xung đột với tham số dòng lệnh của uvicorn
    return argparse.Namespace(
        face_detector="mediapipe",
        face_detector_weight="weights/mediapipe.tflite",
        gaze_estimator="unigaze",
        gaze_estimator_weight="weights/unigaze_b16_joint.safetensors",
        calibrator="linear",
        new_calibration=False,
        device="cuda",
        size=448,
    )


def load_mapping_model(path):
    """
    Load model mapping từ file .ubj.
    Ưu tiên định dạng linear: ubjson {"py_pickle": pickle bytes} (xem
    train_mapping_model.py); không khớp thì fallback sang XGBoost native.
    """
    try:
        with open(path, "rb") as f:
            data = ubjson.load(f)
        if isinstance(data, dict) and "py_pickle" in data:
            return pickle.loads(data["py_pickle"]), "linear"
    except Exception:
        pass
    model = XGBRegressor()
    model.load_model(path)
    return model, "xgb"


@asynccontextmanager
async def lifespan(app):
    args = build_pipeline_args()
    state.device = args.device

    try:
        state.pipeline = Pipline(args)
    except Exception as e:
        state.errors["pipeline"] = str(e)

    try:
        state.mapping_model, state.calibrator_type = load_mapping_model(CALIBRATOR_PATH)
    except Exception as e:
        state.errors["mapping_model"] = str(e)

    yield


app = FastAPI(title="Eyetracking Server", lifespan=lifespan)


# ===================================================== #
#                   HÀM DÙNG CHUNG                      #
# ===================================================== #
def decode_jpeg(data):
    """Giải mã bytes JPEG -> ảnh BGR (cùng định dạng frame từ camera). None nếu hỏng."""
    return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)


def run_pipeline(frame):
    """Chạy pipeline (detect + chuẩn hóa + gaze) trên 1 frame, có khóa model."""
    with state.inference_lock:
        return state.pipeline.process_full(frame)


def predict_gaze(jpeg_bytes, params):
    """
    Xử lý 1 frame JPEG từ đầu đến cuối:
    giải mã -> detect + gaze -> hiệu chỉnh calibration -> mapping ra (x, y).

    Returns:
        (error, point): error là chuỗi nếu có lỗi ("invalid_image", "no_face"),
                        point là [x, y] chuẩn hóa [0, 1] khi thành công.
    """
    frame = decode_jpeg(jpeg_bytes)
    if frame is None:
        return "invalid_image", None

    result = run_pipeline(frame)
    if result is None:
        return "no_face", None

    pitch, yaw, bbox, landmarks, hr, ht = result
    pitch_c, yaw_c = apply_correction(pitch, yaw, params)
    features = np.array([[pitch_c, yaw_c, *hr.flatten(), *ht.flatten()]])
    x, y = state.mapping_model.predict(features)[0]
    return None, [float(x), float(y)]


# ===================================================== #
#                      HEALTH CHECK                     #
# ===================================================== #
@app.get("/health")
def health():
    return {
        "status": "ok" if not state.errors else "degraded",
        "device": state.device,
        "pipeline_ready": state.pipeline is not None,
        "mapping_model_ready": state.mapping_model is not None,
        "calibrator_type": state.calibrator_type,
        "calibrator_path": CALIBRATOR_PATH,
        "errors": state.errors,
    }


# ===================================================== #
#                      CALIBRATION                      #
# ===================================================== #
@app.post("/calibrate/point")
def calibrate_point(image: UploadFile = File(...), x: float = Form(...), y: float = Form(...)):
    """
    Xử lý 1 điểm calibration: nhận ảnh JPEG + điểm nhìn (x, y) chuẩn hóa [0, 1].
    Thành công: trả mẫu 10 số [pitch, yaw, rvec(3), tvec(3), x, y] để client tích lũy.
    Thất bại: trả error để client biết và cho người dùng chụp lại điểm đó.
    """
    if state.pipeline is None:
        return JSONResponse(status_code=503, content={"ok": False, "error": "pipeline_not_ready"})

    frame = decode_jpeg(image.file.read())
    if frame is None:
        return {"ok": False, "error": "invalid_image"}

    result = run_pipeline(frame)
    if result is None:
        return {"ok": False, "error": "no_face"}

    pitch, yaw, bbox, landmarks, hr, ht = result
    sample = [float(pitch), float(yaw), *hr.flatten().tolist(), *ht.flatten().tolist(), x, y]
    return {"ok": True, "sample": sample}


class FitRequest(BaseModel):
    samples: List[List[float]]  # 16-25 hàng, mỗi hàng 10 số


@app.post("/calibrate/fit")
def calibrate_fit(request: FitRequest):
    """
    Fit bộ 6 tham số hiệu chỉnh từ các mẫu đã tích lũy.
    Input:  samples = [[pitch, yaw, rvec(3), tvec(3), x, y], ...] (16-25 mẫu).
    Output: params  = [a1, a2, b1, a3, a4, b2].
    """
    if state.mapping_model is None:
        return JSONResponse(status_code=503, content={"ok": False, "error": "mapping_model_not_ready"})

    samples = request.samples
    if not (MIN_POINTS <= len(samples) <= MAX_POINTS):
        return JSONResponse(status_code=422, content={
            "ok": False,
            "error": f"expected {MIN_POINTS}-{MAX_POINTS} samples, got {len(samples)}",
        })
    for i, sample in enumerate(samples):
        if len(sample) != SAMPLE_SIZE:
            return JSONResponse(status_code=422, content={
                "ok": False,
                "error": f"sample {i} must have {SAMPLE_SIZE} values, got {len(sample)}",
            })

    params = fit_calibration(samples, state.mapping_model)
    return {"ok": True, "params": params.tolist()}


# ===================================================== #
#                 INFERENCE (STREAMING)                 #
# ===================================================== #
def parse_config(text):
    """
    Phân tích message cấu hình của WebSocket.
    Returns: (params, smoother, reply) — params/smoother là None nếu cấu hình không hợp lệ.
    """
    if state.pipeline is None:
        return None, None, {"ok": False, "error": "pipeline_not_ready"}
    if state.mapping_model is None:
        return None, None, {"ok": False, "error": "mapping_model_not_ready"}

    try:
        config = json.loads(text)
        params = np.asarray(config["params"], dtype=np.float64)
        if params.shape != (PARAMS_SIZE,):
            raise ValueError
    except Exception:
        return None, None, {"ok": False, "error": "invalid_config"}

    smooth = bool(config.get("smooth", True))
    smoother = OneEuroFilter2D(min_cutoff=0.5, beta=0.01) if smooth else None
    return params, smoother, {"ok": True}


@app.websocket("/infer")
async def infer(ws: WebSocket):
    """
    Streaming tọa độ gaze qua WebSocket:
    - Message text đầu tiên: cấu hình {"params": [6 số], "smooth": true/false}
      (smooth bật mặc định, lọc OneEuro như main.py).
    - Sau đó mỗi frame gửi binary JPEG -> server trả
      {"ok": true, "x": ..., "y": ...} (chuẩn hóa [0, 1]) hoặc {"ok": false, "error": ...}.
    - Có thể gửi lại message text bất cứ lúc nào để đổi tham số calibration.
    """
    await ws.accept()
    params = None
    smoother = None

    try:
        while True:
            message = await ws.receive()

            # Client ngắt kết nối
            if message.get("type") == "websocket.disconnect":
                break

            # Message text = cấu hình
            if message.get("text") is not None:
                new_params, new_smoother, reply = parse_config(message["text"])
                if reply["ok"]:
                    params, smoother = new_params, new_smoother
                await ws.send_json(reply)
                continue

            # Message binary = ảnh JPEG
            if message.get("bytes") is not None:
                if params is None:
                    await ws.send_json({"ok": False, "error": "not_configured"})
                    continue

                # Chạy trong thread để không chặn event loop
                error, point = await asyncio.to_thread(predict_gaze, message["bytes"], params)
                if error is not None:
                    await ws.send_json({"ok": False, "error": error})
                    continue
                if smoother is not None:
                    point = smoother.process(point)
                await ws.send_json({"ok": True, "x": point[0], "y": point[1]})
    except WebSocketDisconnect:
        pass


# ===================================================== #
#                         CHẠY                          #
# ===================================================== #
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
