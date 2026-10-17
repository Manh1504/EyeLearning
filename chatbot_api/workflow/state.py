from pydantic import BaseModel, Field
from typing import Literal, TypedDict
from langgraph.graph import MessagesState


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

    id: int
    content: str
    course_title: str
    module_title: str
    lesson_title: str
    image_url: str
    score: float


class GraphState(MessagesState):
    # 1. LMS Context
    course_id: int
    lesson_id: int | None
    resource_id: int | None

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
