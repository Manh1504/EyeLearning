"""Node trả lời cho intent fallback (không truy hồi tài liệu)."""

import os

from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate

load_dotenv()

from ...shared.models import create_llm
from ...shared.prompts import FALLBACK_SYSTEM_PROMPT
from ...state import GraphState

_llm = create_llm(os.getenv("LLM_NAME"))

_chain = ChatPromptTemplate.from_messages([
    ("system", FALLBACK_SYSTEM_PROMPT),
    ("human", "{question}"),
]) | _llm


def answer_node(state: GraphState) -> dict:
    """Từ chối nhẹ nhàng và gợi ý phạm vi có thể hỗ trợ."""
    response = _chain.invoke({"question": state["messages"][-1].content})

    return {"draft_response": response.content, "citations": []}
