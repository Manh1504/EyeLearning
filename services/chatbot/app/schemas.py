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
    message: str = Field(min_length=1, description="Câu hỏi của sinh viên.")
    course_id: UUIDString = Field(description="UUID khóa học để giới hạn phạm vi truy hồi.")
    thread_id: str = Field(
        min_length=1,
        max_length=256,
        pattern=r"^[\w.:-]+$",
        description="ID hội thoại, dùng để giữ ngữ cảnh.",
    )
    assignment_context: str = Field(default="", max_length=30000)
    support_mode: Literal["hint", "review"] = "hint"
    # Ngữ cảnh LMS: sinh viên đang hỏi trong bài tập / bài học nào. `lesson_id`
    # giúp ưu tiên truy hồi slide của đúng bài; các nhãn còn lại để LLM trả lời
    # đúng ngữ cảnh (đang ở chương nào, bài nào).
    assignment_id: UUIDString | None = None
    assignment_title: str = Field(default="", max_length=255)
    lesson_id: UUIDString | None = None
    lesson_title: str = Field(default="", max_length=255)
    module_title: str = Field(default="", max_length=255)


class CitationOut(BaseModel):
    document_id: str
    title: str
    location: str


class ChatResponse(BaseModel):
    answer: str
    citations: list[CitationOut]
    intent: str | None = None


class EmbedSlideRequest(BaseModel):
    lesson_content_id: UUIDString = Field(
        description="UUID slide (lesson_contents) cần embedding."
    )


class EmbedResult(BaseModel):
    processed: int = Field(description="Số slide đã xử lý thành công.")
    failed: int = Field(default=0, description="Số slide bị bỏ qua do lỗi.")
