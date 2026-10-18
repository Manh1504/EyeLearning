import asyncio
import threading

import cv2
import numpy as np
import torch
from contextlib import asynccontextmanager
from fastapi import FastAPI, File, Form, HTTPException, UploadFile, WebSocket
from fastapi.responses import JSONResponse, Response

from models import Pipline
from schemas import SessionRequest
from session_manager import SessionManager

MIN_SAMPLES = 2  # số mẫu tối thiểu cho mỗi điểm trước khi train

pipeline = None
sessions = SessionManager()
inference_lock = threading.Lock()  # torch/mediapipe không thread-safe


# ===================================================== #
#                       KHỞI TẠO                        #
# ===================================================== #
@asynccontextmanager
async def lifespan(app):
    global pipeline
    pipeline = Pipline(None)  # cố định mediapipe + unigaze, load 1 lần
    task = asyncio.create_task(cleanup_loop())
    yield
    task.cancel()


app = FastAPI(title="Gaze API", lifespan=lifespan)


async def cleanup_loop():
    while True:
        await asyncio.sleep(60)
        sessions.cleanup_expired()


def decode_jpeg(data):  # bytes -> ảnh BGR, None nếu hỏng
    return cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)


def run_pipeline(frame):  # (pitch, yaw) hoặc None nếu không có khuôn mặt
    with inference_lock:
        return pipeline.process(frame)


# ===================================================== #
#                      HEALTH CHECK                     #
# ===================================================== #
@app.get("/health")
def health():
    return {
        "status": "ok" if pipeline is not None else "degraded",
        "gpu_available": torch.cuda.is_available(),
        "pipeline_ready": pipeline is not None,
    }


# ===================================================== #
#                      CALIBRATION                      #
# ===================================================== #
@app.get("/session/{sid}")
def session_status(sid: str):
    s = sessions.get(sid)
    if s is None:
        raise HTTPException(404, "session not found")
    return {
        "state": s.state,
        "samples": {pid: len(ms) for pid, ms in s.samples.items()},
        "calibrated": s.state == "ready",
    }


@app.post("/session")
def create_session(req: SessionRequest):
    try:
        points = {p.id: (p.x, p.y) for p in req.points}
        sid = sessions.create(req.screen_width, req.screen_height, points)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    return {"session_id": sid}


@app.delete("/session/{sid}")
def delete_session(sid: str):
    if sessions.delete(sid) is None:
        raise HTTPException(404, "session not found")
    return {"status": "deleted"}


@app.post("/session/{sid}/calibrate")
async def calibrate(sid: str, image: UploadFile = File(...), point_id: str = Form(...)):
    s = sessions.get(sid)
    if s is None:
        raise HTTPException(404, "session not found")
    if point_id not in s.points:
        return {"status": "unknown_point"}

    frame = decode_jpeg(await image.read())
    if frame is None:
        return {"status": "invalid_image"}

    result = await asyncio.to_thread(run_pipeline, frame)
    if result is None:
        return {"status": "no_face"}  # backend bắt người dùng làm lại

    pitch, yaw = result
    s.samples.setdefault(point_id, []).append([pitch, yaw, *s.points[point_id]])
    return {"status": "accepted", "count": len(s.samples[point_id])}


@app.post("/session/{sid}/train")
def train(sid: str):
    s = sessions.get(sid)
    if s is None:
        raise HTTPException(404, "session not found")

    missing = {pid: len(s.samples.get(pid, [])) for pid in s.points}
    bad = {pid: n for pid, n in missing.items() if n < MIN_SAMPLES}
    if bad:  # đảm bảo đủ N điểm × K mẫu
        return JSONResponse(
            {"status": "insufficient_samples", "detail": bad}, status_code=422)

    X = np.array([m[:2] for ms in s.samples.values() for m in ms])
    y = np.array([m[2:] for ms in s.samples.values() for m in ms])
    s.calib.create_model(X, y)
    mae = s.calib.evaluate(X, y)
    s.state = "ready"
    return {"status": "ok", "n_samples": len(X), "mae_px": mae}


# ===================================================== #
#                LƯU / TÁI SỬ DỤNG MODEL                #
# ===================================================== #
@app.get("/session/{sid}/model")
def download_model(sid: str):
    s = sessions.get(sid)
    if s is None:
        raise HTTPException(404, "session not found")
    if s.state != "ready":
        raise HTTPException(409, "not calibrated")
    return Response(
        s.calib.serialize(), media_type="application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="calibration_{sid}.ubj"'})


@app.post("/session/{sid}/import")
async def import_model(sid: str, model: UploadFile = File(...)):
    s = sessions.get(sid)
    if s is None:
        raise HTTPException(404, "session not found")
    try:
        s.calib.deserialize(await model.read())
    except Exception:
        return {"status": "invalid_model"}
    s.state = "ready"  # bỏ qua calibration
    return {"status": "ready"}


# ===================================================== #
#                       STREAMING                       #
# ===================================================== #
@app.websocket("/session/{sid}/stream")
async def stream(ws: WebSocket, sid: str):
    s = sessions.get(sid)
    if s is None or s.state != "ready":
        await ws.close(code=1008, reason="not_calibrated")
        return
    await ws.accept()
    while True:
        msg = await ws.receive()
        if msg["type"] == "websocket.disconnect":
            break
        data = msg.get("bytes")
        if data is None:
            continue
        if s.processing:  # drop frame, không xếp hàng
            continue
        s.processing = True
        try:
            error, point = await asyncio.to_thread(predict, s, data)
            if error:
                await ws.send_json({"ok": False, "error": error})
            else:
                await ws.send_json({"ok": True, "x": point[0], "y": point[1]})
        finally:
            s.processing = False


def predict(s, jpeg_bytes): 
    frame = decode_jpeg(jpeg_bytes)
    if frame is None:
        return "invalid_image", None
    result = run_pipeline(frame)
    if result is None:
        return "no_face", None
    x, y = s.calib.predict(*result)
    return None, s.smoother.process([x, y])


# ===================================================== #
#                         CHẠY                          #
# ===================================================== #
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
