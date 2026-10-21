import time

import pytest

from app.services.sessions import SessionManager
from app.settings import MAX_SAMPLES_PER_POINT

POINTS = {"a": (0.1, 0.1), "b": (0.9, 0.9)}


def test_create_get_delete():
    manager = SessionManager(ttl=60, max_sessions=5)
    sid = manager.create(dict(POINTS))

    session = manager.get(sid)
    assert session is not None
    assert session.state == "collecting"

    assert manager.delete(sid) is session
    assert manager.get(sid) is None
    assert manager.delete(sid) is None


def test_capacity_limit():
    manager = SessionManager(ttl=60, max_sessions=2)
    manager.create(dict(POINTS))
    manager.create(dict(POINTS))

    with pytest.raises(RuntimeError, match="too many sessions"):
        manager.create(dict(POINTS))


def test_cleanup_expired_frees_capacity_on_create():
    manager = SessionManager(ttl=0, max_sessions=1)  # mọi session hết hạn ngay
    manager.create(dict(POINTS))
    time.sleep(0.01)

    # create phải tự dọn slot hết hạn thay vì trả 503
    sid = manager.create(dict(POINTS))
    assert manager.get(sid) is not None


def test_add_sample_caps_buffer():
    manager = SessionManager(ttl=60, max_sessions=1)
    session = manager.get(manager.create(dict(POINTS)))

    for i in range(MAX_SAMPLES_PER_POINT + 10):
        session.add_sample("a", float(i), float(i))

    assert len(session.samples["a"]) == MAX_SAMPLES_PER_POINT
    # giữ mẫu mới nhất
    assert session.samples["a"][-1][0] == float(MAX_SAMPLES_PER_POINT + 9)
