"""Node trả lời cho intent hints (hướng dẫn từng bước, không giải hộ)."""

import os

from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate

load_dotenv()

from ...shared.providers import create_llm, message_text
from ...shared.prompts import CITATION_RULE, HINTS_SYSTEM_PROMPT, STRICT_SUFFIX
from ...shared.retrieval import format_context
from ...state import GraphState

_llm = create_llm(os.getenv("LLM_NAME"))

_answer_chain = ChatPromptTemplate.from_messages([
    ("system", "{system}"),
    (
        "human",
        "Câu hỏi của sinh viên: {question}\n\n"
        "Ngữ cảnh bài tập:\n{assignment_context}\n\n"
        "Tài liệu tham khảo:\n{context}",
    ),
]) | _llm


def answer_node(state: GraphState) -> dict:
    """Sinh gợi ý theo bước dựa trên tài liệu, kèm trích dẫn [n]."""
    system = f"{HINTS_SYSTEM_PROMPT}\n{CITATION_RULE}"

    if state.get("attempts", 0) > 0:
        system += f"\n{STRICT_SUFFIX}"

    response = _answer_chain.invoke({
        "system": system,
        "question": state["messages"][-1].content,
        "assignment_context": state.get("assignment_context", ""),
        "context": format_context(state.get("retrieved_docs", [])),
    })

    return {"draft_response": message_text(response.content)}
