"""Kết nối Redis async (graceful degradation).

Nguyên tắc fail-open: Redis là tăng tốc, không phải nguồn sự thật. Mọi lỗi kết nối
đều được nuốt gọn, caller fallback (in-memory / tính lại / không khóa) mà request
vẫn trả đúng dữ liệu.

Các trường hợp lỗi được xử lý:
- Redis chưa bật / sai URL / down lúc khởi động     -> `init_redis` không crash, `_available=False`.
- Redis sập GIỮA chừng (sau khi đã kết nối)         -> thao tác raise -> `report_failure()`
  đánh dấu mất kết nối; request hiện tại fallback, các request sau thử lại có cooldown.
- Redis treo (không trả lời, chỉ timeout)           -> `socket_timeout`/`socket_connect_timeout`
  2s + `retry_on_timeout=False` -> fail nhanh, không làm request treo.
- Redis hồi phục (restart)                          -> `health_check_interval` + tự reconnect sau
  `RECONNECT_COOLDOWN_SECONDS`, không cần restart backend.
"""

import asyncio
import logging
import time

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: aioredis.Redis | None = None
_available = False
_failed_at = 0.0  # thời điểm lỗi gần nhất (time.monotonic)
_lock = asyncio.Lock()

# Khoảng cách tối thiểu giữa 2 lần thử kết nối lại (tránh spam khi Redis nằm lâu).
RECONNECT_COOLDOWN_SECONDS = 30.0


def _build_client() -> aioredis.Redis:
    return aioredis.from_url(
        settings.redis_url,
        decode_responses=True,
        socket_connect_timeout=2.0,
        socket_timeout=2.0,
        retry_on_timeout=False,
        health_check_interval=30,
        max_connections=50,
    )


async def _teardown() -> None:
    global _client
    if _client is not None:
        try:
            await _client.aclose()
        except Exception:  # noqa: BLE001
            pass
    _client = None


async def _ping() -> bool:
    """Thử kết nối + ping. Thành công thì _available=True, ngược lại teardown client."""
    global _client, _available, _failed_at
    if _client is None:
        _client = _build_client()
    try:
        await _client.ping()
        _available = True
        return True
    except Exception as exc:  # noqa: BLE001
        logger.warning("Redis không khả dụng: %s", exc)
        await _teardown()
        _available = False
        _failed_at = time.monotonic()
        return False


async def init_redis() -> None:
    if not settings.redis_url:
        return
    async with _lock:
        await _ping()


async def close_redis() -> None:
    global _available
    async with _lock:
        _available = False
        await _teardown()


def report_failure() -> None:
    """Đánh dấu Redis lỗi — caller gọi khi một thao tác raise lỗi kết nối.

    Không đóng pool ngay (tránh tốn); chỉ tắt cờ + ghi thời điểm để get_redis()
    thử lại sau cooldown.
    """
    global _available, _failed_at
    _available = False
    _failed_at = time.monotonic()


async def get_redis() -> aioredis.Redis | None:
    """Trả về client nếu khả dụng; tự kết nối lại sau cooldown nếu từng fail."""
    if _available and _client is not None:
        return _client
    if not settings.redis_url:
        return None
    async with _lock:
        if _available and _client is not None:
            return _client
        if _client is not None and time.monotonic() - _failed_at < RECONNECT_COOLDOWN_SECONDS:
            return None
        if await _ping():
            return _client
        return None