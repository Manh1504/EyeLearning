"""Factory tạo LLM / embedding / VLM theo tên trong biến môi trường.

Các factory được **cache** (`get_llm`/`get_embedding`/`get_vlm`) để cả tiến trình
dùng chung một client cho mỗi loại model thay vì mỗi node tạo một instance.

LLM (định tuyến / kiểm duyệt / sinh câu trả lời) và VLM (mô tả slide lúc ingest)
đều gọi qua **River AI** — endpoint OpenAI-compatible, KHÔNG tốn VRAM local.
Embedding chạy local (Qwen3-Embedding-0.6B trên GPU).

`message_text` chuẩn hóa nội dung model trả về thành string.
"""

import os
from functools import lru_cache

from langchain_core.embeddings import Embeddings
from langchain_core.language_models import BaseChatModel
from langchain_openai import ChatOpenAI

from app.settings import embedding_device as _embedding_device
from app.settings import embedding_local_files_only as _embedding_local_files_only
from app.settings import embedding_model_path as _embedding_model_path
from app.settings import embedding_name as _embedding_name
from app.settings import llm_name as _llm_name
from app.settings import river_api_key as _river_api_key
from app.settings import river_base_url as _river_base_url
from app.settings import river_llm_model as _river_llm_model
from app.settings import river_vlm_model as _river_vlm_model
from app.settings import vlm_name as _vlm_name


def _river_chat(model: str, max_tokens: int) -> ChatOpenAI:
    """Client ChatOpenAI trỏ tới River AI (LLM và VLM dùng chung cấu hình)."""
    return ChatOpenAI(
        model=model,
        base_url=_river_base_url(),
        api_key=_river_api_key(),
        temperature=0,
        max_tokens=max_tokens,
        timeout=float(os.getenv("RIVER_TIMEOUT", "180")),
        max_retries=int(os.getenv("RIVER_MAX_RETRIES", "2")),
    )


def _build_llm(name: str) -> BaseChatModel:
    if name == "river":
        # max_tokens đủ rộng vì model có "reasoning" (token suy luận tính vào output).
        return _river_chat(
            _river_llm_model(), int(os.getenv("RIVER_LLM_MAX_TOKENS", "4096"))
        )
    raise ValueError(f"LLM không được hỗ trợ: {name!r}")


@lru_cache(maxsize=None)
def get_llm(name: str | None = None) -> BaseChatModel:
    """LLM dùng chung (cache theo tên). Mặc định lấy từ LLM_NAME."""
    return _build_llm(name or _llm_name())


def _build_embedding(name: str) -> Embeddings:
    if name == "local":
        # Import muộn để đường không cần embedding local khỏi kéo torch/sentence-transformers.
        # Weights do scripts/download_embedding.py tải sẵn vào EMBEDDING_MODEL_PATH.
        from langchain_huggingface import HuggingFaceEmbeddings

        return HuggingFaceEmbeddings(
            model_name=_embedding_model_path(),
            model_kwargs={
                "device": _embedding_device(),
                "local_files_only": _embedding_local_files_only(),
            },
            encode_kwargs={"batch_size": 8, "normalize_embeddings": True},
            query_encode_kwargs={
                "normalize_embeddings": True,
                "prompt": (
                    "Instruct: Retrieve relevant educational documents for "
                    "answering student questions.\nQuery: "
                ),
            },
        )
    raise ValueError(f"Embedding không được hỗ trợ: {name!r}")


@lru_cache(maxsize=None)
def get_embedding(name: str | None = None) -> Embeddings:
    """Embedding dùng chung (cache theo tên). Mặc định từ EMBEDDING_NAME."""
    return _build_embedding(name or _embedding_name())


def _build_vlm(name: str) -> BaseChatModel:
    if name == "river":
        return _river_chat(
            _river_vlm_model(), int(os.getenv("RIVER_VLM_MAX_TOKENS", "16384"))
        )
    raise ValueError(f"VLM không được hỗ trợ: {name!r}")


@lru_cache(maxsize=None)
def get_vlm(name: str | None = None) -> BaseChatModel:
    """VLM dùng chung (cache theo tên). Mặc định từ VLM_NAME."""
    return _build_vlm(name or _vlm_name())


def message_text(content: object) -> str:
    """Chuẩn hóa nội dung trả về của model thành string."""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and isinstance(block.get("text"), str):
                parts.append(block["text"])
        return "".join(parts)
    return str(content) if content is not None else ""
