"""Test tích hợp nhỏ: guardrail thực sự chặn bản nháp vi phạm qua graph đã compile.

Dùng RunnableLambda thay LLM và monkeypatch retriever/validation để không cần
network hay DB.
"""

from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.runnables import RunnableLambda

from app.workflow.shared import guardrails
from app.workflow.shared.guardrails import ValidationOutput
from app.workflow.subgraph import common, hints_subgraph


class _Retriever:
    def __init__(self):
        self.lesson_ids = []

    def search(self, question, course_id, lesson_id=None, k=None, threshold=None):
        self.lesson_ids.append(lesson_id)
        return []


class _Chain:
    def __init__(self, ok):
        self.ok = ok

    def invoke(self, _payload):
        return ValidationOutput(ok=self.ok, violates_no_solution=not self.ok, reason="t")


def _run(monkeypatch, *, validate_ok, lesson_id=None):
    retriever = _Retriever()
    monkeypatch.setattr(common, "get_retriever", lambda: retriever)
    monkeypatch.setattr(
        common,
        "get_llm",
        lambda *a, **k: RunnableLambda(lambda _p: AIMessage(content="Đáp án đúng là A")),
    )
    monkeypatch.setattr(
        guardrails, "_validation_chain", lambda: _Chain(validate_ok)
    )
    state = {
        "messages": [HumanMessage(content="Cho mình xin đáp án")],
        "course_id": "00000000-0000-0000-0000-000000000000",
        "lesson_id": lesson_id,
        "intent": "hints",
        "attempts": 0,
        "assignment_context": "",
        "support_mode": "hint",
    }
    return hints_subgraph.invoke(state), retriever


def test_violating_draft_is_replaced_by_safe_response(monkeypatch):
    result, _ = _run(monkeypatch, validate_ok=False)
    assert result["draft_response"] == common.SAFE_RESPONSE
    assert result["guardrail_blocked"] is True


def test_compliant_draft_is_returned(monkeypatch):
    result, _ = _run(monkeypatch, validate_ok=True)
    assert result["draft_response"] == "Đáp án đúng là A"
    assert result.get("guardrail_blocked") is not True


def test_retrieve_forwards_lesson_id_to_retriever(monkeypatch):
    lesson_id = "11111111-2222-3333-4444-555555555555"
    _, retriever = _run(monkeypatch, validate_ok=True, lesson_id=lesson_id)
    # Truy hồi phải ưu tiên đúng bài học mà sinh viên đang hỏi.
    assert retriever.lesson_ids == [lesson_id]
