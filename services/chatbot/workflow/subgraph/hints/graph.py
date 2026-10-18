"""Subgraph intent hints."""

from ..common import build_rag_subgraph
from .nodes import answer_node

hints_subgraph = build_rag_subgraph(answer_node)
