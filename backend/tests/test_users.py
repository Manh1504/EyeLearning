import asyncio

from tests.conftest import auth, login, make_user


def test_admin_profile_role(client):
    asyncio.run(make_user("admin-x@test.vn", "admin", full_name="Quản Trị"))
    data = login(client, "admin-x@test.vn")

    r = client.get("/api/me/profile", headers=auth(data))
    assert r.status_code == 200
    assert r.json()["role"] == "admin"
    assert r.json()["fullName"] == "Quản Trị"


def test_profile_invalid_gender_is_validation_error(client):
    asyncio.run(make_user("s-gender@test.vn", "student"))
    data = login(client, "s-gender@test.vn")

    r = client.patch(
        "/api/me/profile",
        headers=auth(data),
        json={"fullName": "Sinh Viên", "gender": "khong-hop-le"},
    )
    assert r.status_code == 422


def test_teacher_profile_updates_department(client):
    asyncio.run(make_user("t-dept@test.vn", "teacher", full_name="Giáo Viên"))
    data = login(client, "t-dept@test.vn")

    before = client.get("/api/me/profile", headers=auth(data)).json()
    assert before["role"] == "teacher"
    assert before["teacherCode"]

    r = client.patch(
        "/api/me/profile",
        headers=auth(data),
        json={"fullName": "Giáo Viên A", "department": "Khoa CNTT"},
    )
    assert r.status_code == 200
    assert r.json()["department"] == "Khoa CNTT"
    assert r.json()["fullName"] == "Giáo Viên A"


def test_profile_requires_auth(client):
    assert client.get("/api/me/profile").status_code == 401
