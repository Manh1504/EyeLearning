"""Node trả lời cho intent fallback (không truy hồi tài liệu)."""

from langchain_core.prompts import ChatPromptTemplate

from ...shared.prompts import FALLBACK_SYSTEM_PROMPT
from ...shared.providers import get_llm, message_text
from ...state import GraphState

_prompt = ChatPromptTemplate.from_messages([
    ("system", FALLBACK_SYSTEM_PROMPT),
    ("human", "{question}"),
])


def answer_node(state: GraphState) -> dict:
    """Từ chối nhẹ nhàng và gợi ý phạm vi có thể hỗ trợ."""
    chain = _prompt | get_llm()
    response = chain.invoke({"question": state["messages"][-1].content})

    return {"draft_response": message_text(response.content), "citations": []}
