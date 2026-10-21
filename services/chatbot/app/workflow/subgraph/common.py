"""Tiện ích dùng chung cho các subgraph có truy hồi (qa, hints).

Khung chung:

    retrieve -> answer -> [validate?] -> (sinh lại | sanitize | END)

- `validate` chỉ chạy khi có rủi ro lộ đáp án: intent `hints`, hoặc `qa` khi có
  `assignment_context` (bài tập). Câu hỏi khái niệm thuần bỏ qua để tiết kiệm 1
  LLM call.
- Nếu hết lượt sinh lại mà bản nháp vẫn vi phạm, `sanitize` thay bằng câu trả
  lời an toàn — **không bao giờ** trả bản nháp vi phạm cho sinh viên.

Node `answer` cho từng intent được tạo bằng `build_answer_node`.
"""

import logging

from langchain_core.prompts import ChatPromptTemplate
from langgraph.graph import END, START, StateGraph

from ...settings import llm_name
from ..shared import format_context
from ..shared.guardrails import validation_node
from ..shared.prompts import CITATION_RULE, STRICT_SUFFIX
from ..shared.providers import get_llm, message_text
from ..shared.retrieval import build_citations, get_retriever
from ..state import GraphState

logger = logging.getLogger(__name__)

# Tổng số lần sinh tối đa, tức 1 lần đầu + 1 lần sinh lại
MAX_ATTEMPTS = 2

# Câu trả lời an toàn khi guardrail chặn (không tiết lộ đáp án/lời giải).
SAFE_RESPONSE = (
    "Mình chưa thể đưa ra câu trả lời chắc chắn không tiết lộ đáp án cho câu hỏi "
    "này. Bạn hãy thử trình bày hướng làm hiện tại hoặc phần kiến thức còn vướng "
    "mắc, mình sẽ gợi ý từng bước để bạn tự tìm ra lời giải."
)

_ANSWER_HUMAN = (
    "Vị trí hiện tại của sinh viên: {location}\n"
    "Bài tập đang mở: {assignment_title}\n\n"
    "Câu hỏi của sinh viên: {question}\n\n"
    "Ngữ cảnh bài tập:\n{assignment_context}\n\n"
    "Tài liệu tham khảo:\n{context}"
)


def _location_label(state: GraphState) -> str:
    """Nhãn chương > bài để LLM biết sinh viên đang hỏi ở phần nào."""
    parts = [state.get("module_title"), state.get("lesson_title")]
    return " > ".join(part for part in parts if part) or "chưa xác định"


def build_answer_node(system_prompt: str):
    """Tạo node `answer` cho một intent từ system prompt tương ứng."""

    def answer_node(state: GraphState) -> dict:
        system = f"{system_prompt}\n{CITATION_RULE}"
        # Lần sinh thứ hai trở đi: nhắc nghiêm khắc hơn về việc không lộ đáp án.
        if state.get("attempts", 0) > 0:
            system += f"\n{STRICT_SUFFIX}"

        chain = ChatPromptTemplate.from_messages([
            ("system", "{system}"),
            ("human", _ANSWER_HUMAN),
        ]) | get_llm(llm_name())

        response = chain.invoke({
            "system": system,
            "question": state["messages"][-1].content,
            "location": _location_label(state),
            "assignment_title": state.get("assignment_title") or "không có (hỏi ngoài bài tập)",
            "assignment_context": state.get("assignment_context", ""),
            "context": format_context(state.get("retrieved_docs", [])),
        })
        return {"draft_response": message_text(response.content)}

    return answer_node


def retrieve_node(state: GraphState) -> dict:
    """Truy hồi slide liên quan (ưu tiên đúng bài học) rồi dựng trích dẫn."""
    question = state["messages"][-1].content
    docs = get_retriever().search(
        question, state["course_id"], lesson_id=state.get("lesson_id")
    )

    return {
        "retrieved_docs": docs,
        "citations": build_citations(docs),
    }


def should_validate(state: GraphState) -> str:
    """Chỉ kiểm duyệt khi có nguy cơ lộ đáp án."""
    if state.get("intent") == "hints":
        return "validate"
    if (state.get("assignment_context") or "").strip():
        return "validate"
    return END


def after_validation(state: GraphState) -> str:
    """Quyết định đi tiếp sau kiểm duyệt.

    - Đạt -> END.
    - Chưa đạt, còn lượt -> quay lại `answer` sinh lại.
    - Chưa đạt, hết lượt -> `sanitize` (câu trả lời an toàn).
    """
    if state.get("validation_ok"):
        return END
    if state.get("attempts", 0) >= MAX_ATTEMPTS:
        return "sanitize"
    return "answer"


def sanitize_node(state: GraphState) -> dict:
    """Thay bản nháp vi phạm bằng câu trả lời an toàn (không lộ đáp án)."""
    logger.info("Guardrail chặn bản nháp vi phạm — trả câu trả lời an toàn")
    return {
        "draft_response": SAFE_RESPONSE,
        "validation_ok": False,
        "guardrail_blocked": True,
    }


def build_rag_subgraph(answer_node):
    """Ráp subgraph RAG từ một node trả lời cụ thể theo intent."""
    builder = StateGraph(GraphState)

    builder.add_node("retrieve", retrieve_node)
    builder.add_node("answer", answer_node)
    builder.add_node("validate", validation_node)
    builder.add_node("sanitize", sanitize_node)

    builder.add_edge(START, "retrieve")
    builder.add_edge("retrieve", "answer")
    builder.add_conditional_edges(
        "answer",
        should_validate,
        {"validate": "validate", END: END},
    )
    builder.add_conditional_edges(
        "validate",
        after_validation,
        {"answer": "answer", "sanitize": "sanitize", END: END},
    )
    builder.add_edge("sanitize", END)

    return builder.compile()
