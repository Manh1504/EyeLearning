from typing import Literal, TypedDict

from langgraph.graph import MessagesState
from pydantic import BaseModel, Field


class RouterOutput(BaseModel):
    intent: Literal[
        "qa",
        "hints",
        "summary",
        "planning",
        "fallback"
    ] = Field(
        description="Intent phù hợp nhất với yêu cầu của sinh viên."
    )


class VLMOutput(BaseModel):
    transcript: str = Field(description=(
        "Faithful Markdown transcription of the slide in reading order. "
        "Preserve original text and table relationships; repeat merged-cell "
        "labels on applicable rows. Include visual descriptions separately "
        "under 'Mô tả hình'."
    ))


class Citation(TypedDict):
    document_id: str
    title: str
    location: str


class RetrievedDoc(TypedDict):
    """Một slide được truy hồi từ pgvector, kèm ngữ cảnh môn/chương/bài."""

    id: str
    content: str
    course_title: str
    module_title: str
    lesson_title: str
    image_url: str
    score: float


class GraphState(MessagesState):
    # 1. LMS Context
    course_id: str
    lesson_id: str | None
    resource_id: str | None
    assignment_title: str
    lesson_title: str
    module_title: str
    assignment_context: str
    support_mode: str

    # 2. Intent
    intent: str

    # 3. Retrieval
    retrieved_docs: list[RetrievedDoc]

    # 4. Workflow Output
    draft_response: str | None
    citations: list[Citation]

    # 5. Validation
    validation_ok: bool | None
    attempts: int
    # True khi guardrail chặn bản nháp vi phạm và trả câu an toàn.
    guardrail_blocked: bool | None
