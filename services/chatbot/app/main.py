"""FastAPI service bọc graph LangGraph.

Chạy:
    uvicorn app.main:app --reload

Mỗi hội thoại định danh bằng `thread_id`; lịch sử được lưu trong PostgreSQL
qua PostgresSaver (langgraph-checkpoint-postgres) nên ngữ cảnh vẫn còn sau
khi service khởi động lại.

Endpoint vận hành:
    GET /health -> liveness, luôn 200
    GET /ready  -> readiness, 503 khi DB không truy cập được
"""

import logging
import os
import re
import secrets
import time
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.postgres import PostgresSaver

from app.api.ingest import close_ingestion
from app.api.ingest import router as ingest_router
from app.db import close_pool, get_pool
from app.schemas import ChatRequest, ChatResponse
from app.settings import embedding_name
from app.settings import validate as validate_settings
from app.workflow.graph import build_graph
from app.workflow.shared import get_embedding, message_text
from app.workflow.shared.retrieval import close_retriever

logger = logging.getLogger("app.chat")


def require_internal_token(x_chatbot_token: str = Header(default="")) -> None:
    expected = os.getenv("CHATBOT_INTERNAL_TOKEN", "")
    if not expected or not secrets.compare_digest(x_chatbot_token, expected):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Khởi tạo checkpointer + graph một lần, giải phóng khi tắt service."""
    validate_settings()
    # Warm-up embedding (local: load weights lên GPU) để /ready phản ánh đúng và
    # request đầu không phải chờ load model.
    get_embedding(embedding_name())
    # Một ConnectionPool dùng chung cho checkpointer + retriever + ingestion, để
    # nhiều request /chat song song không tranh nhau 1 connection.
    pool = get_pool()
    checkpointer = PostgresSaver(pool)
    # LangGraph owns this schema and keeps setup idempotent across versions.
    checkpointer.setup()
    app.state.checkpointer = checkpointer
    app.state.graph = build_graph(checkpointer=checkpointer)

    try:
        yield
    finally:
        close_retriever()
        close_ingestion()
        close_pool()


app = FastAPI(title="LMS Study Chatbot", lifespan=lifespan)
app.include_router(ingest_router, dependencies=[Depends(require_internal_token)])


def _db_reachable() -> None:
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/ready")
async def ready():
    try:
        await run_in_threadpool(_db_reachable)
    except Exception:
        return JSONResponse({"status": "degraded"}, status_code=503)
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse, dependencies=[Depends(require_internal_token)])
async def chat(request: Request, payload: ChatRequest):
    """Nhận câu hỏi, chạy graph và trả câu trả lời kèm trích dẫn."""
    graph = request.app.state.graph

    config = {"configurable": {"thread_id": payload.thread_id}}
    inputs = {
        "messages": [HumanMessage(content=payload.message)],
        "course_id": payload.course_id,
        # `lesson_id` được dùng để ưu tiên truy hồi slide của đúng bài học;
        # `resource_id` là bài tập đang mở (nếu có).
        "lesson_id": payload.lesson_id,
        "resource_id": payload.assignment_id,
        "assignment_title": payload.assignment_title,
        "lesson_title": payload.lesson_title,
        "module_title": payload.module_title,
        "assignment_context": payload.assignment_context,
        "support_mode": payload.support_mode,
        # reset bộ đếm kiểm duyệt mỗi lượt hỏi
        "attempts": 0,
    }

    # Graph + retriever là sync -> chạy trong threadpool để không chặn event loop
    started = time.perf_counter()
    result = await run_in_threadpool(graph.invoke, inputs, config)
    logger.info(
        "chat intent=%s citations=%d guardrail_blocked=%s elapsed_ms=%.0f",
        result.get("intent"),
        len(result.get("citations") or []),
        bool(result.get("guardrail_blocked")),
        (time.perf_counter() - started) * 1000,
    )

    citations = result.get("citations") or []
    answer = message_text(result.get("draft_response"))
    # Bỏ các nhãn trích dẫn không tồn tại (chỉ giữ [1]..[len(citations)]).
    answer = re.sub(
        r"\[(\d+)\]",
        lambda match: match.group(0) if 1 <= int(match.group(1)) <= len(citations) else "",
        answer,
    )
    return ChatResponse(
        answer=answer,
        citations=citations,
        intent=result.get("intent"),
    )


@app.delete("/threads/{thread_id}", dependencies=[Depends(require_internal_token)])
async def delete_thread(request: Request, thread_id: str):
    """Xoá bộ nhớ hội thoại của một phiên (khi sinh viên xoá phiên bên backend).

    Best-effort: gọi nhiều lần vẫn an toàn (xoá thread không tồn tại là no-op).
    """
    checkpointer = request.app.state.checkpointer
    await run_in_threadpool(checkpointer.delete_thread, thread_id)
    return {"status": "ok", "thread_id": thread_id}
