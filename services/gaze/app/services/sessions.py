import time
import uuid

from app.services.calibration import Calibration
from app.services.preprocessing import OneEuroFilter2D


class Session:
    def __init__(self, points):  # points: dict id -> (x, y)
        self.points = points
        self.samples = {}          # point_id -> list [(pitch, yaw, x, y)]
        self.calib = Calibration()
        self.smoother = OneEuroFilter2D()
        self.state = "collecting"  # "collecting" -> "ready"
        self.last_active = time.time()
        self.processing = False    # drop-frame flag


class SessionManager:
    def __init__(self, ttl=1800, max_sessions=100):
        self.sessions = {}         # sid -> Session
        self.ttl, self.max = ttl, max_sessions

    def create(self, points):
        if len(self.sessions) >= self.max:
            raise RuntimeError("too many sessions")
        sid = str(uuid.uuid4())
        self.sessions[sid] = Session(points)
        return sid

    def get(self, sid):
        s = self.sessions.get(sid)
        if s:
            s.last_active = time.time()
        return s

    def delete(self, sid):
        return self.sessions.pop(sid, None)

    def cleanup_expired(self):
        now = time.time()
        for sid in [k for k, v in self.sessions.items() if now - v.last_active > self.ttl]:
            self.sessions.pop(sid, None)
