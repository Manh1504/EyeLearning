import asyncio

from tests.conftest import auth, login, make_user


def _setup(client):
    asyncio.run(make_user("an-teacher@test.vn", "teacher"))
    asyncio.run(make_user("an-student@test.vn", "student"))
    teacher = login(client, "an-teacher@test.vn")
    student = login(client, "an-student@test.vn")
    course = client.post(
        "/teacher/courses",
        headers=auth(teacher),
        json={"title": "Analytics course", "status": "published"},
    ).json()
    module = client.post(
        f"/teacher/courses/{course['id']}/modules",
        headers=auth(teacher),
        json={"title": "M"},
    ).json()
    lesson = client.post(
        f"/teacher/modules/{module['id']}/lessons",
        headers=auth(teacher),
        json={"title": "L"},
    ).json()
    return teacher, student, course["id"], lesson["id"]


def test_heatmap_requires_teacher_role(client):
    teacher, student, _, lesson_id = _setup(client)

    assert (
        client.get(f"/teacher/lessons/{lesson_id}/heatmap", headers=auth(student)).status_code
        == 403
    )

    ok = client.get(f"/teacher/lessons/{lesson_id}/heatmap", headers=auth(teacher))
    assert ok.status_code == 200
    assert ok.json() == []


def test_mastery_requires_owner(client):
    teacher, _, _, lesson_id = _setup(client)
    asyncio.run(make_user("an-outsider@test.vn", "teacher"))
    outsider = login(client, "an-outsider@test.vn")
    unknown_student = "00000000-0000-0000-0000-000000000000"

    # Giáo viên không sở hữu/không được phân công -> 403.
    assert (
        client.get(
            f"/teacher/lessons/{lesson_id}/mastery?student_id={unknown_student}",
            headers=auth(outsider),
        ).status_code
        == 403
    )
    # Chủ bài học qua được kiểm tra quyền, nhưng học viên chưa đăng ký -> 404.
    assert (
        client.get(
            f"/teacher/lessons/{lesson_id}/mastery?student_id={unknown_student}",
            headers=auth(teacher),
        ).status_code
        == 404
    )


def test_recompute_course_analytics(client):
    teacher, _, course_id, _ = _setup(client)

    r = client.post(f"/teacher/courses/{course_id}/recompute", headers=auth(teacher))
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["aggregates"] == 0


def test_recompute_requires_ownership(client):
    _, _, course_id, _ = _setup(client)
    asyncio.run(make_user("an-outsider2@test.vn", "teacher"))
    outsider = login(client, "an-outsider2@test.vn")

    r = client.post(f"/teacher/courses/{course_id}/recompute", headers=auth(outsider))
    assert r.status_code == 403
