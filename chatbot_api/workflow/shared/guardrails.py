"""Kiểm duyệt đầu ra: bảo đảm chatbot không "giải bài hộ".

Sau khi sinh bản nháp, một LLM call riêng chấm xem bản nháp có lộ đáp án cuối
hay lời giải hoàn chỉnh hay không. Node này chỉ *đánh giá*, việc quyết định
sinh lại nằm ở `after_validation` trong `subgraph/common.py`.
"""

import os

from dotenv import load_dotenv
from pydantic import BaseModel, Field

load_dotenv()

from langchain_core.prompts import ChatPromptTemplate

from ..state import GraphState
from .models import create_llm
from .prompts import VALIDATE_SYSTEM_PROMPT
from .retrieval import format_context


class ValidationOutput(BaseModel):
    """Kết quả chấm một bản nháp."""

    ok: bool = Field(description="True nếu bản nháp không vi phạm quy tắc.")
    violates_no_solution: bool = Field(
        description="True nếu bản nháp lộ đáp án cuối hoặc lời giải hoàn chỉnh."
    )
    reason: str = Field(description="Giải thích ngắn gọn cho phán quyết.")


_llm = create_llm(os.getenv("LLM_NAME"))

_validate_chain = ChatPromptTemplate.from_messages([
    ("system", VALIDATE_SYSTEM_PROMPT),
    (
        "human",
        "Câu hỏi của sinh viên:\n{question}\n\n"
        "Tài liệu tham khảo:\n{context}\n\n"
        "Bản nháp cần kiểm duyệt:\n{draft}",
    ),
]) | _llm.with_structured_output(ValidationOutput)


def validation_node(state: GraphState) -> dict:
    """Chấm bản nháp và tăng số lần thử để giới hạn vòng lặp sinh lại."""
    result: ValidationOutput = _validate_chain.invoke({
        "question": state["messages"][-1].content,
        "context": format_context(state.get("retrieved_docs", [])),
        "draft": state.get("draft_response") or "",
    })

    return {
        # Coi là đạt chỉ khi không vi phạm quy tắc "không giải hộ"
        "validation_ok": result.ok and not result.violates_no_solution,
        "attempts": state.get("attempts", 0) + 1,
    }
