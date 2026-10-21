"""Session calibration trong RAM + quản lý vòng đời (TTL, giới hạn số session).

Truy cập được bảo vệ bằng `RLock` vì endpoint sync (chạy trong threadpool) và
endpoint async (chạy trên event loop) cùng đọc/ghi `SessionManager`.
"""

import threading
import time
import uuid

from app.services.calibration import Calibration
from app.services.smoothing import OneEuroFilter2D
from app.settings import (
    MAX_SAMPLES_PER_POINT,
    ONEEURO_BETA,
    ONEEURO_D_CUTOFF,
    ONEEURO_MIN_CUTOFF,
)


class Session:
    def __init__(self, points):  # points: dict id -> (x, y)
        self.points = points
        self.samples: dict[str, list[list[float]]] = {}  # point_id -> [(pitch, yaw, x, y)]
        self.calib = Calibration()
        self.smoother = OneEuroFilter2D(
            min_cutoff=ONEEURO_MIN_CUTOFF,
            beta=ONEEURO_BETA,
            d_cutoff=ONEEURO_D_CUTOFF,
        )
        self.state = "collecting"  # "collecting" -> "ready"
        self.last_active = time.time()
        self.processing = False    # drop-frame flag

    def add_sample(self, point_id: str, pitch: float, yaw: float) -> int:
        """Thêm 1 mẫu cho điểm; giữ tối đa MAX_SAMPLES_PER_POINT mẫu mới nhất."""
        buf = self.samples.setdefault(point_id, [])
        x, y = self.points[point_id]
        buf.append([pitch, yaw, x, y])
        if len(buf) > MAX_SAMPLES_PER_POINT:
            del buf[: len(buf) - MAX_SAMPLES_PER_POINT]
        return len(buf)


class SessionManager:
    def __init__(self, ttl=1800, max_sessions=100):
        self._sessions: dict[str, Session] = {}
        self._lock = threading.RLock()
        self.ttl = ttl
        self.max = max_sessions

    def create(self, points) -> str:
        with self._lock:
            self._cleanup_locked()  # dọn slot hết hạn trước khi check capacity
            if len(self._sessions) >= self.max:
                raise RuntimeError("too many sessions")
            sid = str(uuid.uuid4())
            self._sessions[sid] = Session(points)
            return sid

    def get(self, sid: str) -> Session | None:
        with self._lock:
            session = self._sessions.get(sid)
            if session is not None:
                session.last_active = time.time()
            return session

    def delete(self, sid: str) -> Session | None:
        with self._lock:
            return self._sessions.pop(sid, None)

    def count(self) -> int:
        with self._lock:
            return len(self._sessions)

    def cleanup_expired(self) -> None:
        with self._lock:
            self._cleanup_locked()

    def _cleanup_locked(self) -> None:
        now = time.time()
        expired = [
            sid
            for sid, session in self._sessions.items()
            if now - session.last_active > self.ttl
        ]
        for sid in expired:
            self._sessions.pop(sid, None)
