import asyncio
import os
import tempfile

os.environ["TESTING"] = "1"
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5435/eyetracking_test",
)
os.environ.setdefault("JWT_SECRET", "test-jwt-secret-for-pytest-please-change")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:3000")
os.environ.setdefault("AI_HTTP_URL", "http://127.0.0.1:8000")
os.environ["MEDIA_DIR"] = os.path.join(tempfile.gettempdir(), "eyelearning-test-media")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.ratelimit import _BUCKETS
from app.core.security import hash_password
from app.db.session import SessionLocal, engine
from app.main import app

TRUNCATE = """
TRUNCATE TABLE users, courses, enrollments, devices, calibration_sessions,
calibration_params, learning_sessions, gaze_events, gaze_slide_stats,
heatmap_aggregates, aoi_regions, aoi_dwell_stats, engagement_scores,
slide_coverage_stats, lesson_mastery_scores, auth_sessions CASCADE
"""

# Tự động áp migrations cho DB test (để stack update/recreate vẫn tự migrate)
# Dùng logic giống CI: chạy toàn bộ db/migrations/*.sql, idempotent nên an toàn
MIGRATIONS_DIR = None
try:
    from pathlib import Path as _P
    _cand = _P(__file__).resolve().parents[2] / "db" / "migrations"
    if _cand.is_dir():
        MIGRATIONS_DIR = _cand
except Exception:
    pass


def _split_sql(sql: str) -> list[str]:
    """Chia file SQL thành từng statement, tôn trọng $$...$$ và '...'."""
    stmts: list[str] = []
    buf = ""
    in_dollar = False
    in_single = False
    i = 0
    import re as _re

    cleaned = _re.sub(r"^\s*BEGIN\s*;\s*", "", sql, flags=_re.IGNORECASE)
    cleaned = _re.sub(r"\s*COMMIT\s*;\s*$", "", cleaned, flags=_re.IGNORECASE)
    while i < len(cleaned):
        if not in_single and cleaned[i : i + 2] == "$$":
            in_dollar = not in_dollar
            buf += "$$"
            i += 2
            continue
        if not in_dollar and cleaned[i] == "'":
            if i + 1 < len(cleaned) and cleaned[i + 1] == "'":
                buf += "''"
                i += 2
                continue
            in_single = not in_single
            buf += "'"
            i += 1
            continue
        if not in_dollar and not in_single and cleaned[i] == ";":
            if buf.strip():
                stmts.append(buf.strip())
            buf = ""
            i += 1
            continue
        buf += cleaned[i]
        i += 1
    if buf.strip():
        stmts.append(buf.strip())
    return [s for s in stmts if s.strip()]


async def _apply_migrations():
    if MIGRATIONS_DIR is None:
        return
    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    for f in files:
        raw = f.read_text(encoding="utf-8")
        if not raw.strip():
            continue
        stmts = _split_sql(raw)
        if not stmts:
            continue
        async with engine.begin() as conn:
            for stmt in stmts:
                if not stmt.strip():
                    continue
                await conn.execute(text(stmt))

LOOKUPS = """
INSERT INTO user_statuses (code, label) VALUES ('active', 'Đang hoạt động')
ON CONFLICT (code) DO NOTHING;
INSERT INTO roles (code, label) VALUES
    ('admin', 'Quản trị viên'), ('teacher', 'Giáo viên'), ('student', 'Học sinh')
ON CONFLICT (code) DO NOTHING;
INSERT INTO genders (code, label) VALUES
    ('male', 'Nam'), ('female', 'Nữ'), ('other', 'Khác')
ON CONFLICT (code) DO NOTHING;
INSERT INTO course_statuses (code, label) VALUES
    ('draft', 'Bản nháp'), ('published', 'Đã xuất bản'), ('archived', 'Đã lưu trữ')
ON CONFLICT (code) DO NOTHING;
"""


def _db_available() -> bool:
    async def check():
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))

    try:
        asyncio.run(check())
        return True
    except Exception:
        return False


DB_AVAILABLE = _db_available()

requires_db = pytest.mark.skipif(
    not DB_AVAILABLE, reason="PostgreSQL chưa chạy (docker compose up -d postgres)"
)


async def _reset_db():
    async with SessionLocal() as session:
        try:
            await session.execute(text(TRUNCATE))
        except Exception as e:
            # Bảng mới (008) chưa có trên DB cũ / test DB vừa tạo bằng tay
            # → tự áp toàn bộ migrations rồi thử lại (idempotent)
            await session.rollback()
            msg = str(e).lower()
            if "does not exist" in msg or "undefinedtable" in msg or "slide_coverage" in msg or "lesson_mastery" in msg:
                await _apply_migrations()
                await session.execute(text(TRUNCATE))
            else:
                raise
        for stmt in LOOKUPS.strip().split(";"):
            if stmt.strip():
                await session.execute(text(stmt))
        await session.commit()


async def make_user(
    email: str,
    role: str,
    password: str = "Password123!",
    full_name: str = "Test User",
    code: str | None = None,
) -> str:
    async with SessionLocal() as session:
        await session.execute(
            text(
                """
                INSERT INTO users (email, password_hash, status_id)
                VALUES (:email, :hash, (SELECT id FROM user_statuses WHERE code = 'active'))
                ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash
                """
            ),
            {"email": email, "hash": hash_password(password)},
        )
        user_id = str(
            (
                await session.execute(
                    text("SELECT id FROM users WHERE email = :email"), {"email": email}
                )
            ).scalar_one()
        )
        await session.execute(
            text(
                """
                INSERT INTO user_roles (user_id, role_id)
                VALUES (:uid, (SELECT id FROM roles WHERE code = :role))
                ON CONFLICT DO NOTHING
                """
            ),
            {"uid": user_id, "role": role},
        )
        await session.execute(
            text(
                """
                INSERT INTO user_profiles (user_id, full_name, email)
                VALUES (:uid, :name, :email)
                ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name
                """
            ),
            {"uid": user_id, "name": full_name, "email": email},
        )
        if role == "teacher":
            await session.execute(
                text(
                    """
                    INSERT INTO teacher_profiles (user_id, teacher_code)
                    VALUES (:uid, :code)
                    ON CONFLICT (user_id) DO NOTHING
                    """
                ),
                {"uid": user_id, "code": code or f"GV-{user_id[:8]}"},
            )
        if role == "student":
            await session.execute(
                text(
                    """
                    INSERT INTO student_profiles (user_id, student_code)
                    VALUES (:uid, :code)
                    ON CONFLICT (user_id) DO NOTHING
                    """
                ),
                {"uid": user_id, "code": code or f"SV-{user_id[:8]}"},
            )
        await session.commit()
        return user_id


@pytest.fixture()
def client():
    if not DB_AVAILABLE:
        pytest.skip("PostgreSQL chưa chạy")
    asyncio.run(_reset_db())
    _BUCKETS.clear()
    with TestClient(app) as c:
        yield c


def login(client: TestClient, email: str, password: str = "Password123!") -> dict:
    r = client.post(
        "/api/auth/login", json={"email": email, "password": password}
    )
    assert r.status_code == 200, r.text
    return r.json()


def auth(data: dict) -> dict:
    return {"Authorization": f"Bearer {data['accessToken']}"}
