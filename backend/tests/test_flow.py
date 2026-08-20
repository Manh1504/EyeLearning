import asyncio

from tests.conftest import auth, login, make_user


def _setup_course(client):
    asyncio.run(make_user("gv@t.vn", "teacher", full_name="Giáo Viên"))
    asyncio.run(make_user("sv@t.vn", "student", full_name="Sinh Viên"))
    teacher = login(client, "gv@t.vn")
    student = login(client, "sv@t.vn")

    r = client.post(
        "/teacher/courses",
        headers=auth(teacher),
        json={"title": "Khóa Test", "description": "Mô tả", "level": "beginner", "status": "published"},
    )
    assert r.status_code == 201, r.text
    course_id = r.json()["id"]

    r = client.post(
        f"/teacher/courses/{course_id}/modules",
        headers=auth(teacher),
        json={"title": "Chương 1"},
    )
    assert r.status_code == 201, r.text
    module_id = r.json()["id"]

    r = client.post(
        f"/teacher/modules/{module_id}/lessons",
        headers=auth(teacher),
        json={"title": "Bài 1"},
    )
    assert r.status_code == 201, r.text
    lesson_id = r.json()["id"]

    slide_ids = []
    for i in range(3):
        r = client.post(
            f"/teacher/lessons/{lesson_id}/slides",
            headers=auth(teacher),
            json={"imageUrl": f"http://img/slide{i}.png", "title": f"Slide {i + 1}"},
        )
        assert r.status_code == 201, r.text
        slide_ids.append(r.json()["id"])

    return teacher, student, course_id, lesson_id, slide_ids


def test_full_learning_flow(client):
    teacher, student, course_id, lesson_id, slide_ids = _setup_course(client)

    r = client.get("/teacher/courses", headers=auth(teacher))
    assert r.status_code == 200
    courses = r.json()
    assert len(courses) == 1
    assert courses[0]["students"] == 0

    r = client.post(f"/api/courses/{course_id}/enroll", headers=auth(student))
    assert r.status_code == 201, r.text
    enrollment_id = r.json()["enrollmentId"]

    r = client.post(f"/api/courses/{course_id}/enroll", headers=auth(student))
    assert r.status_code == 409

    r = client.get("/api/me/enrollments", headers=auth(student))
    assert r.status_code == 200
    enrollments = r.json()
    assert len(enrollments) == 1
    assert enrollments[0]["course"]["teacherName"] == "Giáo Viên"
    assert enrollments[0]["course"]["lessonCount"] == 1

    r = client.get(
        f"/api/courses/{course_id}", headers=auth(student), params={"include": "modules.lessons"}
    )
    assert r.status_code == 200
    outline = r.json()
    assert outline["modules"][0]["lessons"][0]["slideCount"] == 3

    r = client.get(f"/api/lessons/{lesson_id}/contents", headers=auth(student))
    assert r.status_code == 200
    slides = r.json()
    assert len(slides) == 3
    assert slides[0]["title"] == "Slide 1"

    r = client.post(
        "/api/learning-sessions",
        headers=auth(student),
        json={
            "enrollmentId": enrollment_id,
            "lessonId": lesson_id,
            "deviceFingerprint": "fp-test",
            "trackingConsent": True,
        },
    )
    assert r.status_code == 201, r.text
    session = r.json()

    samples = [
        {"lessonContentId": slide_ids[0], "x": 0.3 + i * 0.01, "y": 0.4, "ts": 1755000000000 + i * 300}
        for i in range(10)
    ] + [
        {"lessonContentId": slide_ids[1], "x": 1.5, "y": 0.5, "ts": 1755000003000},
    ]
    r = client.post(
        f"/api/lessons/{lesson_id}/gaze-samples",
        headers=auth(student),
        json={"learningSessionId": session["id"], "samples": samples},
    )
    assert r.status_code == 200, r.text
    assert r.json()["ok"] is True
    assert r.json()["inserted"] >= 2

    r = client.patch(
        f"/api/lessons/{lesson_id}/progress",
        headers=auth(student),
        json={"lastSlide": 0},
    )
    assert r.status_code == 200

    r = client.patch(
        f"/api/learning-sessions/{session['id']}",
        headers=auth(student),
        json={"status": "completed"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "completed"

    r = client.get("/api/me/stats", headers=auth(student))
    assert r.status_code == 200
    assert r.json()["weekStudyMinutes"] >= 0

    r = client.get(f"/teacher/lessons/{lesson_id}/heatmap", headers=auth(teacher))
    assert r.status_code == 200, r.text
    stats = r.json()
    assert len(stats) == 3
    assert stats[0]["viewSec"] >= 0

    r = client.post(f"/teacher/courses/{course_id}/recompute", headers=auth(teacher))
    assert r.status_code == 200, r.text

    r = client.get("/teacher/courses", headers=auth(teacher))
    assert r.json()[0]["students"] == 1

    r = client.get(f"/teacher/courses/{course_id}/students", headers=auth(teacher))
    assert r.status_code == 200
    rows = r.json()
    assert len(rows) == 1
    assert rows[0]["name"] == "Sinh Viên"
    assert len(rows[0]["lessons"]) == 1


def test_calibration_flow(client):
    asyncio.run(make_user("sv2@t.vn", "student"))
    student = login(client, "sv2@t.vn")

    params_v1 = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]
    params_v2 = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7]

    def post_params(version: str, params: list[float]):
        return client.post(
            "/api/calibrations",
            headers=auth(student),
            json={
                "deviceFingerprint": "fp-1",
                "numPoints": 16,
                "params": params,
                "mappingModelVersion": version,
            },
        )

    r = post_params("v1", params_v1)
    assert r.status_code == 201, r.text
    assert r.json()["mappingModelVersion"] == "v1"

    r = client.get(
        "/api/calibrations/active",
        headers=auth(student),
        params={"deviceFingerprint": "fp-1"},
    )
    assert r.status_code == 200
    assert r.json()["calibrated"] is True
    assert r.json()["mappingModelVersion"] == "v1"

    r = client.get(
        "/api/calibrations/active/params",
        headers=auth(student),
        params={"deviceFingerprint": "fp-1"},
    )
    assert r.status_code == 200
    assert r.json()["params"] == params_v1

    r = post_params("v2", params_v2)
    assert r.status_code == 201

    r = client.get(
        "/api/calibrations/active",
        headers=auth(student),
        params={"deviceFingerprint": "fp-1"},
    )
    assert r.json()["mappingModelVersion"] == "v2"

    r = client.get(
        "/api/calibrations/active/params",
        headers=auth(student),
        params={"deviceFingerprint": "fp-1"},
    )
    assert r.json()["params"] == params_v2

    r = client.post(
        "/api/calibrations",
        headers=auth(student),
        json={
            "deviceFingerprint": "fp-1",
            "numPoints": 16,
            "params": [0.1, 0.2],
        },
    )
    assert r.status_code == 422

    r = client.get(
        "/api/calibrations/active",
        headers=auth(student),
        params={"deviceFingerprint": "fp-khac"},
    )
    assert r.status_code == 404


def test_rbac_student_cannot_create_course(client):
    asyncio.run(make_user("sv3@t.vn", "student"))
    student = login(client, "sv3@t.vn")
    r = client.post(
        "/teacher/courses", headers=auth(student), json={"title": "X"}
    )
    assert r.status_code == 403


def test_teacher_cannot_touch_foreign_course(client):
    asyncio.run(make_user("gv1@t.vn", "teacher"))
    asyncio.run(make_user("gv2@t.vn", "teacher"))
    gv1 = login(client, "gv1@t.vn")
    gv2 = login(client, "gv2@t.vn")

    r = client.post(
        "/teacher/courses", headers=auth(gv1), json={"title": "Khóa của GV1"}
    )
    course_id = r.json()["id"]

    r = client.get(f"/teacher/courses/{course_id}", headers=auth(gv2))
    assert r.status_code == 403
    r = client.patch(
        f"/teacher/courses/{course_id}", headers=auth(gv2), json={"title": "Hack"}
    )
    assert r.status_code == 403


def _make_pdf_bytes(pages: int = 3) -> bytes:
    import pymupdf

    doc = pymupdf.open()
    for i in range(pages):
        page = doc.new_page(width=400, height=300)
        page.insert_text((72, 150), f"Slide {i + 1}", fontsize=28)
    return doc.tobytes()


def test_teacher_upload_pdf_slides(client):
    teacher, _, course_id, lesson_id, _ = _setup_course(client)

    r = client.post(
        f"/teacher/lessons/{lesson_id}/slides/upload",
        headers=auth(teacher),
        files={"pdf": ("bai01.pdf", _make_pdf_bytes(3), "application/pdf")},
    )
    assert r.status_code == 201, r.text
    assert r.json()["slides"] == 3

    # Sinh viên xem nội dung: 3 slide, image_url trỏ vào /media.
    asyncio.run(make_user("sv-upload@t.vn", "student"))
    student = login(client, "sv-upload@t.vn")
    client.post(f"/api/courses/{course_id}/enroll", headers=auth(student))
    r = client.get(f"/api/lessons/{lesson_id}/contents", headers=auth(student))
    assert r.status_code == 200, r.text
    slides = r.json()
    assert len(slides) == 3
    assert slides[0]["imageUrl"].startswith("/media/lessons/")

    # Upload lại PDF khác thay thế: 2 slide.
    r = client.post(
        f"/teacher/lessons/{lesson_id}/slides/upload",
        headers=auth(teacher),
        files={"pdf": ("bai01-v2.pdf", _make_pdf_bytes(2), "application/pdf")},
    )
    assert r.status_code == 201
    r = client.get(f"/api/lessons/{lesson_id}/contents", headers=auth(student))
    assert len(r.json()) == 2

    # File không đúng PDF → 400.
    r = client.post(
        f"/teacher/lessons/{lesson_id}/slides/upload",
        headers=auth(teacher),
        files={"pdf": ("fake.pdf", b"not a pdf", "application/pdf")},
    )
    assert r.status_code == 400

    # Xóa bài → file media được dọn.
    from pathlib import Path
    from app.core.config import settings

    lesson_dir = settings.media_path / "lessons" / lesson_id
    assert lesson_dir.exists()
    r = client.delete(f"/teacher/lessons/{lesson_id}", headers=auth(teacher))
    assert r.status_code == 200
    assert not lesson_dir.exists()
