import asyncio

import httpx
import websockets
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response

from app.core.config import settings

router = APIRouter(tags=["ai-proxy"])

_AI_HEADERS = {"content-type"}


async def _proxy_http(path: str, request: Request) -> Response:
    body = await request.body()
    headers = {
        k: v for k, v in request.headers.items() if k.lower() in _AI_HEADERS
    }
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(
                f"{settings.ai_http_url}{path}", content=body, headers=headers
            )
    except httpx.HTTPError:
        return JSONResponse(
            status_code=503, content={"ok": False, "error": "ai_service_unavailable"}
        )
    return Response(
        content=resp.content, status_code=resp.status_code, media_type="application/json"
    )


@router.post("/calibrate/point")
async def calibrate_point(request: Request):
    return await _proxy_http("/calibrate/point", request)


@router.post("/calibrate/fit")
async def calibrate_fit(request: Request):
    return await _proxy_http("/calibrate/fit", request)


@router.get("/ai/health")
async def ai_health():
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{settings.ai_http_url}/health")
        return {"ok": resp.status_code == 200, "status_code": resp.status_code}
    except httpx.HTTPError:
        return {"ok": False, "error": "ai_service_unavailable"}


@router.websocket("/infer")
async def infer_proxy(ws):
    await ws.accept()
    try:
        upstream = await websockets.connect(
            settings.ai_ws_url, max_size=32 * 1024 * 1024
        )
    except (OSError, websockets.exceptions.WebSocketException):
        await ws.close(code=1013)
        return

    async def forward_client():
        while True:
            message = await ws.receive()
            if message["type"] == "websocket.disconnect":
                return
            text = message.get("text")
            data = message.get("bytes")
            if text is not None:
                await upstream.send(text)
            elif data is not None:
                await upstream.send(data)

    async def forward_upstream():
        async for message in upstream:
            if isinstance(message, str):
                await ws.send_text(message)
            else:
                await ws.send_bytes(message)

    tasks = [asyncio.create_task(forward_client()), asyncio.create_task(forward_upstream())]
    try:
        await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
    finally:
        for task in tasks:
            task.cancel()
        await upstream.close()
        try:
            await ws.close()
        except RuntimeError:
            pass
