from langchain_core.messages import HumanMessage

from app.workflow import router as router_mod
from app.workflow.router import router_node


class _Result:
    def __init__(self, intent):
        self.intent = intent


class _Chain:
    def __init__(self, result=None, error=None):
        self.result = result
        self.error = error

    def invoke(self, _payload):
        if self.error is not None:
            raise self.error
        return self.result


def _state(**overrides):
    state = {
        "messages": [HumanMessage(content="giải thích định lý")],
        "support_mode": "review",
        "assignment_context": "",
    }
    state.update(overrides)
    return state


def test_hint_with_assignment_shortcuts_to_hints():
    out = router_node(_state(support_mode="hint", assignment_context="Bài 1"))
    assert out == {"intent": "hints"}


def test_router_uses_llm_result(monkeypatch):
    monkeypatch.setattr(router_mod, "_router_chain", lambda: _Chain(_Result("hints")))
    assert router_node(_state()) == {"intent": "hints"}


def test_router_falls_back_to_qa_on_error(monkeypatch):
    monkeypatch.setattr(router_mod, "_router_chain", lambda: _Chain(error=RuntimeError("x")))
    assert router_node(_state()) == {"intent": "qa"}
