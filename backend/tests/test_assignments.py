import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import text

from app.db.session import SessionLocal
from tests.conftest import auth, login, make_user


def _setup(client):
    asyncio.run(make_user("quiz-teacher@test.vn", "teacher"))
    asyncio.run(make_user("quiz-student@test.vn", "student"))
    asyncio.run(make_user("outsider@test.vn", "student"))
    teacher = login(client, "quiz-teacher@test.vn")
    student = login(client, "quiz-student@test.vn")
    outsider = login(client, "outsider@test.vn")
    course = client.post(
        "/teacher/courses",
        headers=auth(teacher),
        json={"title": "Quiz course", "status": "published"},
    ).json()
    module = client.post(
        f"/teacher/courses/{course['id']}/modules",
        headers=auth(teacher),
        json={"title": "Module"},
    ).json()
    lesson = client.post(
        f"/teacher/modules/{module['id']}/lessons",
        headers=auth(teacher),
        json={"title": "Lesson"},
    ).json()
    enroll = client.post(f"/api/courses/{course['id']}/enroll", headers=auth(student))
    assert enroll.status_code == 201, enroll.text
    return teacher, student, outsider, course["id"], module["id"], lesson["id"]


def _assignment_body(course_id, lesson_id, due_at=None, allow_retry=False):
    return {
        "courseId": course_id,
        "lessonId": lesson_id,
        "title": "Bài kiểm tra",
        "instructions": "Chọn đáp án đúng",
        "dueAt": (due_at or datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "durationMinutes": 15,
        "status": "published",
        "allowRetry": allow_retry,
        "questions": [
            {
                "id": "q1",
                "prompt": "2 + 2 bằng bao nhiêu?",
                "options": [{"id": "a", "text": "3"}, {"id": "b", "text": "4"}],
                "correctOptionIds": ["b"],
                "explanation": "Hai cộng hai bằng bốn.",
                "points": 2,
            }
        ],
    }


def _create_quiz_item(client, teacher, module_id, title="Bài tập", duration=15):
    return client.post(
        f"/teacher/modules/{module_id}/quizzes",
        headers=auth(teacher),
        json={"title": title, "durationMinutes": duration},
    )


def _submit(client, student, assignment_id, answers=None):
    return client.post(
        f"/api/assignments/{assignment_id}/attempts",
        headers=auth(student),
        json={"answers": answers or {"q1": ["b"]}},
    )


async def _expire_session(assignment_id: str):
    async with SessionLocal() as session:
        await session.execute(
            text(
                "UPDATE quiz_attempt_sessions "
                "SET started_at = now() - interval '2 hours' "
                "WHERE assignment_id = :assignment_id"
            ),
            {"assignment_id": assignment_id},
        )
        await session.commit()


def test_assignment_scoring_and_answer_visibility(client):
    teacher, student, outsider, course_id, module_id, lesson_id = _setup(client)
    created = client.post(
        "/api/assignments",
        headers=auth(teacher),
        json=_assignment_body(course_id, lesson_id),
    )
    assert created.status_code == 201, created.text
    assignment_id = created.json()["id"]
    assert created.json()["questions"][0]["correctOptionIds"] == ["b"]

    before_submit = client.get(f"/api/assignments/{assignment_id}", headers=auth(student))
    assert before_submit.status_code == 200
    assert before_submit.json()["questions"][0]["correctOptionIds"] == []
    assert before_submit.json()["questions"][0]["explanation"] == ""
    assert before_submit.json()["expiresAt"] is not None

    forbidden = client.get(f"/api/assignments/{assignment_id}", headers=auth(outsider))
    assert forbidden.status_code == 403

    submitted = client.post(
        f"/api/assignments/{assignment_id}/attempts",
        headers=auth(student),
        json={"answers": {"q1": ["b"], "unknown": ["forged"]}},
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["score"] == 2
    assert submitted.json()["maxScore"] == 2
    assert submitted.json()["answers"] == {"q1": ["b"]}

    review = client.get(f"/api/assignments/{assignment_id}", headers=auth(student))
    assert review.json()["questions"][0]["correctOptionIds"] == ["b"]
    duplicate = client.post(
        f"/api/assignments/{assignment_id}/attempts",
        headers=auth(student),
        json={"answers": {}},
    )
    assert duplicate.status_code == 409


def test_rejects_late_submission(client):
    teacher, student, _, course_id, module_id, lesson_id = _setup(client)
    created = client.post(
        "/api/assignments",
        headers=auth(teacher),
        json=_assignment_body(course_id, lesson_id, datetime.now(timezone.utc) - timedelta(minutes=1)),
    )
    assignment_id = created.json()["id"]
    submitted = client.post(
        f"/api/assignments/{assignment_id}/attempts",
        headers=auth(student),
        json={"answers": {"q1": ["b"]}},
    )
    assert submitted.status_code == 409


def test_rejects_submission_after_duration(client):
    teacher, student, _, course_id, module_id, lesson_id = _setup(client)
    body = _assignment_body(course_id, lesson_id)
    body["durationMinutes"] = 1
    created = client.post("/api/assignments", headers=auth(teacher), json=body)
    assignment_id = created.json()["id"]
    started = client.get(f"/api/assignments/{assignment_id}", headers=auth(student))
    assert started.status_code == 200
    asyncio.run(_expire_session(assignment_id))

    submitted = client.post(
        f"/api/assignments/{assignment_id}/attempts",
        headers=auth(student),
        json={"answers": {"q1": ["b"]}},
    )
    assert submitted.status_code == 409
    assert submitted.json()["detail"] == "Đã hết thời gian làm bài"


def test_quiz_item_in_module_and_reorder(client):
    teacher, _, _, course_id, module_id, lesson_id = _setup(client)
    created = _create_quiz_item(client, teacher, module_id, title="Trắc nghiệm 1")
    assert created.status_code == 201, created.text
    item = created.json()
    assert item["kind"] == "quiz"
    assert item["quizId"]
    assert item["quizStatus"] == "draft"
    assert item["questionCount"] == 0

    tree = client.get(f"/teacher/courses/{course_id}", headers=auth(teacher)).json()
    kinds = [node["kind"] for node in tree[0]["lessons"]]
    assert kinds == ["lesson", "quiz"]

    # Đưa bài tập lên trước bài học.
    reorder = client.post(
        f"/teacher/modules/{module_id}/items/reorder",
        headers=auth(teacher),
        json={
            "items": [
                {"kind": "quiz", "id": item["id"]},
                {"kind": "lesson", "id": lesson_id},
            ]
        },
    )
    assert reorder.status_code == 200, reorder.text
    tree = client.get(f"/teacher/courses/{course_id}", headers=auth(teacher)).json()
    assert [node["kind"] for node in tree[0]["lessons"]] == ["quiz", "lesson"]

    # Danh sách không khớp cấu trúc chương bị từ chối.
    bad = client.post(
        f"/teacher/modules/{module_id}/items/reorder",
        headers=auth(teacher),
        json={"items": [{"kind": "quiz", "id": item["id"]}]},
    )
    assert bad.status_code == 400


def test_deleting_quiz_lesson_removes_assignment(client):
    teacher, _, _, _, module_id, _ = _setup(client)
    created = _create_quiz_item(client, teacher, module_id, title="Quiz cần xóa")
    lesson_id = created.json()["id"]
    quiz_id = created.json()["quizId"]

    deleted = client.delete(f"/teacher/lessons/{lesson_id}", headers=auth(teacher))
    assert deleted.status_code == 200, deleted.text

    listing = client.get("/api/assignments", headers=auth(teacher)).json()
    assert all(item["id"] != quiz_id for item in listing)


def test_multi_answer_all_or_nothing(client):
    teacher, student, outsider, course_id, module_id, _ = _setup(client)
    enroll = client.post(f"/api/courses/{course_id}/enroll", headers=auth(outsider))
    assert enroll.status_code == 201, enroll.text

    created = _create_quiz_item(client, teacher, module_id, title="Quiz đa đáp án", duration=10)
    quiz_id = created.json()["quizId"]
    published = client.patch(
        f"/api/assignments/{quiz_id}",
        headers=auth(teacher),
        json={
            "status": "published",
            "questions": [
                {
                    "id": "q1",
                    "prompt": "Chọn các số chẵn",
                    "options": [
                        {"id": "a", "text": "2"},
                        {"id": "b", "text": "3"},
                        {"id": "c", "text": "4"},
                    ],
                    "correctOptionIds": ["a", "c"],
                    "allowMultiple": True,
                    "explanation": "2 và 4 là số chẵn.",
                    "points": 3,
                }
            ],
        },
    )
    assert published.status_code == 200, published.text

    started = client.get(f"/api/assignments/{quiz_id}", headers=auth(student))
    assert started.status_code == 200
    partial = client.post(
        f"/api/assignments/{quiz_id}/attempts",
        headers=auth(student),
        json={"answers": {"q1": ["a"]}},
    )
    assert partial.status_code == 201, partial.text
    assert partial.json()["score"] == 0
    assert partial.json()["maxScore"] == 3

    started = client.get(f"/api/assignments/{quiz_id}", headers=auth(outsider))
    assert started.status_code == 200
    correct = client.post(
        f"/api/assignments/{quiz_id}/attempts",
        headers=auth(outsider),
        json={"answers": {"q1": ["a", "c"]}},
    )
    assert correct.status_code == 201, correct.text
    assert correct.json()["score"] == 3
    assert correct.json()["maxScore"] == 3


def test_retry_resets_attempt_and_timer(client):
    teacher, student, _, course_id, module_id, lesson_id = _setup(client)
    body = _assignment_body(course_id, lesson_id, allow_retry=True)
    body["durationMinutes"] = 1
    created = client.post("/api/assignments", headers=auth(teacher), json=body)
    assert created.status_code == 201, created.text
    assignment_id = created.json()["id"]
    assert created.json()["allowRetry"] is True

    # Chưa nộp thì không có lượt làm nào để xoá.
    not_submitted = client.post(f"/api/assignments/{assignment_id}/retry", headers=auth(student))
    assert not_submitted.status_code == 409
    assert not_submitted.json()["detail"] == "Bạn chưa nộp bài"

    started = client.get(f"/api/assignments/{assignment_id}", headers=auth(student))
    assert started.status_code == 200
    submitted = client.post(
        f"/api/assignments/{assignment_id}/attempts",
        headers=auth(student),
        json={"answers": {"q1": ["a"]}},
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["score"] == 0

    # Lượt đầu đã hết thời gian làm bài -> không thể nộp chồng.
    asyncio.run(_expire_session(assignment_id))
    late = client.post(
        f"/api/assignments/{assignment_id}/attempts",
        headers=auth(student),
        json={"answers": {"q1": ["b"]}},
    )
    assert late.status_code == 409

    # Làm lại: xoá lượt cũ, đồng hồ chạy lại, đáp án bị ẩn lại.
    retried = client.post(f"/api/assignments/{assignment_id}/retry", headers=auth(student))
    assert retried.status_code == 200, retried.text
    assert retried.json()["expiresAt"] is not None
    assert (
        client.get(f"/api/assignments/{assignment_id}/attempt", headers=auth(student)).json()
        is None
    )
    hidden = client.get(f"/api/assignments/{assignment_id}", headers=auth(student))
    assert hidden.json()["questions"][0]["correctOptionIds"] == []
    assert hidden.json()["questions"][0]["explanation"] == ""

    resubmitted = client.post(
        f"/api/assignments/{assignment_id}/attempts",
        headers=auth(student),
        json={"answers": {"q1": ["b"]}},
    )
    assert resubmitted.status_code == 201, resubmitted.text
    assert resubmitted.json()["score"] == 2


def test_retry_requires_teacher_flag_and_open_assignment(client):
    teacher, student, _, course_id, module_id, lesson_id = _setup(client)
    # Giáo viên không bật cờ -> không được làm lại.
    created = client.post(
        "/api/assignments",
        headers=auth(teacher),
        json=_assignment_body(course_id, lesson_id),
    )
    assignment_id = created.json()["id"]
    assert created.json()["allowRetry"] is False
    client.get(f"/api/assignments/{assignment_id}", headers=auth(student))
    _submit(client, student, assignment_id)
    denied = client.post(f"/api/assignments/{assignment_id}/retry", headers=auth(student))
    assert denied.status_code == 403
    assert denied.json()["detail"] == "Giáo viên chưa cho phép làm lại bài này"

    # Bật cờ nhưng bài đã đóng -> vẫn không làm lại được (bài không gắn bài học
    # để tránh ràng buộc mỗi bài học chỉ có 1 bài tập).
    closed = client.post(
        "/api/assignments",
        headers=auth(teacher),
        json=_assignment_body(
            course_id, None, due_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            allow_retry=True,
        ),
    )
    closed_id = closed.json()["id"]
    client.get(f"/api/assignments/{closed_id}", headers=auth(student))
    blocked = client.post(f"/api/assignments/{closed_id}/retry", headers=auth(student))
    assert blocked.status_code == 409
    assert blocked.json()["detail"] == "Bài tập đã đóng"

