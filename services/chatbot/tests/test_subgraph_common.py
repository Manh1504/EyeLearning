from langgraph.graph import END

from app.workflow.subgraph import common


def _state(intent="qa", assignment="", attempts=0, validation_ok=None):
    return {
        "intent": intent,
        "assignment_context": assignment,
        "attempts": attempts,
        "validation_ok": validation_ok,
        "messages": [],
    }


def test_should_validate_hints_always():
    assert common.should_validate(_state(intent="hints")) == "validate"


def test_should_validate_qa_with_assignment():
    assert common.should_validate(_state(intent="qa", assignment="Bài tập 1")) == "validate"


def test_should_validate_skips_pure_qa():
    assert common.should_validate(_state(intent="qa", assignment="")) == END


def test_after_validation_passes():
    assert common.after_validation(_state(validation_ok=True, attempts=1)) == END


def test_after_validation_regenerates_while_attempts_left():
    assert common.after_validation(_state(validation_ok=False, attempts=1)) == "answer"


def test_after_validation_sanitizes_when_out_of_attempts():
    # Hết lượt mà vẫn vi phạm -> sanitize (KHÔNG trả bản nháp vi phạm).
    assert common.after_validation(_state(validation_ok=False, attempts=common.MAX_ATTEMPTS)) == "sanitize"


def test_sanitize_node_blocks_and_replaces():
    out = common.sanitize_node(_state())
    assert out["draft_response"] == common.SAFE_RESPONSE
    assert out["guardrail_blocked"] is True
    assert out["validation_ok"] is False
