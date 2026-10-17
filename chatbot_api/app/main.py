"""FastAPI service bọc graph LangGraph.

Chạy:
    uvicorn app.main:app --reload

Mỗi hội thoại định danh bằng `thread_id`; lịch sử được lưu trong PostgreSQL
qua PostgresSaver (langgraph-checkpoint-postgres) nên ngữ cảnh vẫn còn sau
khi service khởi động lại.
"""

import os
from contextlib import ExitStack, asynccontextmanager

from dotenv import load_dotenv

load_dotenv()

import psycopg
from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from langchain_core.messages import HumanMessage
from langgraph.checkpoint.postgres import PostgresSaver

from workflow.graph import build_graph
from workflow.shared.retrieval import close_retriever, get_retriever
from app.schemas import ChatRequest, ChatResponse
from app.ingest_api import close_ingestion, router as ingest_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Khởi tạo checkpointer + graph một lần, giải phóng khi tắt service."""
    with ExitStack() as stack:
        # PostgresSaver.from_conn_string trả về context manager; giữ nó mở
        # trong suốt vòng đời ứng dụng để không mở lại kết nối mỗi request.
        checkpointer = stack.enter_context(
            PostgresSaver.from_conn_string(os.environ["DATABASE_URL"])
        )
        checkpointer.setup()  # tạo bảng checkpoint nếu chưa có

        # Kết nối truy hồi dùng psycopg riêng; mở sẵn cho request đầu tiên.
        get_retriever()

        app.state.graph = build_graph(checkpointer=checkpointer)

        try:
            yield
        finally:
            close_retriever()
            close_ingestion()


app = FastAPI(title="LMS Study Chatbot", lifespan=lifespan)
app.include_router(ingest_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: Request, payload: ChatRequest):
    """Nhận câu hỏi, chạy graph và trả câu trả lời kèm trích dẫn."""
    graph = request.app.state.graph

    config = {"configurable": {"thread_id": payload.thread_id}}
    inputs = {
        "messages": [HumanMessage(content=payload.message)],
        "course_id": payload.course_id,
        # reset bộ đếm kiểm duyệt mỗi lượt hỏi
        "attempts": 0,
    }

    # Graph + retriever là sync -> chạy trong threadpool để không chặn event loop
    result = await run_in_threadpool(graph.invoke, inputs, config)

    return ChatResponse(
        answer=result.get("draft_response") or "",
        citations=result.get("citations") or [],
        intent=result.get("intent"),
    )
