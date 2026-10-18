import os
from pathlib import Path

import httpx
from langchain_google_genai import ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings
from langchain_deepseek import ChatDeepSeek
from langchain_ollama import ChatOllama
from langchain_core.language_models import BaseChatModel
from langchain_core.embeddings import Embeddings


# Model embedding mặc định cho API kiểu Ollama (override qua EMBEDDING_MODEL)
DEFAULT_API_EMBED_MODEL = "qwen3-embedding:8b-ctx16k"

# Model embedding local mặc định: app/workflow/weights/Qwen3-Embedding-0.6B.
# Override bằng EMBEDDING_MODEL_PATH khi chạy ở môi trường khác (vd Docker).
DEFAULT_LOCAL_EMBED_PATH = str(
    Path(__file__).resolve().parents[1] / "weights" / "Qwen3-Embedding-0.6B"
)


class OllamaAPIEmbeddings(Embeddings):
    """Embedding qua HTTP API kiểu Ollama, dùng cho EMBEDDING_NAME="api".

    Gửi POST tới OLLAMA_API_URL với body {"model": ..., "input": [...]} kèm
    header "x-ollama-seckey". Endpoint trả về {"embeddings": [[...], ...]}.
    """

    def __init__(
        self,
        url: str | None = None,
        secret: str | None = None,
        model: str | None = None,
    ):
        self.url = url or os.environ["OLLAMA_API_URL"]
        self.secret = secret or os.environ["OLLAMA_SECKEY"]
        self.model = model or os.getenv("EMBEDDING_MODEL", DEFAULT_API_EMBED_MODEL)

        # Tái sử dụng 1 client để tận dụng connection pooling
        self.http = httpx.Client(
            timeout=float(os.getenv("OLLAMA_TIMEOUT", "120"))
        )

    def _embed(self, texts: list[str]) -> list[list[float]]:
        response = self.http.post(
            self.url,
            headers={
                "Content-Type": "application/json",
                "x-ollama-seckey": self.secret,
            },
            json={"model": self.model, "input": texts},
        )
        response.raise_for_status()
        data = response.json()

        # Endpoint /api/embed trả "embeddings"; vài biến thể trả "embedding"
        embeddings = data.get("embeddings")
        if embeddings is None and "embedding" in data:
            embeddings = [data["embedding"]]
        if embeddings is None:
            raise ValueError(
                "Phản hồi embedding không hợp lệ, thiếu 'embeddings': "
                f"{list(data)}"
            )

        expected_dim = int(os.getenv("EMBEDDING_DIM", "4096"))
        if len(embeddings) != len(texts):
            raise ValueError("Số vector embedding không khớp số văn bản")
        if any(len(vector) != expected_dim for vector in embeddings):
            raise ValueError(f"Embedding phải có đúng {expected_dim} chiều")
        return embeddings

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed(list(texts))

    def embed_query(self, text: str) -> list[float]:
        return self._embed([text])[0]


def create_llm(llm_name: str) -> BaseChatModel:
    if llm_name == "gemini":
        return ChatGoogleGenerativeAI(
            model=os.getenv("GEMINI_LLM_MODEL", "gemini-flash-lite-latest"),
            temperature=0,
            timeout=float(os.getenv("GEMINI_TIMEOUT", "45")),
            max_retries=int(os.getenv("GEMINI_MAX_RETRIES", "1")),
        )
    elif llm_name == "deepseek":
        return ChatDeepSeek(
            model=os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
            temperature=0,
        )
    elif llm_name == "local":
        return ChatOllama(
            model=os.getenv("OLLAMA_LLM_MODEL", "qwen3.5:9b"),
            temperature=0,
            reasoning=False,
            num_predict=int(os.getenv("OLLAMA_NUM_PREDICT", "512")),
        )

    raise ValueError(f"LLM không được hỗ trợ: {llm_name!r}")

def create_embedding(embedding_name: str) -> Embeddings:
    if embedding_name == "local":
        # Import muộn: container thường chỉ dùng embedding qua API ("api"/"gemini")
        # nên không cần cài langchain-huggingface/sentence-transformers (rất nặng).
        from langchain_huggingface import HuggingFaceEmbeddings

        embedding = HuggingFaceEmbeddings(
            model_name=os.getenv("EMBEDDING_MODEL_PATH", DEFAULT_LOCAL_EMBED_PATH),
            model_kwargs={
                "device": os.getenv("EMBEDDING_DEVICE", "cuda"),
                "local_files_only": True
            },
            encode_kwargs={
                "batch_size": 8,
                "normalize_embeddings": True
            },
            query_encode_kwargs={
                "normalize_embeddings": True,
                "prompt": (
                        "Instruct: Retrieve relevant educational documents for answering student questions.\n"
                        "Query: "
                )
            }
        )

    elif embedding_name == "gemini":
        embedding = GoogleGenerativeAIEmbeddings(
            model="gemini-embedding-2",
            output_dimensionality=int(os.getenv("EMBEDDING_DIM", "4096")),
        )        

    elif embedding_name == "api":
        embedding = OllamaAPIEmbeddings()

    else:
        raise ValueError(f"Embedding không được hỗ trợ: {embedding_name!r}")

    return embedding

def create_vlm(vlm_name: str) -> BaseChatModel:
    if vlm_name == "local":
        vlm = ChatOllama(
            model=os.getenv("OLLAMA_VLM_MODEL", "qwen3-vl:8b-instruct"),
            temperature=0,
            reasoning=False
        )
    else:
        raise ValueError(f"VLM không được hỗ trợ: {vlm_name!r}")

    return vlm

def message_text(content: object) -> str:
    """Chuẩn hóa nội dung trả về của model thành string.

    Gemini có thể trả list content block; Ollama trả string. Ghép các phần text.
    """
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
