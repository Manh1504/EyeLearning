"""Các subgraph xử lý riêng cho từng intent (qa, hints, fallback).

Mỗi intent chỉ khác nhau ở node `answer`, nên phần ráp graph được gom ở đây;
`graph.py` (graph chính) chỉ việc import 3 subgraph đã compile sẵn.
"""

from langgraph.graph import StateGraph, START, END

from ..state import GraphState
from .common import build_rag_subgraph
from .fallback.nodes import answer_node as fallback_answer
from .hints.nodes import answer_node as hints_answer
from .qa.nodes import answer_node as qa_answer

# qa/hints: retrieve -> answer -> validate -> (sinh lại | END)
qa_subgraph = build_rag_subgraph(qa_answer)
hints_subgraph = build_rag_subgraph(hints_answer)


def _build_fallback_subgraph():
    """fallback: một node duy nhất, không truy hồi."""
    builder = StateGraph(GraphState)
    builder.add_node("answer", fallback_answer)
    builder.add_edge(START, "answer")
    builder.add_edge("answer", END)
    return builder.compile()


fallback_subgraph = _build_fallback_subgraph()
