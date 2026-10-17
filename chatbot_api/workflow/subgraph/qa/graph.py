"""Subgraph intent qa."""

from ..common import build_rag_subgraph
from .nodes import answer_node

qa_subgraph = build_rag_subgraph(answer_node)
