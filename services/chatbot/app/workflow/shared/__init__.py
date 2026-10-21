"""Tiện ích dùng chung cho toàn bộ workflow.

Gom lại các factory model, prompt và công cụ truy hồi để các module khác
import ngắn gọn: `from app.workflow.shared import get_llm, ...`.
"""

from .prompts import (
    CITATION_RULE,
    FALLBACK_SYSTEM_PROMPT,
    HINTS_SYSTEM_PROMPT,
    QA_SYSTEM_PROMPT,
    ROUTER_SYSTEM_PROMPT,
    SLIDE_VLM_PROMPT,
    STRICT_SUFFIX,
    VALIDATE_SYSTEM_PROMPT,
)
from .providers import (
    get_embedding,
    get_llm,
    get_vlm,
    message_text,
)
from .retrieval import (
    Retriever,
    build_citations,
    close_retriever,
    format_context,
    get_retriever,
)

__all__ = [
    "get_llm",
    "get_embedding",
    "get_vlm",
    "message_text",
    "ROUTER_SYSTEM_PROMPT",
    "QA_SYSTEM_PROMPT",
    "HINTS_SYSTEM_PROMPT",
    "FALLBACK_SYSTEM_PROMPT",
    "VALIDATE_SYSTEM_PROMPT",
    "CITATION_RULE",
    "STRICT_SUFFIX",
    "SLIDE_VLM_PROMPT",
    "Retriever",
    "get_retriever",
    "close_retriever",
    "build_citations",
    "format_context",
]
