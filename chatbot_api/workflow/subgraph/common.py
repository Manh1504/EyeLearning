"""Tiện ích dùng chung cho các subgraph có truy hồi (qa, hints).

Mỗi subgraph RAG đều có cùng khuôn:
    retrieve -> answer -> validate -> (sinh lại | END)
nên phần khung được gom ở đây, chỉ khác nhau ở node `answer`.
"""

from langgraph.graph import StateGraph, START, END

from ..state import GraphState
from ..shared.guardrails import validation_node
from ..shared.retrieval import build_citations, get_retriever

# Tổng số lần sinh tối đa, tức 1 lần đầu + 1 lần sinh lại
MAX_ATTEMPTS = 2


def retrieve_node(state: GraphState) -> dict:
    """Truy hồi slide liên quan rồi dựng trích dẫn từ chính kết quả đó."""
    question = state["messages"][-1].content
    docs = get_retriever().search(question, state["course_id"])

    return {
        "retrieved_docs": docs,
        "citations": build_citations(docs),
    }


def after_validation(state: GraphState) -> str:
    """Quyết định đi tiếp sau kiểm duyệt.

    - Đạt, hoặc đã hết lượt -> END.
    - Chưa đạt và còn lượt -> quay lại node `answer` để sinh lại.
    """
    if state.get("validation_ok") or state.get("attempts", 0) >= MAX_ATTEMPTS:
        return END
    return "answer"


def build_rag_subgraph(answer_node):
    """Ráp subgraph RAG từ một node trả lời cụ thể theo intent."""
    builder = StateGraph(GraphState)

    builder.add_node("retrieve", retrieve_node)
    builder.add_node("answer", answer_node)
    builder.add_node("validate", validation_node)

    builder.add_edge(START, "retrieve")
    builder.add_edge("retrieve", "answer")
    builder.add_edge("answer", "validate")
    builder.add_conditional_edges(
        "validate",
        after_validation,
        {"answer": "answer", END: END},
    )

    return builder.compile()
