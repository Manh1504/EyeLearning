import time
from collections import deque
from ipaddress import ip_address, ip_network
from uuid import uuid4

from fastapi import HTTPException, Request, status

from app.core.config import settings
from app.db.redis import get_redis, report_failure

# Fallback in-memory (1 worker). Khi Redis có sẵn thì dùng sliding-window trên
# sorted set, chia sẻ được giữa nhiều worker/replica.
_BUCKETS: dict[str, deque[float]] = {}
_PRUNE_EVERY = 1024  # dọn khóa rỗng sau mỗi N lần để tránh rò rỉ bộ nhớ
_CALLS = 0


def _trusted_networks() -> list:
    """Danh sách dải mạng proxy tin cậy (CIDR) — đọc 1 lần từ settings."""
    nets = []
    for raw in settings.trusted_proxy_ips.split(","):
        cidr = raw.strip()
        if not cidr:
            continue
        try:
            nets.append(ip_network(cidr, strict=False))
        except ValueError:
            # Cấu hình sai → bỏ qua (fail-safe: không tin header nào).
            continue
    return nets


_TRUSTED_NETWORKS = _trusted_networks()


def _peer_is_trusted(peer: str | None) -> bool:
    if not peer or not _TRUSTED_NETWORKS:
        return False
    try:
        addr = ip_address(peer)
    except ValueError:
        return False
    return any(addr in net for net in _TRUSTED_NETWORKS)


def _real_ip(request: Request) -> str:
    """Lấy IP người dùng thật, chỉ tin header khi request đến từ proxy tin cậy.

    Luồng production: Cloudflare → cloudflared → nginx (realip lấy
    CF-Connecting-IP, ghi đè X-Forwarded-For = $remote_addr) → backend.
    Vì vậy X-Forwarded-For do backend nhận LUÔN do nginx đặt, không phải do
    client. Nếu peer không nằm trong dải tin cậy (vd. client gọi trực tiếp),
    header bị bỏ qua để chống giả mạo IP → rate-limit không bị bypass.
    """
    peer = request.client.host if request.client else None
    if _peer_is_trusted(peer):
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
    return peer or "unknown"


def _prune() -> None:
    for key in [k for k, v in _BUCKETS.items() if not v]:
        del _BUCKETS[key]


def _memory_check(ident: str, limit: int, seconds: int) -> int:
    """Sliding window in-memory. Trả về Retry-After > 0 nếu bị chặn, 0 nếu cho phép."""
    global _CALLS
    now = time.monotonic()
    bucket = _BUCKETS.setdefault(ident, deque())
    while bucket and now - bucket[0] > seconds:
        bucket.popleft()
    if len(bucket) >= limit:
        return int(seconds - (now - bucket[0])) + 1
    bucket.append(now)

    _CALLS += 1
    if _CALLS >= _PRUNE_EVERY:
        _prune()
        _CALLS = 0
    return 0


async def _redis_check(client, ident: str, limit: int, seconds: int) -> int:
    """Sliding window trên Redis sorted set. Trả về Retry-After > 0 nếu chặn."""
    now = time.time()
    key = f"rl:{ident}"
    member = f"{now:.6f}:{uuid4().hex}"
    pipe = client.pipeline(transaction=False)
    pipe.zremrangebyscore(key, 0, now - seconds)
    pipe.zadd(key, {member: now})
    pipe.zcard(key)
    pipe.expire(key, seconds)
    results = await pipe.execute()
    count = int(results[2])
    if count <= limit:
        return 0
    oldest = await client.zrange(key, 0, 0, withscores=True)
    if oldest:
        return int(seconds - (now - float(oldest[0][1]))) + 1
    return seconds


def rate_limit(limit: int, seconds: int, key_prefix: str):
    """Trả về dependency: tối đa `limit` request / `seconds` cho mỗi IP.

    Vượt quá → 429 với header Retry-After. Nếu Redis lỗi → fallback in-memory,
    không bao giờ ném lỗi khác ngoài 429.
    """

    async def dependency(request: Request):
        ident = f"{key_prefix}:{_real_ip(request)}"
        client = await get_redis()
        retry = 0
        if client is not None:
            try:
                retry = await _redis_check(client, ident, limit, seconds)
            except Exception:  # noqa: BLE001 — Redis lỗi thì về in-memory
                report_failure()
                retry = _memory_check(ident, limit, seconds)
        else:
            retry = _memory_check(ident, limit, seconds)
        if retry:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Quá nhiều yêu cầu, vui lòng thử lại sau.",
                headers={"Retry-After": str(retry)},
            )

    return dependency
