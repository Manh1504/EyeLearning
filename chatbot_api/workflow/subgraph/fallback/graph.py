"""Subgraph intent fallback: một node duy nhất, không truy hồi."""

from langgraph.graph import StateGraph, START, END

from ...state import GraphState
from .nodes import answer_node


def _build():
    builder = StateGraph(GraphState)
    builder.add_node("answer", answer_node)
    builder.add_edge(START, "answer")
    builder.add_edge("answer", END)
    return builder.compile()


fallback_subgraph = _build()
