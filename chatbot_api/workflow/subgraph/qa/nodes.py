"""Node trả lời cho intent qa (giải thích kiến thức, không giải bài tập)."""

import os

from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate

load_dotenv()

from ...shared.models import create_llm
from ...shared.prompts import CITATION_RULE, QA_SYSTEM_PROMPT, STRICT_SUFFIX
from ...shared.retrieval import format_context
from ...state import GraphState

_llm = create_llm(os.getenv("LLM_NAME"))

# Để system là biến để có thể chèn STRICT_SUFFIX khi phải sinh lại.
_answer_chain = ChatPromptTemplate.from_messages([
    ("system", "{system}"),
    (
        "human",
        "Câu hỏi của sinh viên: {question}\n\n"
        "Tài liệu tham khảo:\n{context}",
    ),
]) | _llm


def answer_node(state: GraphState) -> dict:
    """Sinh câu trả lời dựa trên tài liệu, kèm trích dẫn [n]."""
    system = f"{QA_SYSTEM_PROMPT}\n{CITATION_RULE}"

    # Lần sinh thứ hai trở đi: nhắc nghiêm khắc hơn về việc không lộ đáp án
    if state.get("attempts", 0) > 0:
        system += f"\n{STRICT_SUFFIX}"

    response = _answer_chain.invoke({
        "system": system,
        "question": state["messages"][-1].content,
        "context": format_context(state.get("retrieved_docs", [])),
    })

    return {"draft_response": response.content}
