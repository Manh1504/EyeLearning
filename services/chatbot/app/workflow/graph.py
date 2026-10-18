"""Graph chính của chatbot.

    START -> router -> (qa | hints | fallback) -> END

- `router` phân loại intent từ câu hỏi mới nhất (kèm lịch sử hội thoại).
- Mỗi intent là một subgraph đã đóng gói (truy hồi + trả lời + kiểm duyệt).
- Hiện chỉ hiện thực qa/hints/fallback; summary/planning sẽ thêm sau bằng cách
  gắn thêm subgraph và một nhánh trong `route_by_intent`.
"""

from langgraph.graph import StateGraph, START, END

from .state import GraphState
from .router import router_node
from .subgraph import qa_subgraph, hints_subgraph, fallback_subgraph


def route_by_intent(state: GraphState) -> str:
    """Ánh xạ intent sang tên node tương ứng.

    summary/planning chưa hiện thực nên tạm đưa về fallback.
    """
    intent = state.get("intent")
    if intent in ("qa", "hints"):
        return intent
    return "fallback"


def build_graph(checkpointer=None):
    """Ráp và compile graph chính.

    `checkpointer` (vd PostgresSaver) dùng để lưu lịch sử hội thoại theo
    `thread_id`. Truyền None khi test nhanh không cần bộ nhớ.
    """
    builder = StateGraph(GraphState)

    builder.add_node("router", router_node)
    builder.add_node("qa", qa_subgraph)
    builder.add_node("hints", hints_subgraph)
    builder.add_node("fallback", fallback_subgraph)

    builder.add_edge(START, "router")
    builder.add_conditional_edges(
        "router",
        route_by_intent,
        {"qa": "qa", "hints": "hints", "fallback": "fallback"},
    )

    builder.add_edge("qa", END)
    builder.add_edge("hints", END)
    builder.add_edge("fallback", END)

    return builder.compile(checkpointer=checkpointer)
