from langchain_core.messages import HumanMessage

from app.workflow.shared import guardrails
from app.workflow.shared.guardrails import ValidationOutput, validation_node


class _FakeChain:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error

    def invoke(self, _payload):
        if self.error is not None:
            raise self.error
        return self.result


def _state(draft="bản nháp", attempts=0):
    return {
        "messages": [HumanMessage(content="câu hỏi")],
        "retrieved_docs": [],
        "draft_response": draft,
        "attempts": attempts,
    }


def test_validation_ok(monkeypatch):
    monkeypatch.setattr(
        guardrails,
        "_validation_chain",
        lambda: _FakeChain(ValidationOutput(ok=True, violates_no_solution=False, reason="")),
    )
    out = validation_node(_state())
    assert out["validation_ok"] is True
    assert out["attempts"] == 1


def test_validation_violation_marks_not_ok(monkeypatch):
    monkeypatch.setattr(
        guardrails,
        "_validation_chain",
        lambda: _FakeChain(ValidationOutput(ok=True, violates_no_solution=True, reason="lộ đáp án")),
    )
    out = validation_node(_state())
    assert out["validation_ok"] is False


def test_validation_error_fails_closed(monkeypatch):
    monkeypatch.setattr(
        guardrails, "_validation_chain", lambda: _FakeChain(error=RuntimeError("boom"))
    )
    out = validation_node(_state(attempts=1))
    assert out["validation_ok"] is False
    assert out["attempts"] == 2
