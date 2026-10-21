"""Chuẩn bị model THEO CẤU HÌNH .env trước khi khởi động API chatbot.

    EMBEDDING_NAME=local -> tải weights Qwen3-Embedding-0.6B (bắt buộc; lỗi ->
                            exit != 0 để container restart, vì thiếu weights thì
                            không chạy được).

LLM và VLM (River AI) đều gọi API nên không cần chuẩn bị gì.

Chạy: entrypoint.sh gọi `python -m scripts.prepare_models`.
"""

import sys
from pathlib import Path

# Cho phép chạy trực tiếp file script (khi đó sys.path[0] là scripts/).
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.settings import embedding_name  # noqa: E402


def main() -> int:
    if embedding_name() == "local":
        from scripts.download_embedding import ensure_embedding

        ensure_embedding()

    return 0


if __name__ == "__main__":
    sys.exit(main())
