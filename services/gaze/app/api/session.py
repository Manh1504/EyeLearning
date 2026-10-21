"""Session calibration + streaming gaze (HTTP + WebSocket).

Vòng đời 4 bước:
    POST /session                  -> tạo session, khai báo N điểm
    POST /session/{sid}/calibrate  -> thu 1 mẫu cho 1 điểm
    POST /session/{sid}/train      -> fit hồi quy tuyến tính
    WS   /session/{sid}/stream     -> streaming gaze

Model đã train có thể tải về (/model) và nạp lại (/import, format .ubj v2) để
khỏi calibration lại.
"""

import logging

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, WebSocket
from fastapi.responses import JSONResponse, Response

from app.schemas import (
    CalibrateResult,
    DeletedResult,
    ImportResult,
    InsufficientSamples,
    SessionCreated,
    SessionRequest,
    SessionStatus,
    TrainResult,
)
from app.services import inference
from app.services.sessions import SessionManager
from app.settings import (
    MAX_SESSIONS,
    MAX_UPLOAD_BYTES,
    MIN_SAMPLES,
    SESSION_TTL_SECONDS,
)

logger = logging.getLogger("app.gaze")

router = APIRouter(tags=["session"])

sessions = SessionManager(ttl=SESSION_TTL_SECONDS, max_sessions=MAX_SESSIONS)


def _get_or_404(sid: str):
    session = sessions.get(sid)
    if session is None:
        raise HTTPException(404, "session not found")
    return session


async def _read_limited(upload: UploadFile, limit: int = MAX_UPLOAD_BYTES) -> bytes:
    """Đọc tối đa `limit` bytes; vượt -> 413 (không nạp cả file khổng lồ vào RAM)."""
    data = await upload.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, "file quá lớn")
    return data


@router.get("/session/{sid}", response_model=SessionStatus)
def session_status(sid: str):
    session = _get_or_404(sid)
    return SessionStatus(
        state=session.state, calibrated=session.state == "ready"
    )


@router.post("/session", response_model=SessionCreated)
def create_session(req: SessionRequest):
    points = {p.id: (p.x, p.y) for p in req.points}
    try:
        sid = sessions.create(points)
    except RuntimeError as e:
        raise HTTPException(503, str(e))
    return SessionCreated(session_id=sid)


@router.delete("/session/{sid}", response_model=DeletedResult)
def delete_session(sid: str):
    if sessions.delete(sid) is None:
        raise HTTPException(404, "session not found")
    return DeletedResult()


@router.post("/session/{sid}/calibrate", response_model=CalibrateResult)
async def calibrate(sid: str, image: UploadFile = File(...), point_id: str = Form(...)):
    session = _get_or_404(sid)
    if point_id not in session.points:
        return CalibrateResult(status="unknown_point")
    if not inference.pipeline_ready():
        raise HTTPException(503, "pipeline chưa sẵn sàng")

    frame = inference.decode_jpeg(await _read_limited(image))
    if frame is None:
        return CalibrateResult(status="invalid_image")

    try:
        result = await inference.run_inference(inference.process_frame, frame)
    except Exception:  # lỗi suy luận không được làm sập request
        logger.exception("Calibration inference lỗi (sid=%s, point=%s)", sid, point_id)
        raise HTTPException(500, "inference failed")
    if result is None:
        return CalibrateResult(status="no_face")

    pitch, yaw = result
    count = session.add_sample(point_id, pitch, yaw)
    return CalibrateResult(status="accepted", count=count)


@router.post(
    "/session/{sid}/train",
    response_model=TrainResult,
    responses={422: {"model": InsufficientSamples}},
)
def train(sid: str):
    session = _get_or_404(sid)

    missing = {pid: len(session.samples.get(pid, [])) for pid in session.points}
    bad = {pid: n for pid, n in missing.items() if n < MIN_SAMPLES}
    if bad:  # bảo đảm đủ N điểm × K mẫu
        return JSONResponse(
            InsufficientSamples(detail=bad).model_dump(), status_code=422
        )

    X = [m[:2] for ms in session.samples.values() for m in ms]
    y = [m[2:] for ms in session.samples.values() for m in ms]
    mae = session.calib.evaluate(X, y)  # fit full ở cuối
    session.state = "ready"
    logger.info("Train xong sid=%s n_samples=%d mae=%s", sid, len(X), mae)
    return TrainResult(n_samples=len(X), mae_px=mae)


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


@router.post("/session/{sid}/import", response_model=ImportResult)
async def import_model(sid: str, model: UploadFile = File(...)):
    session = _get_or_404(sid)
    try:
        session.calib.deserialize(await _read_limited(model))
    except (ValueError, KeyError, TypeError):
        return ImportResult(status="invalid_model")
    session.state = "ready"  # bỏ qua calibration
    return ImportResult(status="ready")


@router.websocket("/session/{sid}/stream")
async def stream(ws: WebSocket, sid: str):
    await ws.accept()
    session = sessions.get(sid)
    if session is None or session.state != "ready":
        # accept() trước để client nhận đúng close code (không phải HTTP 403).
        await ws.close(code=1008, reason="not_calibrated")
        return
    if not inference.pipeline_ready():
        await ws.close(code=1013, reason="pipeline_not_ready")
        return

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
            error, point = await inference.run_inference(
                inference.predict, session, data
            )
            if error:
                await ws.send_json({"ok": False, "error": error})
            else:
                await ws.send_json({"ok": True, "x": point[0], "y": point[1]})
        except Exception:
            # Lỗi suy luận 1 frame không được ngắt phiên stream.
            await ws.send_json({"ok": False, "error": "internal"})
        finally:
            session.processing = False
