"""Kiểm thử lớp Redis (rate-limit + cache analytics) dùng fakeredis — không cần Redis thật."""

import asyncio

import fakeredis
import pytest
from fastapi import HTTPException

import app.db.redis as rdb
from app.core import rediscache
from app.core.ratelimit import _BUCKETS, _memory_check, rate_limit
from app.schemas.analytics import HotspotOut, SlideStatOut
from app.services.analytics import (
    cache_slide_stats,
    get_cached_slide_stats,
    invalidate_heatmap_cache,
)


class _FakeRequest:
    def __init__(self, ip: str):
        self.headers = {}
        self.client = type("C", (), {"host": ip})()


class _BrokenRedis:
    """Giả lập Redis đã kết nối nhưng mọi thao tác đều raise lỗi kết nối."""

    async def pipeline(self, *a, **k):
        raise ConnectionError("down")

    async def zrange(self, *a, **k):
        raise ConnectionError("down")


def _install_fake_redis():
    fake = fakeredis.FakeAsyncRedis(decode_responses=True)
    rdb._client = fake
    rdb._available = True
    return fake


def _uninstall_redis():
    rdb._client = None
    rdb._available = False


def _sample_stats() -> list[SlideStatOut]:
    return [
        SlideStatOut(
            idx=0,
            on_slide=90.5,
            fixations=3,
            view_sec=4.2,
            hotspots=[HotspotOut(x=0.1, y=0.2, r=0.05, w=0.5)],
            points=[[0.1, 0.2], [0.3, 0.4]],
        )
    ]


# ---------------------------------------------------------------- rate-limit


def test_memory_rate_limit_sliding_window():
    _BUCKETS.clear()
    ident = "login:1.2.3.4"
    assert _memory_check(ident, 3, 60) == 0
    assert _memory_check(ident, 3, 60) == 0
    assert _memory_check(ident, 3, 60) == 0
    assert _memory_check(ident, 3, 60) > 0  # request thứ 4 bị chặn


def test_redis_rate_limit_block_over_limit():
    _BUCKETS.clear()
    _install_fake_redis()
    try:
        dep = rate_limit(2, 60, "login")
        req = _FakeRequest("5.5.5.5")

        asyncio.run(dep(req))
        asyncio.run(dep(req))

        with pytest.raises(HTTPException) as exc:
            asyncio.run(dep(req))
        assert exc.value.status_code == 429
        assert int(exc.value.headers["Retry-After"]) > 0
    finally:
        _uninstall_redis()


def test_redis_rate_limit_isolates_by_ip():
    _BUCKETS.clear()
    _install_fake_redis()
    try:
        dep = rate_limit(1, 60, "login")
        asyncio.run(dep(_FakeRequest("6.6.6.6")))
        asyncio.run(dep(_FakeRequest("7.7.7.7")))  # IP khác không bị ảnh hưởng
        with pytest.raises(HTTPException):
            asyncio.run(dep(_FakeRequest("6.6.6.6")))
    finally:
        _uninstall_redis()


def test_redis_down_mid_request_falls_back_to_memory():
    _BUCKETS.clear()
    rdb._client = _BrokenRedis()
    rdb._available = True
    try:
        dep = rate_limit(2, 60, "login")
        req = _FakeRequest("9.9.9.9")
        # Redis raise → fallback in-memory, không crash.
        asyncio.run(dep(req))
        asyncio.run(dep(req))
        with pytest.raises(HTTPException):
            asyncio.run(dep(req))
        assert rdb._available is False  # đã đánh dấu mất kết nối
    finally:
        _uninstall_redis()


def test_report_failure_disables_redis_until_reconnect():
    _install_fake_redis()
    try:
        rdb.report_failure()
        assert rdb._available is False
        assert asyncio.run(rdb.get_redis()) is None
    finally:
        _uninstall_redis()


# ------------------------------------------------------------------ cache


def test_redis_cache_json_roundtrip():
    _install_fake_redis()
    try:
        asyncio.run(rediscache.json_set("k1", {"a": 1, "b": [1, 2]}, 60))
        assert asyncio.run(rediscache.json_get("k1")) == {"a": 1, "b": [1, 2]}
    finally:
        _uninstall_redis()


def test_redis_cache_int_and_increment():
    _install_fake_redis()
    try:
        assert asyncio.run(rediscache.get_int("counter")) is None
        assert asyncio.run(rediscache.increment("counter")) == 1
        assert asyncio.run(rediscache.increment("counter")) == 2
        assert asyncio.run(rediscache.get_int("counter")) == 2
    finally:
        _uninstall_redis()


def test_redis_try_acquire_lock():
    _install_fake_redis()
    try:
        assert asyncio.run(rediscache.try_acquire_lock("lock:1", 60)) is True
        assert asyncio.run(rediscache.try_acquire_lock("lock:1", 60)) is False
    finally:
        _uninstall_redis()


def test_heatmap_cache_generation_roundtrip():
    _install_fake_redis()
    try:
        lesson = "lesson-1"
        assert asyncio.run(get_cached_slide_stats(lesson, None)) is None

        asyncio.run(cache_slide_stats(lesson, None, _sample_stats()))
        cached = asyncio.run(get_cached_slide_stats(lesson, None))
        assert cached is not None
        assert SlideStatOut.model_validate(cached[0]).on_slide == 90.5

        # Invalidate (bump gen) → miss.
        asyncio.run(invalidate_heatmap_cache(lesson))
        assert asyncio.run(get_cached_slide_stats(lesson, None)) is None
    finally:
        _uninstall_redis()


def test_heatmap_cache_scope_independent():
    _install_fake_redis()
    try:
        lesson = "lesson-2"
        asyncio.run(cache_slide_stats(lesson, None, _sample_stats()))
        asyncio.run(cache_slide_stats(lesson, "s1", _sample_stats()))
        assert asyncio.run(get_cached_slide_stats(lesson, None)) is not None
        assert asyncio.run(get_cached_slide_stats(lesson, "s1")) is not None

        asyncio.run(invalidate_heatmap_cache(lesson))
        assert asyncio.run(get_cached_slide_stats(lesson, None)) is None
        assert asyncio.run(get_cached_slide_stats(lesson, "s1")) is None
    finally:
        _uninstall_redis()


def test_fallback_when_redis_absent():
    _uninstall_redis()
    assert rdb._available is False
    assert asyncio.run(rdb.get_redis()) is None
    assert asyncio.run(rediscache.json_get("anything")) is None
    assert asyncio.run(rediscache.get_int("anything")) is None
    assert asyncio.run(rediscache.try_acquire_lock("lock:1", 60)) is True
    assert asyncio.run(get_cached_slide_stats("lesson-3", None)) is None