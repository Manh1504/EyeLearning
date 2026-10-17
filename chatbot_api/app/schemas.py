"""Schema request/response cho API chat."""

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    message: str = Field(description="Câu hỏi của sinh viên.")
    course_id: int = Field(description="ID khóa học để giới hạn phạm vi truy hồi.")
    thread_id: str = Field(description="ID hội thoại, dùng để giữ ngữ cảnh.")


class CitationOut(BaseModel):
    document_id: str
    title: str
    location: str


class ChatResponse(BaseModel):
    answer: str
    citations: list[CitationOut]
    intent: str | None = None
