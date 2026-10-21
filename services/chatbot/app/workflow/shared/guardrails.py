"""Kiểm duyệt đầu ra: bảo đảm chatbot không "giải bài hộ".

Sau khi sinh bản nháp, một LLM call riêng chấm xem bản nháp có lộ đáp án cuối
hay lời giải hoàn chỉnh hay không. Node này chỉ *đánh giá*, việc quyết định
sinh lại nằm ở `after_validation` trong `subgraph/common.py`.

Lưu ý: nếu bước chấm lỗi (provider timeout / parse fail) ta coi như **không đạt**
để không bao giờ trả bản nháp chưa được kiểm duyệt (fail-closed).
"""

import logging

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from ..state import GraphState
from .prompts import VALIDATE_SYSTEM_PROMPT
from .providers import get_llm
from .retrieval import format_context

logger = logging.getLogger(__name__)


class ValidationOutput(BaseModel):
    """Kết quả chấm một bản nháp."""

    ok: bool = Field(description="True nếu bản nháp không vi phạm quy tắc.")
    violates_no_solution: bool = Field(
        description="True nếu bản nháp lộ đáp án cuối hoặc lời giải hoàn chỉnh."
    )
    reason: str = Field(description="Giải thích ngắn gọn cho phán quyết.")


_validate_prompt = ChatPromptTemplate.from_messages([
    ("system", VALIDATE_SYSTEM_PROMPT),
    (
        "human",
        "Câu hỏi của sinh viên:\n{question}\n\n"
        "Tài liệu tham khảo:\n{context}\n\n"
        "Bản nháp cần kiểm duyệt:\n{draft}",
    ),
])


def _validation_chain():
    return _validate_prompt | get_llm().with_structured_output(ValidationOutput)


def validation_node(state: GraphState) -> dict:
    """Chấm bản nháp và tăng số lần thử để giới hạn vòng lặp sinh lại."""
    try:
        result: ValidationOutput = _validation_chain().invoke({
            "question": state["messages"][-1].content,
            "context": format_context(state.get("retrieved_docs", [])),
            "draft": state.get("draft_response") or "",
        })
        ok = bool(result.ok and not result.violates_no_solution)
    except Exception:
        # Không kiểm duyệt được -> coi như không đạt để node sau xử lý an toàn.
        logger.warning("Bước kiểm duyệt lỗi — coi như không đạt", exc_info=True)
        ok = False

    return {
        "validation_ok": ok,
        "attempts": state.get("attempts", 0) + 1,
    }
