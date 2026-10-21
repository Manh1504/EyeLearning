import httpx
from fastapi import APIRouter

from app.core.config import settings

router = APIRouter(tags=["ai-proxy"])


@router.get("/ai/health")
async def ai_health():
    """Kiểm tra AI service (services/gaze) đã load xong pipeline chưa.

    Gọi `/ready` (503 khi pipeline chưa sẵn sàng) thay vì `/health` để phản ánh
    đúng trạng thái sẵn dùng.
    """
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get(f"{settings.ai_http_url}/ready")
        return {"ok": resp.status_code == 200, "status_code": resp.status_code}
    except httpx.HTTPError:
        return {"ok": False, "error": "ai_service_unavailable"}
