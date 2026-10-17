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

from workflow.shared import create_embedding, create_vlm, SLIDE_VLM_PROMPT
from workflow.state import VLMOutput
from storage import FileStorage


logger = logging.getLogger(__name__)


class Ingestion:
    # Số chiều vector embedding, đọc từ env cho linh hoạt khi đổi EMBEDDING_NAME:
    #   local (Qwen3-Embedding-0.6B)      -> 1024
    #   api   (qwen3-embedding:8b-ctx16k) -> 4096
    VECTOR_DIM = int(os.getenv("EMBEDDING_DIM", "1024"))

    # Số ảnh tải trước, song song với lúc VLM đang xử lý slide hiện tại
    PREFETCH = 4

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
        self.conn = psycopg.connect(os.environ["DATABASE_URL"], autocommit=True)
        self._init_db()
        register_vector(self.conn)

    def _init_db(self):
        with self.conn.transaction():
            self.conn.execute("CREATE EXTENSION IF NOT EXISTS vector")

            self.conn.execute(f"""
                CREATE TABLE IF NOT EXISTS lesson_content_embedding (
                    lesson_content_id BIGINT PRIMARY KEY
                        REFERENCES lesson_contents(id)
                        ON DELETE CASCADE,

                    embedding_content TEXT NOT NULL,
                    embedding VECTOR({self.VECTOR_DIM}) NOT NULL
                )
            """)

            self.conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_lesson_content_embedding
                ON lesson_content_embedding
                USING hnsw (embedding vector_cosine_ops)
                WITH (m = 16, ef_construction = 64)
            """)

    # Lấy các slide chưa embedding theo từng batch (keyset pagination)
    def _load_slides(self, course_id: int, last_id: int, batch_size: int):
        query = self.SLIDE_QUERY + """
            WHERE c.id = %s
            AND lc.id > %s

            AND NOT EXISTS (
                SELECT 1
                FROM lesson_content_embedding e
                WHERE e.lesson_content_id = lc.id
            )

            ORDER BY lc.id
            LIMIT %s
        """

        with self.conn.cursor(row_factory=dict_row) as cur:
            cur.execute(query, (course_id, last_id, batch_size))
            return cur.fetchall()

    # Lấy một slide cụ thể
    def _load_slide(self, lesson_content_id: int):
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
    def _load_image(self, source: str, dpi: int = 150) -> str:
        file_bytes = self.storage.load(source)

        with pymupdf.open(stream=file_bytes) as doc:
            pix = doc[0].get_pixmap(dpi=dpi, alpha=False)
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

    # Embedding các slide cũ chưa có trong DB
    def embed_existing(self, course_id: int, batch_size: int = 20) -> int:
        last_id = 0
        total = 0

        while True:
            slides = self._load_slides(course_id, last_id, batch_size)
            if not slides:
                break

            # Cập nhật cursor trước khi xử lý batch
            last_id = slides[-1]["id"]

            total += self._embed_batch(slides)
            logger.info("Processed %s slides, last_id=%s", total, last_id)

        return total

    # Embedding một slide mới hoặc cập nhật lại
    def embed_new(self, lesson_content_id: int) -> None:
        slide = self._load_slide(lesson_content_id)
        self._embed_batch([slide])

    def close(self):
        self.conn.close()
        self.storage.http.close()