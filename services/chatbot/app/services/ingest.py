import os
import base64
import logging
from concurrent.futures import ThreadPoolExecutor

import psycopg
import pymupdf

from pgvector import Vector
from pgvector.psycopg import register_vector
from psycopg.rows import dict_row

from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage

from app.workflow.shared import create_embedding, create_vlm, SLIDE_VLM_PROMPT
from app.workflow.state import VLMOutput
from app.services.storage import FileStorage
from app.settings import database_url


logger = logging.getLogger(__name__)


class Ingestion:
    # Số chiều vector embedding, đọc từ env cho linh hoạt khi đổi EMBEDDING_NAME:
    #   api   (qwen3-embedding:8b-ctx16k) -> 4096 (production)
    #   local (Qwen3-Embedding-0.6B)      -> 1024
    # Phải khớp VECTOR(<dim>) của bảng lesson_content_embedding (migration 011).
    VECTOR_DIM = int(os.getenv("EMBEDDING_DIM", "4096"))

    # Số ảnh tải trước, song song với lúc VLM đang xử lý slide hiện tại
    PREFETCH = 4

    # DPI render trang PDF nguồn (ảnh raster đã render sẵn thì giữ nguyên pixel)
    PDF_RENDER_DPI = 150

    # SQL lấy thông tin slide kèm ngữ cảnh môn/chương/bài
    SLIDE_QUERY = """
        SELECT
            lc.id,
            lc.image_url,

            c.title AS course_title,
            m.title AS module_title,
            l.title AS lesson_title

        FROM lesson_contents lc
        JOIN lessons l ON lc.lesson_id = l.id
        JOIN modules m ON l.module_id = m.id
        JOIN courses c ON m.course_id = c.id
    """

    def __init__(self):
        # Khởi tạo VLM và embedding model
        vlm = create_vlm(os.getenv("VLM_NAME"))
        self.slide_to_text_chain = (
            self._create_chat_messages()
            | vlm.with_structured_output(VLMOutput)
        )
        self.embedding = create_embedding(os.getenv("EMBEDDING_NAME"))

        # Khởi tạo storage (local / S3 / R2 / URL)
        self.storage = FileStorage()

        # Kết nối DB
        self.conn = psycopg.connect(database_url(), autocommit=True)
        register_vector(self.conn)
        self._verify_vector_dim()

    # Fail-fast nếu EMBEDDING_DIM lệch số chiều của cột vector trong DB, thay vì
    # để lỗi khó hiểu của pgvector nổ ra ở lần ingest đầu tiên.
    def _verify_vector_dim(self) -> None:
        with self.conn.cursor() as cur:
            cur.execute(
                """
                SELECT a.atttypmod
                FROM pg_attribute a
                WHERE a.attrelid = to_regclass('lesson_content_embedding')
                  AND a.attname = 'embedding'
                """
            )
            row = cur.fetchone()

        if row is None:
            raise RuntimeError(
                "Không tìm thấy cột lesson_content_embedding.embedding — "
                "hãy chạy migration 011_quiz_and_embeddings.sql trước."
            )

        column_dim = int(row[0])
        if column_dim != self.VECTOR_DIM:
            raise RuntimeError(
                f"EMBEDDING_DIM={self.VECTOR_DIM} không khớp VECTOR({column_dim}) của "
                "lesson_content_embedding.embedding. Sửa EMBEDDING_DIM (và "
                "EMBEDDING_NAME/MODEL) cho khớp, hoặc tạo migration đổi số chiều "
                "rồi re-ingest toàn bộ slide."
            )
        logger.info("Embedding dimension khớp DB: vector(%s)", column_dim)

    # Lấy một slide cụ thể
    def _load_slide(self, lesson_content_id: str):
        query = self.SLIDE_QUERY + " WHERE lc.id = %s"

        with self.conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, (lesson_content_id,))
            return cur.fetchone()

    # Template đưa ảnh slide cho VLM
    def _create_chat_messages(self):
        return ChatPromptTemplate.from_messages([
            SystemMessage(content=SLIDE_VLM_PROMPT),
            ("human", [
                {"type": "text", "text": "Chuyển slide sau thành text."},
                {
                    "type": "image_url",
                    "image_url": {"url": "data:image/png;base64,{b64}"},
                },
            ]),
        ])

    # Tải ảnh từ storage và render thành PNG base64 (phần I/O)
    def _load_image(self, source: str) -> str:
        file_bytes = self.storage.load(source)

        with pymupdf.open(stream=file_bytes) as doc:
            if doc.is_pdf:
                # PDF nguồn: render trang đầu ở DPI đủ nét cho VLM
                pix = doc[0].get_pixmap(dpi=self.PDF_RENDER_DPI, alpha=False)
            else:
                # Ảnh slide đã được backend render sẵn (144dpi): giữ nguyên
                # pixel. Render lại ở dpi=150 sẽ upscale ~2x vô ích vì PyMuPDF
                # coi 1px = 1pt cho ảnh raster.
                pix = doc[0].get_pixmap(alpha=False)
            return base64.b64encode(pix.tobytes("png")).decode("ascii")

    # VLM mô tả ảnh thành text (chạy tuần tự vì dùng GPU local)
    def _describe_image(self, b64: str) -> str:
        return self.slide_to_text_chain.invoke({"b64": b64}).transcript

    # Bổ sung ngữ cảnh môn/chương/bài vào nội dung
    def _add_context(
        self,
        course_name: str,
        chapter_name: str,
        lesson_name: str | None = None,
    ) -> str:
        fields = [
            ("Môn học", course_name),
            ("Chương", chapter_name),
            ("Bài học", lesson_name),
        ]

        return "\n".join(
            f"{label}: {value.strip()}"
            for label, value in fields
            if value and value.strip()
        )

    # Pipeline 1 batch: Slide -> VLM -> Embedding -> DB
    def _embed_batch(self, slides: list[dict]) -> int:
        # 1. Gửi tải ảnh chạy trước; VLM xử lý slide nào thì ảnh đã sẵn
        with ThreadPoolExecutor(max_workers=self.PREFETCH) as pool:
            futures = [
                pool.submit(self._load_image, slide["image_url"])
                for slide in slides
            ]

            content_by_id = []
            for slide, future in zip(slides, futures):
                markdown = self._describe_image(future.result())

                context = self._add_context(
                    slide["course_title"],
                    slide["module_title"],
                    slide["lesson_title"],
                )

                content = (
                    f"{context}\n\n{markdown}" if context else markdown
                )
                content_by_id.append((slide["id"], content))

        # 2. Embedding cả batch một lần
        contents = [content for _, content in content_by_id]
        vectors = self.embedding.embed_documents(texts=contents)

        # 3. Lưu vào PostgreSQL (upsert)
        data = [
            (slide_id, content, Vector(vector))
            for (slide_id, content), vector in zip(content_by_id, vectors)
        ]

        with self.conn.transaction():
            with self.conn.cursor() as cur:
                cur.executemany("""
                    INSERT INTO lesson_content_embedding (
                        lesson_content_id,
                        embedding_content,
                        embedding
                    )
                    VALUES (%s, %s, %s)

                    ON CONFLICT (lesson_content_id)
                    DO UPDATE SET
                        embedding_content = EXCLUDED.embedding_content,
                        embedding = EXCLUDED.embedding
                """, data)

        return len(data)

    # Embedding một slide mới hoặc cập nhật lại
    def embed_new(self, lesson_content_id: str) -> int:
        slide = self._load_slide(lesson_content_id)
        if slide is None:
            raise LookupError(lesson_content_id)
        return self._embed_batch([slide])

    def close(self):
        self.conn.close()
        self.storage.http.close()
