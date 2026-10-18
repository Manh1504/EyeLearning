"""Tiện ích dùng chung cho toàn bộ workflow.

Gom lại các factory model, prompt và công cụ truy hồi để các module khác
import ngắn gọn: `from workflow.shared import create_llm, ...`.
"""

from .models import (
    create_llm,
    create_embedding,
    create_vlm,
    OllamaAPIEmbeddings,
)
from .prompts import (
    ROUTER_SYSTEM_PROMPT,
    QA_SYSTEM_PROMPT,
    HINTS_SYSTEM_PROMPT,
    FALLBACK_SYSTEM_PROMPT,
    VALIDATE_SYSTEM_PROMPT,
    CITATION_RULE,
    STRICT_SUFFIX,
    SLIDE_VLM_PROMPT,
)
from .retrieval import (
    Retriever,
    get_retriever,
    close_retriever,
    build_citations,
    format_context,
)

__all__ = [
    "create_llm",
    "create_embedding",
    "create_vlm",
    "OllamaAPIEmbeddings",
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
