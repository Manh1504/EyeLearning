from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas import ChatRequest, EmbedSlideRequest


@pytest.mark.parametrize(
    ("schema", "field"),
    [
        (ChatRequest, "course_id"),
        (EmbedSlideRequest, "lesson_content_id"),
    ],
)
def test_uuid_fields_accept_and_keep_uuid_strings(schema, field):
    identifier = str(uuid4()).upper()
    values = {field: identifier}
    if schema is ChatRequest:
        values.update(message="question", thread_id="thread-1")

    payload = schema(**values)

    assert getattr(payload, field) == identifier.lower()
    assert isinstance(getattr(payload, field), str)


@pytest.mark.parametrize("identifier", [0, "not-a-uuid"])
def test_chat_request_rejects_non_uuid_course_id(identifier):
    with pytest.raises(ValidationError):
        ChatRequest(message="question", course_id=identifier, thread_id="thread-1")


def test_uuid_fields_are_documented_as_uuid_strings():
    schema = ChatRequest.model_json_schema()

    assert schema["properties"]["course_id"] == {
        "description": "UUID khóa học để giới hạn phạm vi truy hồi.",
        "format": "uuid",
        "title": "Course Id",
        "type": "string",
    }


def test_chat_request_accepts_assignment_context_and_mode():
    payload = ChatRequest(
        message="Giải thích câu 1",
        course_id=str(uuid4()),
        thread_id="thread-1",
        assignment_context="Câu 1: Nội dung",
        support_mode="review",
    )

    assert payload.assignment_context == "Câu 1: Nội dung"
    assert payload.support_mode == "review"


@pytest.mark.parametrize("thread_id", ["", "bad id!", "a" * 257])
def test_chat_request_rejects_invalid_thread_id(thread_id):
    with pytest.raises(ValidationError):
        ChatRequest(message="q", course_id=str(uuid4()), thread_id=thread_id)


def test_chat_request_accepts_thread_id_with_separators():
    payload = ChatRequest(
        message="q",
        course_id=str(uuid4()),
        thread_id=f"{uuid4()}:{uuid4()}:{uuid4()}",
    )
    assert ":" in payload.thread_id


def test_chat_request_accepts_lms_context_defaults():
    payload = ChatRequest(message="q", course_id=str(uuid4()), thread_id="thread-1")

    assert payload.assignment_id is None
    assert payload.lesson_id is None
    assert payload.assignment_title == ""
    assert payload.lesson_title == ""
    assert payload.module_title == ""


def test_chat_request_keeps_lms_context_when_provided():
    lesson_id = str(uuid4()).upper()
    payload = ChatRequest(
        message="q",
        course_id=str(uuid4()),
        thread_id="thread-1",
        assignment_id=str(uuid4()),
        assignment_title="Kiểm tra nhập môn",
        lesson_id=lesson_id,
        lesson_title="Bài tập: Kiểm tra nhập môn",
        module_title="Chương 1",
    )

    assert payload.lesson_id == lesson_id.lower()
    assert payload.assignment_title == "Kiểm tra nhập môn"
    assert payload.module_title == "Chương 1"


def test_chat_request_rejects_invalid_lesson_id():
    with pytest.raises(ValidationError):
        ChatRequest(
            message="q",
            course_id=str(uuid4()),
            thread_id="thread-1",
            lesson_id="not-a-uuid",
        )
