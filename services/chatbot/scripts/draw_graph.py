"""Vẽ sơ đồ LangGraph ra file PNG (script dev, không dùng trong production).

Chạy từ đâu cũng được:

    python services/chatbot/scripts/draw_graph.py

Kết quả: ``graph.png`` trong thư mục hiện tại (đã nằm trong .gitignore).
"""

import sys
from pathlib import Path

# Khi chạy trực tiếp một script, sys.path[0] là thư mục chứa script (scripts/),
# nên phải thêm thư mục gói services/chatbot để import được `app`.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.workflow.graph import build_graph  # noqa: E402

if __name__ == "__main__":
    png = build_graph().get_graph().draw_mermaid_png()
    Path("graph.png").write_bytes(png)
    print("Đã ghi graph.png")
