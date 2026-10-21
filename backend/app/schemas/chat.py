from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.common import CamelModel


class ChatCitationOut(CamelModel):
    """Nguồn slide mà trợ lý trích dẫn ở một lượt trả lời."""

    document_id: str
    title: str
    location: str


class ChatSendIn(CamelModel):
    """Một lượt hỏi của sinh viên.

    Không truyền `session_id` thì backend tạo phiên mới cho môn này.
    `assignment_id` chỉ gửi khi hỏi trong ngữ cảnh bài tập đã nộp.
    """

    message: str = Field(min_length=1, max_length=4000)
    session_id: UUID | None = None
    lesson_id: UUID | None = None
    assignment_id: UUID | None = None


class ChatReplyOut(CamelModel):
    session_id: str
    answer: str
    citations: list[ChatCitationOut] = Field(default_factory=list)
    intent: str | None = None


class ChatSessionOut(CamelModel):
    id: str
    course_id: str
    lesson_id: str | None = None
    assignment_id: str | None = None
    title: str
    message_count: int = 0
    created_at: datetime
    updated_at: datetime


class ChatSessionUpdate(CamelModel):
    title: str = Field(min_length=1, max_length=255)


class ChatMessageOut(CamelModel):
    id: str
    role: str
    content: str
    citations: list[ChatCitationOut] = Field(default_factory=list)
    intent: str | None = None
    created_at: datetime
