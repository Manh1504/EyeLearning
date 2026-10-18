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
        json={"title": "Quiz course", "level": "beginner", "status": "published"},
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
    return teacher, student, outsider, course["id"], lesson["id"]


def _assignment_body(course_id, lesson_id, due_at=None):
    return {
        "courseId": course_id,
        "lessonId": lesson_id,
        "title": "Bài kiểm tra",
        "instructions": "Chọn đáp án đúng",
        "dueAt": (due_at or datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "durationMinutes": 15,
        "status": "published",
        "questions": [
            {
                "id": "q1",
                "prompt": "2 + 2 bằng bao nhiêu?",
                "options": [{"id": "a", "text": "3"}, {"id": "b", "text": "4"}],
                "correctOptionId": "b",
                "explanation": "Hai cộng hai bằng bốn.",
                "points": 2,
            }
        ],
    }


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
    teacher, student, outsider, course_id, lesson_id = _setup(client)
    created = client.post(
        "/api/assignments",
        headers=auth(teacher),
        json=_assignment_body(course_id, lesson_id),
    )
    assert created.status_code == 201, created.text
    assignment_id = created.json()["id"]
    assert created.json()["questions"][0]["correctOptionId"] == "b"

    before_submit = client.get(f"/api/assignments/{assignment_id}", headers=auth(student))
    assert before_submit.status_code == 200
    assert before_submit.json()["questions"][0]["correctOptionId"] == ""
    assert before_submit.json()["questions"][0]["explanation"] == ""
    assert before_submit.json()["expiresAt"] is not None

    forbidden = client.get(f"/api/assignments/{assignment_id}", headers=auth(outsider))
    assert forbidden.status_code == 403

    submitted = client.post(
        f"/api/assignments/{assignment_id}/attempts",
        headers=auth(student),
        json={"answers": {"q1": "b", "unknown": "forged"}},
    )
    assert submitted.status_code == 201, submitted.text
    assert submitted.json()["score"] == 2
    assert submitted.json()["maxScore"] == 2
    assert submitted.json()["answers"] == {"q1": "b"}

    review = client.get(f"/api/assignments/{assignment_id}", headers=auth(student))
    assert review.json()["questions"][0]["correctOptionId"] == "b"
    duplicate = client.post(
        f"/api/assignments/{assignment_id}/attempts",
        headers=auth(student),
        json={"answers": {}},
    )
    assert duplicate.status_code == 409


def test_rejects_late_submission(client):
    teacher, student, _, course_id, lesson_id = _setup(client)
    created = client.post(
        "/api/assignments",
        headers=auth(teacher),
        json=_assignment_body(course_id, lesson_id, datetime.now(timezone.utc) - timedelta(minutes=1)),
    )
    assignment_id = created.json()["id"]
    submitted = client.post(
        f"/api/assignments/{assignment_id}/attempts",
        headers=auth(student),
        json={"answers": {"q1": "b"}},
    )
    assert submitted.status_code == 409


def test_rejects_submission_after_duration(client):
    teacher, student, _, course_id, lesson_id = _setup(client)
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
        json={"answers": {"q1": "b"}},
    )
    assert submitted.status_code == 409
    assert submitted.json()["detail"] == "Đã hết thời gian làm bài"
