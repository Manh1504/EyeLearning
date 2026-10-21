"""Node phân loại intent cho câu hỏi mới nhất (kèm lịch sử hội thoại)."""

import logging

from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder

from .shared.prompts import ROUTER_SYSTEM_PROMPT
from .shared.providers import get_llm
from .state import GraphState, RouterOutput

logger = logging.getLogger(__name__)

_router_prompt = ChatPromptTemplate.from_messages([
    ("system", ROUTER_SYSTEM_PROMPT),
    MessagesPlaceholder(variable_name="chat_history", optional=True, n_messages=6),
])


def _router_chain():
    return _router_prompt | get_llm().with_structured_output(RouterOutput)


def router_node(state: GraphState) -> dict:
    # Chế độ gợi ý kèm ngữ cảnh bài tập -> luôn là hints, khỏi tốn 1 LLM call.
    if state.get("support_mode") == "hint" and state.get("assignment_context"):
        return {"intent": "hints"}

    try:
        result = _router_chain().invoke({"chat_history": state["messages"]})
        return {"intent": result.intent}
    except Exception:
        # Không phân loại được -> mặc định qa (an toàn, có truy hồi).
        logger.warning("Router lỗi — mặc định intent=qa", exc_info=True)
        return {"intent": "qa"}
