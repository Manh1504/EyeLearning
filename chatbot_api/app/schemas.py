"""Schema request/response cho API chat."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, BaseModel, Field, WithJsonSchema


def _validate_uuid_string(value: str) -> str:
    if not isinstance(value, str):
        raise ValueError("ID phải là UUID string.")
    try:
        return str(UUID(value))
    except ValueError as exc:
        raise ValueError("ID phải là UUID string hợp lệ.") from exc


UUIDString = Annotated[
    str,
    AfterValidator(_validate_uuid_string),
    WithJsonSchema({"type": "string", "format": "uuid"}),
]


class ChatRequest(BaseModel):
    message: str = Field(description="Câu hỏi của sinh viên.")
    course_id: UUIDString = Field(description="UUID khóa học để giới hạn phạm vi truy hồi.")
    thread_id: str = Field(description="ID hội thoại, dùng để giữ ngữ cảnh.")
    assignment_context: str = Field(default="", max_length=30000)
    support_mode: Literal["hint", "review"] = "hint"


class CitationOut(BaseModel):
    document_id: str
    title: str
    location: str


class ChatResponse(BaseModel):
    answer: str
    citations: list[CitationOut]
    intent: str | None = None


class EmbedCourseRequest(BaseModel):
    course_id: UUIDString = Field(description="UUID khóa học cần embedding các slide còn thiếu.")
    batch_size: int = Field(
        default=20, ge=1, le=200, description="Số slide xử lý mỗi batch."
    )


class EmbedSlideRequest(BaseModel):
    lesson_content_id: UUIDString = Field(
        description="UUID slide (lesson_contents) cần embedding."
    )


class EmbedResult(BaseModel):
    processed: int = Field(description="Số slide đã xử lý.")
