"""Cấu hình dùng chung cho chatbot.

Gom việc đọc biến môi trường về một chỗ và cung cấp `validate()` để fail-fast
lúc khởi động với thông báo rõ ràng (thay vì lỗi khó hiểu ở request đầu tiên).

`DATABASE_URL` là DSN psycopg (postgresql://...), KHÔNG dùng hậu tố +asyncpg.
Fallback `DATABASE_URL_DOCKER` để tương thích khi stack chỉ cấu hình biến dùng
chung với backend.
"""

import os
from pathlib import Path

ALLOWED_LLM = {"river"}
ALLOWED_EMBEDDING = {"local"}
ALLOWED_VLM = {"river"}

# Đường dẫn weights embedding local mặc định khi không đặt EMBEDDING_MODEL_PATH
# (trong Docker, .env trỏ tới volume /app/weights).
_DEFAULT_LOCAL_EMBED_PATH = (
    Path(__file__).resolve().parent / "workflow" / "weights" / "Qwen3-Embedding-0.6B"
)


def database_url() -> str:
    url = os.getenv("DATABASE_URL") or os.getenv("DATABASE_URL_DOCKER") or ""
    if not url:
        raise RuntimeError(
            "Thiếu DATABASE_URL (hoặc DATABASE_URL_DOCKER) cho chatbot. "
            "Đặt DSN dạng postgresql://user:pass@postgres:5432/eyetracking"
        )
    return url


def llm_name() -> str:
    return os.getenv("LLM_NAME", "river").strip()


def embedding_name() -> str:
    return os.getenv("EMBEDDING_NAME", "local").strip()


def vlm_name() -> str:
    return os.getenv("VLM_NAME", "river").strip()


def embedding_dim() -> int:
    return int(os.getenv("EMBEDDING_DIM", "1024"))


def embedding_model_path() -> str:
    """Đường dẫn weights embedding local (EMBEDDING_NAME=local)."""
    return os.getenv("EMBEDDING_MODEL_PATH", str(_DEFAULT_LOCAL_EMBED_PATH))


def embedding_device() -> str:
    """Thiết bị suy luận embedding local: cuda | cpu (mặc định GPU)."""
    return os.getenv("EMBEDDING_DEVICE", "cuda").strip()


def embedding_local_files_only() -> bool:
    """True -> chỉ đọc weights đã tải, không tự gọi mạng."""
    value = os.getenv("EMBEDDING_LOCAL_FILES_ONLY", "true").strip().lower()
    return value not in {"0", "false", "no"}


def river_api_key() -> str:
    """API key River AI cho VLM (VLM_NAME=river)."""
    return os.getenv("RIVER_API_KEY", "").strip()


def river_base_url() -> str:
    """Base URL OpenAI-compatible của River AI."""
    return os.getenv("RIVER_BASE_URL", "https://api.river.ai/v1").strip()


def river_vlm_model() -> str:
    """Tên model VLM gọi qua River AI (mô tả slide lúc ingest)."""
    return os.getenv("RIVER_VLM_MODEL", "deepseek-ai/DeepSeek-V4.1-Flash-1017").strip()


def river_llm_model() -> str:
    """Tên model LLM gọi qua River AI (định tuyến/kiểm duyệt/sinh câu trả lời)."""
    return os.getenv("RIVER_LLM_MODEL", "deepseek-ai/DeepSeek-V4.1-Flash-1017").strip()


def rag_top_k() -> int:
    return int(os.getenv("RAG_TOP_K", "5"))


def rag_score_threshold() -> float:
    return float(os.getenv("RAG_SCORE_THRESHOLD", "0.3"))


def validate() -> None:
    """Kiểm tra cấu hình bắt buộc; raise RuntimeError gộp mọi vấn đề."""
    problems: list[str] = []

    if not (os.getenv("DATABASE_URL") or os.getenv("DATABASE_URL_DOCKER")):
        problems.append("thiếu DATABASE_URL/DATABASE_URL_DOCKER")

    if llm_name() not in ALLOWED_LLM:
        problems.append(
            f"LLM_NAME={llm_name()!r} không hợp lệ (chọn: {sorted(ALLOWED_LLM)})"
        )
    if embedding_name() not in ALLOWED_EMBEDDING:
        problems.append(
            f"EMBEDDING_NAME={embedding_name()!r} không hợp lệ "
            f"(chọn: {sorted(ALLOWED_EMBEDDING)})"
        )
    if vlm_name() not in ALLOWED_VLM:
        problems.append(
            f"VLM_NAME={vlm_name()!r} không hợp lệ (chọn: {sorted(ALLOWED_VLM)})"
        )
    if (llm_name() == "river" or vlm_name() == "river") and not river_api_key():
        problems.append("thiếu RIVER_API_KEY cho LLM_NAME/VLM_NAME=river")

    if problems:
        raise RuntimeError("Cấu hình chatbot không hợp lệ: " + "; ".join(problems))
