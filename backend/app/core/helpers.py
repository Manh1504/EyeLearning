import hashlib
from datetime import datetime, timezone

GRADIENTS = [
    "from-cyan-500 to-blue-600",
    "from-emerald-500 to-teal-600",
    "from-violet-500 to-purple-600",
    "from-amber-500 to-orange-600",
    "from-rose-500 to-pink-600",
    "from-sky-500 to-indigo-600",
    "from-teal-500 to-emerald-600",
    "from-fuchsia-500 to-purple-600",
    "from-lime-500 to-green-600",
    "from-orange-500 to-red-600",
]

AVATAR_COLORS = [
    "from-cyan-500 to-blue-500",
    "from-violet-500 to-purple-500",
    "from-amber-500 to-orange-500",
    "from-emerald-500 to-teal-500",
    "from-rose-500 to-pink-500",
    "from-indigo-500 to-blue-500",
    "from-slate-500 to-slate-600",
    "from-teal-500 to-cyan-500",
]


def _digest(key: str) -> int:
    return int.from_bytes(hashlib.md5(key.encode("utf-8")).digest()[:4], "big")


def gradient_for(key: str) -> str:
    return GRADIENTS[_digest(key) % len(GRADIENTS)]


def color_for(key: str) -> str:
    return AVATAR_COLORS[_digest(key) % len(AVATAR_COLORS)]


def relative_time_vn(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    delta = datetime.now(timezone.utc) - dt
    minutes = int(delta.total_seconds() // 60)
    if minutes < 1:
        return "Vừa xong"
    if minutes < 60:
        return f"{minutes} phút trước"
    hours = minutes // 60
    if hours < 24:
        return f"{hours} giờ trước"
    days = hours // 24
    if days < 7:
        return f"{days} ngày trước"
    weeks = days // 7
    if weeks < 5:
        return f"{weeks} tuần trước"
    months = days // 30
    return f"{months} tháng trước"
