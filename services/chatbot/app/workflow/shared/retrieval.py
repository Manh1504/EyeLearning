"""Truy hồi ngữ nghĩa trên pgvector và dựng trích dẫn nguồn.

Slide đã được `Ingestion` (app/services/ingest.py) nhúng vector và lưu vào bảng
`lesson_content_embedding`. Module này:

1. Nhúng câu hỏi của sinh viên thành vector.
2. Tìm các slide gần nhất theo cosine (lọc theo course và ngưỡng điểm).
3. Dựng danh sách `Citation` để trả về cho người học.
4. Định dạng ngữ cảnh đánh số [1], [2]... để đưa vào prompt.
"""

import os
import threading

import psycopg
from pgvector import Vector
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row

from ..state import Citation, RetrievedDoc
from .providers import create_embedding
from app.settings import database_url

# Lấy slide kèm ngữ cảnh môn/chương/bài và điểm tương đồng cosine.
# pgvector dùng toán tử `<=>` (cosine distance); với vector đã chuẩn hóa thì
# `1 - distance` chính là cosine similarity trong khoảng [0, 1].
SEARCH_SQL = """
    SELECT
        lc.id,
        e.embedding_content AS content,

        c.title AS course_title,
        m.title AS module_title,
        l.title AS lesson_title,

        lc.image_url,

        1 - (e.embedding <=> %s) AS score

    FROM lesson_content_embedding e
    JOIN lesson_contents lc ON lc.id = e.lesson_content_id
    JOIN lessons l ON lc.lesson_id = l.id
    JOIN modules m ON l.module_id = m.id
    JOIN courses c ON m.course_id = c.id

    WHERE c.id = %s
      AND 1 - (e.embedding <=> %s) >= %s

    ORDER BY e.embedding <=> %s
    LIMIT %s
"""


class Retriever:
    """Kết nối PostgreSQL/pgvector và truy hồi slide theo câu hỏi."""

    def __init__(self):
        self.embedding = create_embedding(os.getenv("EMBEDDING_NAME"))

        # Cấu hình truy hồi, có thể chỉnh qua biến môi trường
        self.top_k = int(os.getenv("RAG_TOP_K", "5"))
        # Ngưỡng cosine khá chặt ở 0.7 -> nên hạ về ~0.3-0.5 rồi tinh chỉnh
        self.threshold = float(os.getenv("RAG_SCORE_THRESHOLD", "0.3"))

        self.conn = psycopg.connect(
            database_url(),
            autocommit=True,
        )
        register_vector(self.conn)

    def search(
        self,
        query: str,
        course_id: str,
        k: int | None = None,
        threshold: float | None = None,
    ) -> list[RetrievedDoc]:
        """Trả về các slide liên quan nhất cho `query` trong một course."""
        k = k or self.top_k
        threshold = self.threshold if threshold is None else threshold

        # `embed_query` kích hoạt query_encode_kwargs (đã kèm instruction prefix)
        vector = Vector(self.embedding.embed_query(query))

        with self.conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                SEARCH_SQL,
                (vector, course_id, vector, threshold, vector, k),
            )
            rows = cur.fetchall()

        return [dict(row) for row in rows]

    def close(self):
        self.conn.close()
        http = getattr(self.embedding, "http", None)
        if http is not None:
            http.close()


# --- Singleton: dùng chung 1 kết nối trong toàn bộ tiến trình -------------
_retriever: Retriever | None = None
_retriever_lock = threading.Lock()


def get_retriever() -> Retriever:
    """Lazy singleton để không mở nhiều kết nối DB không cần thiết."""
    global _retriever
    if _retriever is None:
        with _retriever_lock:
            if _retriever is None:
                _retriever = Retriever()
    return _retriever


def close_retriever() -> None:
    """Đóng kết nối singleton (gọi khi tắt service)."""
    global _retriever
    if _retriever is not None:
        _retriever.close()
        _retriever = None


# --- Dựng trích dẫn & ngữ cảnh --------------------------------------------
def build_citations(docs: list[RetrievedDoc]) -> list[Citation]:
    """Dựng trích dẫn trong code (không tin LLM tự bịa nguồn).

    `location` là URL ảnh slide để frontend hiển thị lại đúng trang.
    """
    return [
        Citation(
            document_id=str(doc["id"]),
            title=f"{doc['module_title']} - {doc['lesson_title']}",
            location=doc["image_url"],
        )
        for doc in docs
    ]


def format_context(docs: list[RetrievedDoc]) -> str:
    """Đánh số tài liệu [1], [2]... để LLM tham chiếu khi trả lời."""
    blocks = []
    for index, doc in enumerate(docs, start=1):
        header = (
            f"[{index}] {doc['course_title']} > "
            f"{doc['module_title']} > {doc['lesson_title']}"
        )
        blocks.append(f"{header}\n{doc['content']}")

    return "\n\n".join(blocks)
