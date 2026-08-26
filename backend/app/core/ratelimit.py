import time
from collections import deque
from fastapi import HTTPException, Request, status

# Bộ đếm theo (key -> deque timestamp). In-memory, chia sẻ trong 1 process worker.
# Nếu chạy nhiều worker thì cần store chung (redis) — hiện tại backend chạy 1 worker.
_BUCKETS: dict[str, deque[float]] = {}


def _real_ip(request: Request) -> str:
    # Đứng sau nginx/cloudflare: ưu tiên X-Forwarded-For, X-Real-IP.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
    return request.client.host or "unknown"


def rate_limit(limit: int, seconds: int, key_prefix: str):
    """Trả về dependency: tối đa `limit` request / `seconds` cho mỗi IP.

    Vượt quá → 429 với header Retry-After.
    """

    async def dependency(request: Request):
        ident = f"{key_prefix}:{_real_ip(request)}"
        now = time.monotonic()
        bucket = _BUCKETS.setdefault(ident, deque())
        while bucket and now - bucket[0] > seconds:
            bucket.popleft()
        if len(bucket) >= limit:
            retry_after = int(seconds - (now - bucket[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Quá nhiều yêu cầu, vui lòng thử lại sau.",
                headers={"Retry-After": str(retry_after)},
            )
        bucket.append(now)

    return dependency
