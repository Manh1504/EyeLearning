from tests.conftest import auth, login, make_user


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_login_success(client):
    import asyncio

    asyncio.run(make_user("teacher@test.vn", "teacher", full_name="GV Test"))
    response = client.post(
        "/api/auth/login",
        json={"email": "teacher@test.vn", "password": "Password123!"},
    )
    assert response.status_code == 200
    assert "app;dur=" in response.headers["server-timing"]
    assert "password;dur=" in response.headers["server-timing"]
    assert response.headers["x-request-id"]
    data = response.json()
    assert data["accessToken"]
    assert data["refreshToken"]
    assert data["user"]["email"] == "teacher@test.vn"
    assert "teacher" in data["user"]["roles"]


def test_login_wrong_password(client):
    import asyncio

    asyncio.run(make_user("t2@test.vn", "teacher"))
    r = client.post(
        "/api/auth/login", json={"email": "t2@test.vn", "password": "sai-pass"}
    )
    assert r.status_code == 401


def test_refresh_and_logout(client):
    import asyncio

    asyncio.run(make_user("t3@test.vn", "teacher"))
    data = login(client, "t3@test.vn")

    r = client.post("/api/auth/refresh", json={"refreshToken": data["refreshToken"]})
    assert r.status_code == 200
    new_data = r.json()
    assert new_data["accessToken"] != data["accessToken"]

    r = client.post(
        "/api/auth/refresh", json={"refreshToken": data["refreshToken"]}
    )
    assert r.status_code == 401

    r = client.post("/api/auth/logout", json={"refreshToken": new_data["refreshToken"]})
    assert r.status_code == 200
    r = client.post(
        "/api/auth/refresh", json={"refreshToken": new_data["refreshToken"]}
    )
    assert r.status_code == 401


def test_me_profile_requires_auth(client):
    assert client.get("/api/me/profile").status_code == 401


def test_me_profile_get_and_update(client):
    import asyncio

    asyncio.run(make_user("s1@test.vn", "student", full_name="Sinh Viên A"))
    data = login(client, "s1@test.vn")

    r = client.get("/api/me/profile", headers=auth(data))
    assert r.status_code == 200
    profile = r.json()
    assert profile["role"] == "student"
    assert profile["fullName"] == "Sinh Viên A"
    assert profile["studentCode"]

    r = client.patch(
        "/api/me/profile",
        headers=auth(data),
        json={"fullName": "Sinh Viên B", "gender": "male", "program": "CNTT K20"},
    )
    assert r.status_code == 200
    assert r.json()["fullName"] == "Sinh Viên B"
    assert r.json()["program"] == "CNTT K20"


def _force_password_change(email: str) -> None:
    import asyncio

    from sqlalchemy import text

    from app.db.session import SessionLocal

    async def run():
        async with SessionLocal() as session:
            await session.execute(
                text("UPDATE users SET must_change_password = true WHERE email = :e"),
                {"e": email},
            )
            await session.commit()

    asyncio.run(run())


def test_must_change_password_flow(client):
    import asyncio

    asyncio.run(make_user("pw@test.vn", "student", full_name="Đổi Mật Khẩu"))
    _force_password_change("pw@test.vn")

    data = login(client, "pw@test.vn")
    assert data["user"]["mustChangePassword"] is True

    # Các endpoint thường bị chặn cho tới khi đổi mật khẩu.
    blocked = client.get("/api/me/profile", headers=auth(data))
    assert blocked.status_code == 403
    assert blocked.json()["detail"] == "PASSWORD_CHANGE_REQUIRED"

    # Sai mật khẩu hiện tại -> 400.
    bad = client.post(
        "/api/auth/change-password",
        headers=auth(data),
        json={"currentPassword": "sai-hoan-toan", "newPassword": "MatKhauMoi123"},
    )
    assert bad.status_code == 400

    # Mật khẩu mới trùng mật khẩu hiện tại -> 422 (schema từ chối).
    same = client.post(
        "/api/auth/change-password",
        headers=auth(data),
        json={"currentPassword": "Password123!", "newPassword": "Password123!"},
    )
    assert same.status_code == 422

    ok = client.post(
        "/api/auth/change-password",
        headers=auth(data),
        json={"currentPassword": "Password123!", "newPassword": "MatKhauMoi123"},
    )
    assert ok.status_code == 200, ok.text

    # Đổi xong thì dùng được API thường.
    assert client.get("/api/me/profile", headers=auth(data)).status_code == 200

    # Mật khẩu cũ hết hiệu lực; mật khẩu mới đăng nhập được và cờ đã tắt.
    assert (
        client.post(
            "/api/auth/login",
            json={"email": "pw@test.vn", "password": "Password123!"},
        ).status_code
        == 401
    )
    fresh = client.post(
        "/api/auth/login",
        json={"email": "pw@test.vn", "password": "MatKhauMoi123"},
    )
    assert fresh.status_code == 200
    assert fresh.json()["user"]["mustChangePassword"] is False
