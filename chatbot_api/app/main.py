"""FastAPI service bọc graph LangGraph.

Chạy:
    uvicorn app.main:app --reload

Mỗi hội thoại định danh bằng `thread_id`; lịch sử được lưu trong PostgreSQL
qua PostgresSaver (langgraph-checkpoint-postgres) nên ngữ cảnh vẫn còn sau
khi service khởi động lại.
"""

import os
import re
import secrets
from contextlib import ExitStack, asynccontextmanager

from dotenv import load_dotenv

load_dotenv()
if not os.getenv("GOOGLE_API_KEY") and os.getenv("GEMINI_API_KEY"):
    os.environ["GOOGLE_API_KEY"] = os.environ["GEMINI_API_KEY"]

import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.postgres import PostgresSaver

from workflow.graph import build_graph
from workflow.shared.retrieval import close_retriever
from app.settings import database_url
from app.schemas import ChatRequest, ChatResponse
from app.ingest_api import close_ingestion, router as ingest_router


def require_internal_token(x_chatbot_token: str = Header(default="")) -> None:
    expected = os.getenv("CHATBOT_INTERNAL_TOKEN", "")
    if not expected or not secrets.compare_digest(x_chatbot_token, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


def _as_text(content: object) -> str:
    """Chuẩn hóa nội dung model trả về thành string.

    Gemini có thể trả list các content block (vd text kèm metadata) thay vì
    string; Ollama luôn trả string. Ta ghép các phần text lại.
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



@asynccontextmanager
async def lifespan(app: FastAPI):
    """Khởi tạo checkpointer + graph một lần, giải phóng khi tắt service."""
    with ExitStack() as stack:
        # PostgresSaver.from_conn_string trả về context manager; giữ nó mở
        # trong suốt vòng đời ứng dụng để không mở lại kết nối mỗi request.
        checkpointer = stack.enter_context(
            PostgresSaver.from_conn_string(database_url())
        )
        # LangGraph owns this schema and keeps setup idempotent across versions.
        checkpointer.setup()
        app.state.graph = build_graph(checkpointer=checkpointer)

        try:
            yield
        finally:
            close_retriever()
            close_ingestion()


app = FastAPI(title="LMS Study Chatbot", lifespan=lifespan)
app.include_router(ingest_router, dependencies=[Depends(require_internal_token)])


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(require_internal_token)])
async def chat(request: Request, payload: ChatRequest):
    """Nhận câu hỏi, chạy graph và trả câu trả lời kèm trích dẫn."""
    graph = request.app.state.graph

    config = {"configurable": {"thread_id": payload.thread_id}}
    inputs = {
        "messages": [HumanMessage(content=payload.message)],
        "course_id": payload.course_id,
        "assignment_context": payload.assignment_context,
        "support_mode": payload.support_mode,
        # reset bộ đếm kiểm duyệt mỗi lượt hỏi
        "attempts": 0,
    }

    # Graph + retriever là sync -> chạy trong threadpool để không chặn event loop
    result = await run_in_threadpool(graph.invoke, inputs, config)

    citations = result.get("citations") or []
    answer = _as_text(result.get("draft_response"))
    answer = re.sub(
        r"\[(\d+)\]",
        lambda match: match.group(0) if int(match.group(1)) <= len(citations) else "",
        answer,
    )
    return ChatResponse(
        answer=answer,
        citations=citations,
        intent=result.get("intent"),
    )
