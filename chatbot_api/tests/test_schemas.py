from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas import ChatRequest, EmbedCourseRequest, EmbedSlideRequest


@pytest.mark.parametrize(
    ("schema", "field"),
    [
        (ChatRequest, "course_id"),
        (EmbedCourseRequest, "course_id"),
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
