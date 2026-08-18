from tests.conftest import auth, login, make_user


def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_login_success(client):
    import asyncio

    asyncio.run(make_user("teacher@test.vn", "teacher", full_name="GV Test"))
    data = login(client, "teacher@test.vn")
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
