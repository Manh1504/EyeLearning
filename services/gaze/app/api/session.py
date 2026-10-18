"""Session calibration + streaming gaze (HTTP + WebSocket).

Đây là toàn bộ endpoint theo vòng đời 4 bước:
    POST /session                  -> tạo session, khai báo N điểm
    POST /session/{sid}/calibrate  -> thu 1 mẫu cho 1 điểm
    POST /session/{sid}/train      -> fit LinearRegression
    WS   /session/{sid}/stream     -> streaming gaze
Model đã train có thể tải về (/model) và nạp lại (/import) để khỏi calibration lại.
"""

import asyncio

import numpy as np
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, WebSocket
from fastapi.responses import JSONResponse, Response

from app.schemas import SessionRequest
from app.services import inference
from app.services.sessions import SessionManager
from app.settings import MAX_SESSIONS, MIN_SAMPLES, SESSION_TTL_SECONDS

router = APIRouter(tags=["session"])

sessions = SessionManager(ttl=SESSION_TTL_SECONDS, max_sessions=MAX_SESSIONS)


def _get_or_404(sid: str):
    session = sessions.get(sid)
    if session is None:
        raise HTTPException(404, "session not found")
    return session


@router.get("/session/{sid}")
def session_status(sid: str):
    session = _get_or_404(sid)
    return {
        "state": session.state,
        "calibrated": session.state == "ready",
    }


@router.post("/session")
def create_session(req: SessionRequest):
    try:
        points = {p.id: (p.x, p.y) for p in req.points}
        sid = sessions.create(points)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    return {"session_id": sid}


@router.delete("/session/{sid}")
def delete_session(sid: str):
    if sessions.delete(sid) is None:
        raise HTTPException(404, "session not found")
    return {"status": "deleted"}


@router.post("/session/{sid}/calibrate")
async def calibrate(sid: str, image: UploadFile = File(...), point_id: str = Form(...)):
    session = _get_or_404(sid)
    if point_id not in session.points:
        return {"status": "unknown_point"}

    frame = inference.decode_jpeg(await image.read())
    if frame is None:
        return {"status": "invalid_image"}

    result = await asyncio.to_thread(inference.process_frame, frame)
    if result is None:
        return {"status": "no_face"}  # client bắt người dùng chụp lại điểm này

    pitch, yaw = result
    session.samples.setdefault(point_id, []).append(
        [pitch, yaw, *session.points[point_id]]
    )
    return {"status": "accepted", "count": len(session.samples[point_id])}


@router.post("/session/{sid}/train")
def train(sid: str):
    session = _get_or_404(sid)

    missing = {pid: len(session.samples.get(pid, [])) for pid in session.points}
    bad = {pid: n for pid, n in missing.items() if n < MIN_SAMPLES}
    if bad:  # bảo đảm đủ N điểm × K mẫu
        return JSONResponse(
            {"status": "insufficient_samples", "detail": bad}, status_code=422
        )

    X = np.array([m[:2] for ms in session.samples.values() for m in ms])
    y = np.array([m[2:] for ms in session.samples.values() for m in ms])
    session.calib.create_model(X, y)
    mae = session.calib.evaluate(X, y)
    session.state = "ready"
    return {"status": "ok", "n_samples": len(X), "mae_px": mae}


@router.get("/session/{sid}/model")
def download_model(sid: str):
    session = _get_or_404(sid)
    if session.state != "ready":
        raise HTTPException(409, "not calibrated")
    return Response(
        session.calib.serialize(),
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f'attachment; filename="calibration_{sid}.ubj"'
        },
    )


@router.post("/session/{sid}/import")
async def import_model(sid: str, model: UploadFile = File(...)):
    session = _get_or_404(sid)
    try:
        session.calib.deserialize(await model.read())
    except Exception:
        return {"status": "invalid_model"}
    session.state = "ready"  # bỏ qua calibration
    return {"status": "ready"}


@router.websocket("/session/{sid}/stream")
async def stream(ws: WebSocket, sid: str):
    session = sessions.get(sid)
    if session is None or session.state != "ready":
        # Phải accept() trước khi close(): nếu close lúc còn ở trạng thái
        # handshake, uvicorn trả HTTP 403 và client không nhận được close code.
        await ws.accept()
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
        if session.processing:  # drop frame, không xếp hàng
            continue
        session.processing = True
        try:
            error, point = await asyncio.to_thread(inference.predict, session, data)
            if error:
                await ws.send_json({"ok": False, "error": error})
            else:
                await ws.send_json({"ok": True, "x": point[0], "y": point[1]})
        finally:
            session.processing = False
