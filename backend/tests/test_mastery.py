import asyncio

from tests.conftest import auth, login, make_user


def _make_pdf_bytes(pages: int = 2) -> bytes:
    import pymupdf

    doc = pymupdf.open()
    for i in range(pages):
        page = doc.new_page(width=400, height=300)
        page.insert_text((72, 150), f"Slide {i + 1}", fontsize=28)
    return doc.tobytes()


def _setup_pdf_course(client):
    asyncio.run(make_user("gv-m@t.vn", "teacher", full_name="GV Mastery"))
    asyncio.run(make_user("sv-m@t.vn", "student", full_name="SV Mastery"))
    teacher = login(client, "gv-m@t.vn")
    student = login(client, "sv-m@t.vn")

    course_id = client.post(
        "/teacher/courses",
        headers=auth(teacher),
        json={"title": "Khóa Mastery", "level": "beginner", "status": "published"},
    ).json()["id"]
    module_id = client.post(
        f"/teacher/courses/{course_id}/modules",
        headers=auth(teacher),
        json={"title": "Chương 1"},
    ).json()["id"]
    lesson_id = client.post(
        f"/teacher/modules/{module_id}/lessons",
        headers=auth(teacher),
        json={"title": "Bài 1"},
    ).json()["id"]
    r = client.post(
        f"/teacher/lessons/{lesson_id}/slides/upload",
        headers=auth(teacher),
        files={"pdf": ("bai.pdf", _make_pdf_bytes(2), "application/pdf")},
    )
    assert r.status_code == 201, r.text
    return teacher, student, course_id, lesson_id


def test_slide_key_toggle_and_list(client):
    teacher, _, _, lesson_id = _setup_pdf_course(client)

    r = client.get(f"/teacher/lessons/{lesson_id}/slides", headers=auth(teacher))
    assert r.status_code == 200, r.text
    slides = r.json()
    assert len(slides) == 2
    assert all(s["isKey"] is False for s in slides)
    assert slides[0]["aoiCount"] > 0

    r = client.post(
        f"/teacher/lessons/{lesson_id}/slides/key",
        headers=auth(teacher),
        json={"orderIndexes": [1]},
    )
    assert r.status_code == 200, r.text

    r = client.get(f"/teacher/lessons/{lesson_id}/slides", headers=auth(teacher))
    keyed = {s["orderIndex"]: s["isKey"] for s in r.json()}
    assert keyed[1] is True and keyed[2] is False


def test_mastery_endpoint(client):
    teacher, student, course_id, lesson_id = _setup_pdf_course(client)

    client.post(f"/api/courses/{course_id}/enroll", headers=auth(student))
    r = client.get(f"/teacher/courses/{course_id}/students", headers=auth(teacher))
    student_id = r.json()[0]["id"]

    r = client.get(f"/api/lessons/{lesson_id}/contents", headers=auth(student))
    slide_ids = [s["id"] for s in r.json()]

    enrollment = client.get("/api/me/enrollments", headers=auth(student)).json()[0]
    r = client.post(
        "/api/learning-sessions",
        headers=auth(student),
        json={
            "enrollmentId": enrollment["enrollmentId"],
            "lessonId": lesson_id,
            "deviceFingerprint": "fp-m",
            "trackingConsent": True,
        },
    )
    session = r.json()

    samples = [
        {"lessonContentId": slide_ids[0], "x": 0.3, "y": 0.5, "ts": 1755000000000 + i * 300}
        for i in range(15)
    ]
    r = client.post(
        f"/api/lessons/{lesson_id}/gaze-samples",
        headers=auth(student),
        json={"learningSessionId": session["id"], "samples": samples},
    )
    assert r.status_code == 200, r.text

    r = client.get(
        f"/teacher/lessons/{lesson_id}/mastery",
        headers=auth(teacher),
        params={"studentId": student_id},
    )
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["keyTotal"] == 1
    assert data["slidesTotal"] == 2
    assert data["slides"][0]["dwellMs"] > 0
    assert data["slides"][0]["aoiCount"] > 0

    r = client.get(f"/teacher/courses/{course_id}/students", headers=auth(teacher))
    lesson = r.json()[0]["lessons"][0]
    assert lesson["mastery"] is not None
    assert lesson["keyTotal"] == 1