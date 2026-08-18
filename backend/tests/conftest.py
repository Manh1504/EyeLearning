import asyncio
import os

os.environ["TESTING"] = "1"
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:5435/eyetracking_test",
)

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.security import hash_password
from app.db.session import SessionLocal, engine
from app.main import app

TRUNCATE = """
TRUNCATE TABLE users, courses, enrollments, devices, calibration_sessions,
calibration_params, learning_sessions, gaze_events, gaze_slide_stats,
heatmap_aggregates, aoi_regions, aoi_dwell_stats, engagement_scores,
auth_sessions CASCADE
"""

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
        await session.execute(text(TRUNCATE))
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
