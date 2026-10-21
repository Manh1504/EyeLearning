"""Test API chat học tập: phiên, lịch sử, gửi câu hỏi và phân quyền."""

from app.core.config import settings
from app.services import study_chat as study_chat_mod
from tests.conftest import auth
from tests.test_assignments import _assignment_body, _setup, _submit


class _FakeChatbotResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self._payload


class _FakeChatbotClient:
    """Thay httpx.AsyncClient để bắt payload backend gửi sang service chatbot."""

    def __init__(self, captured, **_kwargs):
        self.captured = captured

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def post(self, url, json):
        self.captured["url"] = url
        self.captured["payload"] = json
        return _FakeChatbotResponse(
            {
                "answer": "Đáp án là B",
                "citations": [
                    {"documentId": "d1", "title": "Chương 1 - Bài 1", "location": "http://x/s.png"}
                ],
                "intent": "qa",
            }
        )

    async def delete(self, url):
        self.captured.setdefault("deleted", []).append(url)
        return _FakeChatbotResponse({"status": "ok"})


def _patch_chatbot(monkeypatch) -> dict:
    captured: dict = {}
    monkeypatch.setattr(
        study_chat_mod.httpx, "AsyncClient", lambda **kw: _FakeChatbotClient(captured, **kw)
    )
    monkeypatch.setattr(settings, "chatbot_url", "http://chatbot:8000")
    monkeypatch.setattr(settings, "chatbot_internal_token", "internal-token")
    return captured


def test_chat_session_lifecycle_and_history(client, monkeypatch):
    captured = _patch_chatbot(monkeypatch)
    _, student, _, course_id, _, lesson_id = _setup(client)

    sent = client.post(
        f"/api/courses/{course_id}/chat",
        headers=auth(student),
        json={"message": "Hàm trong Python là gì?", "lessonId": lesson_id},
    )
    assert sent.status_code == 200, sent.text
    session_id = sent.json()["sessionId"]
    assert sent.json()["answer"] == "Đáp án là B"
    assert sent.json()["citations"][0]["documentId"] == "d1"

    # thread_id hội thoại chính là id phiên; chat tự do KHÔNG kèm đáp án.
    payload = captured["payload"]
    assert payload["thread_id"] == session_id
    assert payload["course_id"] == course_id
    assert payload["lesson_id"] == lesson_id
    assert payload["assignment_context"] == ""
    assert payload["support_mode"] == "hint"

    sessions = client.get(
        f"/api/courses/{course_id}/chat/sessions", headers=auth(student)
    ).json()
    assert len(sessions) == 1
    assert sessions[0]["id"] == session_id
    assert sessions[0]["messageCount"] == 2
    # Tiêu đề tự sinh từ câu hỏi đầu tiên.
    assert sessions[0]["title"] == "Hàm trong Python là gì?"

    messages = client.get(
        f"/api/chat/sessions/{session_id}/messages", headers=auth(student)
    ).json()
    assert [m["role"] for m in messages] == ["student", "assistant"]
    assert messages[0]["content"] == "Hàm trong Python là gì?"
    assert messages[1]["content"] == "Đáp án là B"
    assert messages[1]["citations"][0]["title"] == "Chương 1 - Bài 1"

    # Hỏi tiếp trong cùng phiên -> giữ nguyên sessionId, thêm 2 tin nhắn.
    again = client.post(
        f"/api/courses/{course_id}/chat",
        headers=auth(student),
        json={"message": "Cho ví dụ", "sessionId": session_id},
    )
    assert again.status_code == 200, again.text
    assert again.json()["sessionId"] == session_id
    sessions = client.get(
        f"/api/courses/{course_id}/chat/sessions", headers=auth(student)
    ).json()
    assert sessions[0]["messageCount"] == 4

    renamed = client.patch(
        f"/api/chat/sessions/{session_id}",
        headers=auth(student),
        json={"title": "Ôn Python cơ bản"},
    )
    assert renamed.status_code == 200
    assert renamed.json()["title"] == "Ôn Python cơ bản"

    deleted = client.delete(f"/api/chat/sessions/{session_id}", headers=auth(student))
    assert deleted.status_code == 200
    assert (
        client.get(f"/api/courses/{course_id}/chat/sessions", headers=auth(student)).json()
        == []
    )
    # Xoá phiên kéo theo xoá bộ nhớ hội thoại bên chatbot.
    assert captured["deleted"] == [f"http://chatbot:8000/threads/{session_id}"]


def test_chat_assignment_context_requires_submission(client, monkeypatch):
    captured = _patch_chatbot(monkeypatch)
    teacher, student, _, course_id, _, lesson_id = _setup(client)
    created = client.post(
        "/api/assignments",
        headers=auth(teacher),
        json=_assignment_body(course_id, lesson_id),
    )
    assignment_id = created.json()["id"]
    # Mở bài tập để bắt đầu lượt làm (tạo session) rồi mới nộp được.
    client.get(f"/api/assignments/{assignment_id}", headers=auth(student))

    before = client.post(
        f"/api/courses/{course_id}/chat",
        headers=auth(student),
        json={"message": "Cho mình gợi ý", "assignmentId": assignment_id},
    )
    assert before.status_code == 403
    assert before.json()["detail"] == "Hãy nộp bài trước khi dùng trợ lý học tập"

    _submit(client, student, assignment_id)
    after = client.post(
        f"/api/courses/{course_id}/chat",
        headers=auth(student),
        json={"message": "Vì sao đáp án là B?", "assignmentId": assignment_id},
    )
    assert after.status_code == 200, after.text

    payload = captured["payload"]
    # Chữa bài: có kèm đáp án đúng + giải thích và ngữ cảnh phân cấp.
    assert payload["support_mode"] == "review"
    assert "Đáp án đúng: b" in payload["assignment_context"]
    assert payload["assignment_id"] == assignment_id
    assert payload["lesson_id"] == lesson_id
    assert payload["lesson_title"] == "Lesson"
    assert payload["module_title"] == "Module"


def test_chat_access_control(client, monkeypatch):
    _patch_chatbot(monkeypatch)
    _, student, outsider, course_id, _, lesson_id = _setup(client)
    session_id = client.post(
        f"/api/courses/{course_id}/chat",
        headers=auth(student),
        json={"message": "Chào trợ lý", "lessonId": lesson_id},
    ).json()["sessionId"]

    # Người chưa ghi danh môn: không list, không hỏi được.
    assert (
        client.get(f"/api/courses/{course_id}/chat/sessions", headers=auth(outsider)).status_code
        == 403
    )
    assert (
        client.post(
            f"/api/courses/{course_id}/chat", headers=auth(outsider), json={"message": "hi"}
        ).status_code
        == 403
    )
    # Phiên của người khác: ẩn như không tồn tại.
    assert (
        client.get(
            f"/api/chat/sessions/{session_id}/messages", headers=auth(outsider)
        ).status_code
        == 404
    )
    assert (
        client.delete(f"/api/chat/sessions/{session_id}", headers=auth(outsider)).status_code
        == 404
    )


def test_chat_unconfigured_returns_503_without_session(client, monkeypatch):
    monkeypatch.setattr(settings, "chatbot_url", "")
    monkeypatch.setattr(settings, "chatbot_internal_token", "")
    _, student, _, course_id, _, _ = _setup(client)

    response = client.post(
        f"/api/courses/{course_id}/chat", headers=auth(student), json={"message": "hi"}
    )
    assert response.status_code == 503
    # Lỗi trước khi lưu -> không tạo phiên rác.
    assert (
        client.get(f"/api/courses/{course_id}/chat/sessions", headers=auth(student)).json()
        == []
    )
