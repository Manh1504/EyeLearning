"""Cache JSON + primitives trên Redis (fail-open, không có Redis thì no-op hoặc miss).

Mọi lỗi kết nối đều gọi `report_failure()` rồi trả về giá trị "an toàn":
- đọc -> None (miss -> caller tự tính lại từ DB);
- ghi  -> bỏ qua;
- khóa -> True (chạy bình thường, mất throttle chứ không mất dữ liệu).
"""

import json
from typing import Any

from app.db.redis import get_redis, report_failure


async def json_get(key: str) -> Any | None:
    client = await get_redis()
    if client is None:
        return None
    try:
        raw = await client.get(key)
    except Exception:  # noqa: BLE001
        report_failure()
        return None
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return None


async def json_set(key: str, value: Any, ttl: int) -> None:
    client = await get_redis()
    if client is None:
        return
    try:
        await client.set(key, json.dumps(value, default=str), ex=ttl)
    except Exception:  # noqa: BLE001
        report_failure()


async def get_int(key: str) -> int | None:
    client = await get_redis()
    if client is None:
        return None
    try:
        raw = await client.get(key)
    except Exception:  # noqa: BLE001
        report_failure()
        return None
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


async def increment(key: str) -> int | None:
    """INCR. Trả về giá trị mới (Redis tự tạo key=0 rồi +1 nếu chưa tồn tại)."""
    client = await get_redis()
    if client is None:
        return None
    try:
        return int(await client.incr(key))
    except Exception:  # noqa: BLE001
        report_failure()
        return None


async def try_acquire_lock(key: str, ttl: int) -> bool:
    """SET NX EX — chốt chống chạy lặp. Lỗi Redis -> True (fail-open, bỏ throttle)."""
    client = await get_redis()
    if client is None:
        return True
    try:
        return bool(await client.set(key, "1", nx=True, ex=ttl))
    except Exception:  # noqa: BLE001
        report_failure()
        return True