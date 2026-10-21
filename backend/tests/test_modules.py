import asyncio

from tests.conftest import auth, login, make_user


def _setup(client):
    asyncio.run(make_user("mod-teacher@test.vn", "teacher"))
    asyncio.run(make_user("mod-other@test.vn", "teacher"))
    teacher = login(client, "mod-teacher@test.vn")
    other = login(client, "mod-other@test.vn")
    course = client.post(
        "/teacher/courses",
        headers=auth(teacher),
        json={"title": "Module course", "status": "draft"},
    ).json()
    return teacher, other, course["id"]


def test_module_crud_and_tree(client):
    teacher, _, course_id = _setup(client)

    created = client.post(
        f"/teacher/courses/{course_id}/modules",
        headers=auth(teacher),
        json={"title": "Chương 1"},
    )
    assert created.status_code == 201, created.text
    module_id = created.json()["id"]
    assert created.json()["title"] == "Chương 1"
    assert created.json()["orderIndex"] == 1

    tree = client.get(f"/teacher/courses/{course_id}", headers=auth(teacher))
    assert tree.status_code == 200
    assert [m["id"] for m in tree.json()] == [module_id]

    renamed = client.patch(
        f"/teacher/modules/{module_id}",
        headers=auth(teacher),
        json={"title": "Chương 1 (sửa)"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Chương 1 (sửa)"

    deleted = client.delete(f"/teacher/modules/{module_id}", headers=auth(teacher))
    assert deleted.status_code == 200
    assert client.get(f"/teacher/courses/{course_id}", headers=auth(teacher)).json() == []


def test_module_requires_ownership(client):
    _, other, course_id = _setup(client)

    r = client.post(
        f"/teacher/courses/{course_id}/modules",
        headers=auth(other),
        json={"title": "Không được phép"},
    )
    assert r.status_code == 403


def test_module_not_found(client):
    teacher, _, _ = _setup(client)
    r = client.patch(
        "/teacher/modules/00000000-0000-0000-0000-000000000000",
        headers=auth(teacher),
        json={"title": "x"},
    )
    assert r.status_code == 404
