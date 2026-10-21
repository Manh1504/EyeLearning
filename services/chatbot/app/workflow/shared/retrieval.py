"""Truy hồi ngữ nghĩa trên pgvector và dựng trích dẫn nguồn.

Slide đã được `Ingestion` (app/services/ingest.py) nhúng vector và lưu vào bảng
`lesson_content_embedding`. Module này:

1. Nhúng câu hỏi của sinh viên thành vector.
2. Tìm các slide gần nhất theo cosine (ưu tiên đúng bài học, lọc theo ngưỡng điểm).
3. Dựng danh sách `Citation` để trả về cho người học.
4. Định dạng ngữ cảnh đánh số [1], [2]... để đưa vào prompt.

Kết nối DB mượn từ ConnectionPool dùng chung (app/db.py).
"""

import threading

from pgvector import Vector
from psycopg.rows import dict_row

from app.db import get_pool
from app.settings import embedding_name, rag_score_threshold, rag_top_k

from ..state import Citation, RetrievedDoc
from .providers import get_embedding

# Lấy slide kèm ngữ cảnh môn/chương/bài và điểm tương đồng cosine.
# pgvector dùng toán tử `<=>` (cosine distance); với vector đã chuẩn hóa thì
# `1 - distance` chính là cosine similarity trong khoảng [0, 1].
# Tham số `lesson_id` (có thể NULL) để giới hạn truy hồi trong đúng bài học đang
# hỏi; NULL = tìm trong toàn bộ khóa học.
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
      AND (%s::uuid IS NULL OR l.id = %s::uuid)
      AND 1 - (e.embedding <=> %s) >= %s

    ORDER BY e.embedding <=> %s
    LIMIT %s
"""


class Retriever:
    """Truy hồi slide theo câu hỏi trong phạm vi một course."""

    def __init__(self):
        self.embedding = get_embedding(embedding_name())

        self.top_k = rag_top_k()
        # Ngưỡng cosine; hạ ~0.3-0.5 rồi tinh chỉnh theo dữ liệu thực tế.
        self.threshold = rag_score_threshold()

    def _query(
        self,
        vector: Vector,
        course_id: str,
        lesson_id: str | None,
        threshold: float,
        k: int,
    ) -> list[dict]:
        with get_pool().connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
                cur.execute(
                    SEARCH_SQL,
                    (vector, course_id, lesson_id, lesson_id, vector, threshold, vector, k),
                )
                return [dict(row) for row in cur.fetchall()]

    def search(
        self,
        query: str,
        course_id: str,
        lesson_id: str | None = None,
        k: int | None = None,
        threshold: float | None = None,
    ) -> list[RetrievedDoc]:
        """Trả về các slide liên quan nhất cho `query` trong một course.

        Khi biết học viên đang ở bài học nào (`lesson_id`), ưu tiên slide của bài
        đó; nếu bài đó chưa có slide nào vượt ngưỡng thì nới ra toàn khóa học để
        không bao giờ trả về rỗng.
        """
        k = k or self.top_k
        threshold = self.threshold if threshold is None else threshold

        # `embed_query` kích hoạt query_encode_kwargs (đã kèm instruction prefix)
        vector = Vector(self.embedding.embed_query(query))

        rows = self._query(vector, course_id, lesson_id, threshold, k)
        if lesson_id is not None and len(rows) < k:
            seen = {row["id"] for row in rows}
            rows += [
                row
                for row in self._query(vector, course_id, None, threshold, k)
                if row["id"] not in seen
            ]
        return rows[:k]

    def close(self):
        # `self.embedding` là client dùng chung (lru_cache registry) -> KHÔNG đóng
        # ở đây; vòng đời của nó gắn với tiến trình.
        return


# --- Singleton: dùng chung 1 retriever trong toàn bộ tiến trình -------------
_retriever: Retriever | None = None
_retriever_lock = threading.Lock()


def get_retriever() -> Retriever:
    """Lazy singleton (connection thì mượn từ pool dùng chung)."""
    global _retriever
    if _retriever is None:
        with _retriever_lock:
            if _retriever is None:
                _retriever = Retriever()
    return _retriever


def close_retriever() -> None:
    """Đóng tài nguyên retriever (không đóng pool dùng chung)."""
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
