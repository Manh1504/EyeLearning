import asyncio
import base64

from tests.conftest import auth, login, make_user


def _setup_course(client):
    asyncio.run(make_user("gv@t.vn", "teacher", full_name="Giáo Viên"))
    asyncio.run(make_user("sv@t.vn", "student", full_name="Sinh Viên"))
    teacher = login(client, "gv@t.vn")
    student = login(client, "sv@t.vn")

    r = client.post(
        "/teacher/courses",
        headers=auth(teacher),
        json={"title": "Khóa Test", "description": "Mô tả", "status": "published"},
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


def test_course_gaze_dot_toggle(client):
    teacher, student, course_id, lesson_id, _ = _setup_course(client)

    # Cờ điểm nhìn là cấp KHÓA HỌC (không còn cờ từng bài học).
    r = client.get("/teacher/courses", headers=auth(teacher))
    course = r.json()[0]
    assert course["lessonCount"] == 1
    assert course["showGazeDot"] is False

    # Cây GV và outline của SV không còn field per-lesson.
    r = client.get(f"/teacher/courses/{course_id}", headers=auth(teacher))
    assert "showGazeDot" not in r.json()[0]["lessons"][0]

    r = client.get(f"/api/courses/{course_id}", headers=auth(student))
    outline = r.json()
    assert outline["showGazeDot"] is False
    assert "showGazeDot" not in outline["modules"][0]["lessons"][0]

    # Bật cấp khóa → áp cho cả khóa (bài giảng + bài tập).
    r = client.patch(
        f"/teacher/courses/{course_id}/gaze-dot",
        headers=auth(teacher),
        json={"showGazeDot": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["showGazeDot"] is True

    r = client.get("/teacher/courses", headers=auth(teacher))
    assert r.json()[0]["showGazeDot"] is True

    r = client.get(f"/api/courses/{course_id}", headers=auth(student))
    assert r.json()["showGazeDot"] is True

    # Đổi tên bài học không đụng tới cờ khóa.
    r = client.patch(
        f"/teacher/lessons/{lesson_id}",
        headers=auth(teacher),
        json={"title": "Bài 1 đổi tên"},
    )
    assert r.status_code == 200, r.text
    r = client.get("/teacher/courses", headers=auth(teacher))
    assert r.json()[0]["showGazeDot"] is True

    # Tắt cấp khóa.
    r = client.patch(
        f"/teacher/courses/{course_id}/gaze-dot",
        headers=auth(teacher),
        json={"showGazeDot": False},
    )
    assert r.status_code == 200, r.text
    r = client.get("/teacher/courses", headers=auth(teacher))
    assert r.json()[0]["showGazeDot"] is False

    # Có thể đặt ngay khi cập nhật khóa học (PATCH /teacher/courses/{id}).
    r = client.patch(
        f"/teacher/courses/{course_id}",
        headers=auth(teacher),
        json={"showGazeDot": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["showGazeDot"] is True


def _quiz_gaze_rows(session_id: str):
    """(danh sách (lesson_content_id, surface) của gaze_events, dòng gaze_session_stats)."""
    from sqlalchemy import text

    from app.db.session import SessionLocal

    async def run():
        async with SessionLocal() as session:
            events = (
                await session.execute(
                    text(
                        "SELECT lesson_content_id, surface FROM gaze_events "
                        "WHERE learning_session_id = :sid"
                    ),
                    {"sid": session_id},
                )
            ).all()
            stat = (
                await session.execute(
                    text(
                        "SELECT total_samples, on_screen_samples, view_ms "
                        "FROM gaze_session_stats WHERE learning_session_id = :sid"
                    ),
                    {"sid": session_id},
                )
            ).first()
            return events, stat

    return asyncio.run(run())


def test_quiz_gaze_samples_recorded(client):
    """Bài tập trắc nghiệm cũng ghi gaze (surface='quiz', toạ độ theo viewport)."""
    teacher, student, course_id, _, _ = _setup_course(client)

    r = client.get(f"/teacher/courses/{course_id}", headers=auth(teacher))
    module_id = r.json()[0]["id"]
    r = client.post(
        f"/teacher/modules/{module_id}/quizzes",
        headers=auth(teacher),
        json={"title": "Bài tập 1"},
    )
    assert r.status_code == 201, r.text
    quiz_lesson_id = r.json()["id"]

    r = client.post(f"/api/courses/{course_id}/enroll", headers=auth(student))
    assert r.status_code == 201, r.text
    enrollment_id = r.json()["enrollmentId"]

    # Trước 021 endpoint này trả 400 ("Bài tập trắc nghiệm không có phiên ...").
    r = client.post(
        "/api/learning-sessions",
        headers=auth(student),
        json={
            "enrollmentId": enrollment_id,
            "lessonId": quiz_lesson_id,
            "deviceFingerprint": "fp-quiz",
            "trackingConsent": True,
        },
    )
    assert r.status_code == 201, r.text
    session = r.json()

    samples = [
        {"lessonContentId": None, "x": 0.3 + i * 0.01, "y": 0.4, "ts": 1755000000000 + i * 300}
        for i in range(10)
    ] + [{"lessonContentId": None, "x": -1, "y": -1, "ts": 1755000004000}]
    r = client.post(
        f"/api/lessons/{quiz_lesson_id}/gaze-samples",
        headers=auth(student),
        json={"learningSessionId": session["id"], "samples": samples},
    )
    assert r.status_code == 200, r.text
    assert r.json()["inserted"] >= 2

    events, stat = _quiz_gaze_rows(session["id"])
    assert events, "phải có gaze_events cho phiên bài tập"
    assert all(content_id is None for content_id, _ in events)
    assert all(surface == "quiz" for _, surface in events)
    assert stat is not None, "phải có tổng hợp gaze_session_stats"
    assert stat[0] == len(samples)          # total_samples (gồm cả điểm ngoài màn hình)
    assert stat[1] == 10                    # on_screen_samples
    assert stat[2] > 0                      # view_ms

    # Gửi thêm batch → cộng dồn chứ không tạo dòng mới.
    r = client.post(
        f"/api/lessons/{quiz_lesson_id}/gaze-samples",
        headers=auth(student),
        json={
            "learningSessionId": session["id"],
            "samples": [
                {"lessonContentId": None, "x": 0.5, "y": 0.5, "ts": 1755000009000},
            ],
        },
    )
    assert r.status_code == 200, r.text
    _, stat2 = _quiz_gaze_rows(session["id"])
    assert stat2 is not None
    assert stat2[0] == len(samples) + 1


def _calibration_row_counts(email: str) -> tuple[int, int]:
    """Số dòng (calibration_params, calibration_sessions) của 1 user."""
    from sqlalchemy import text

    from app.db.session import SessionLocal

    async def run() -> tuple[int, int]:
        async with SessionLocal() as session:
            params = (
                await session.execute(
                    text(
                        "SELECT count(*) FROM calibration_params cp "
                        "JOIN users u ON u.id = cp.user_id WHERE u.email = :e"
                    ),
                    {"e": email},
                )
            ).scalar_one()
            sessions = (
                await session.execute(
                    text(
                        "SELECT count(*) FROM calibration_sessions cs "
                        "JOIN users u ON u.id = cs.user_id WHERE u.email = :e"
                    ),
                    {"e": email},
                )
            ).scalar_one()
            return int(params), int(sessions)

    return asyncio.run(run())


def test_calibration_flow(client):
    asyncio.run(make_user("sv2@t.vn", "student"))
    student = login(client, "sv2@t.vn")

    model_v1 = base64.b64encode(b"model-ubj-v1").decode()
    model_v2 = base64.b64encode(b"model-ubj-v2").decode()

    def post_model(model_b64: str, mae: float = 0.02):
        return client.post(
            "/api/calibrations",
            headers=auth(student),
            json={
                "deviceFingerprint": "fp-1",
                "numPoints": 16,
                "modelUbjBase64": model_b64,
                "maePx": mae,
                "screenWidthPx": 1920,
                "screenHeightPx": 1080,
            },
        )

    def active_model():
        return client.get(
            "/api/calibrations/active/model",
            headers=auth(student),
            params={"deviceFingerprint": "fp-1"},
        )

    r = post_model(model_v1)
    assert r.status_code == 201, r.text
    assert r.json()["numPoints"] == 16
    assert abs(r.json()["maePx"] - 0.02) < 1e-6

    r = client.get(
        "/api/calibrations/active",
        headers=auth(student),
        params={"deviceFingerprint": "fp-1"},
    )
    assert r.status_code == 200
    assert r.json()["calibrated"] is True

    r = active_model()
    assert r.status_code == 200
    assert r.json()["modelUbjBase64"] == model_v1

    # Bộ mới GHI ĐÈ bộ cũ tại chỗ (không thêm dòng, không giữ lịch sử)
    r = post_model(model_v2, mae=0.01)
    assert r.status_code == 201, r.text
    r = active_model()
    assert r.json()["modelUbjBase64"] == model_v2
    assert _calibration_row_counts("sv2@t.vn") == (1, 1)

    # Thiết bị khác → bản ghi riêng, vẫn đúng 1 dòng / thiết bị
    r = client.post(
        "/api/calibrations",
        headers=auth(student),
        json={
            "deviceFingerprint": "fp-2",
            "numPoints": 16,
            "modelUbjBase64": model_v1,
            "maePx": 0.03,
            "screenWidthPx": 1366,
            "screenHeightPx": 768,
        },
    )
    assert r.status_code == 201, r.text
    assert _calibration_row_counts("sv2@t.vn") == (2, 2)

    # base64 hỏng -> 422
    r = post_model("!!!khong-phai-base64!!!")
    assert r.status_code == 422, r.text

    # thiếu model -> 422 (validation)
    r = client.post(
        "/api/calibrations",
        headers=auth(student),
        json={"deviceFingerprint": "fp-1", "numPoints": 16},
    )
    assert r.status_code == 422

    # model vẫn là bộ v2 sau các request lỗi, không sinh thêm dòng
    assert active_model().json()["modelUbjBase64"] == model_v2
    assert _calibration_row_counts("sv2@t.vn") == (2, 2)

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
    from app.core.config import settings

    lesson_dir = settings.media_path / "lessons" / lesson_id
    assert lesson_dir.exists()
    r = client.delete(f"/teacher/lessons/{lesson_id}", headers=auth(teacher))
    assert r.status_code == 200
    assert not lesson_dir.exists()
