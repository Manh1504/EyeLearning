"""Ingest slide: render ảnh -> VLM mô tả -> embedding -> lưu pgvector.

Kết nối DB mượn từ ConnectionPool dùng chung (app/db.py). Mỗi slide được xử lý
độc lập: một slide lỗi (ảnh thiếu, PDF hỏng) chỉ bị bỏ qua chứ không làm hỏng cả
batch; riêng lỗi VLM (River AI không gọi được) vẫn được ném ra để API trả 503.
"""

import base64
import logging
import os
from concurrent.futures import ThreadPoolExecutor

import openai
import pymupdf
from langchain_core.messages import SystemMessage
from langchain_core.prompts import ChatPromptTemplate
from pgvector import Vector
from psycopg.rows import dict_row

from app.db import get_pool
from app.services.storage import FileStorage
from app.settings import embedding_dim, embedding_name, vlm_name
from app.workflow.shared import SLIDE_VLM_PROMPT, get_embedding, get_vlm
from app.workflow.state import VLMOutput

logger = logging.getLogger(__name__)


class VLMUnavailableError(RuntimeError):
    """Không gọi được VLM (River AI): mất mạng, timeout hoặc lỗi tạm thời 5xx/429.

    Được API layer ánh xạ thành HTTP 503 (tạm thời) thay vì 500 để backend có
    thể retry và để thông báo lỗi rõ ràng hơn.
    """


class Ingestion:
    # Số chiều vector embedding, đọc từ env cho linh hoạt khi đổi EMBEDDING_NAME:
    #   local (Qwen3-Embedding-0.6B)      -> 1024 (mặc định)
    #   api   (qwen3-embedding:8b-ctx16k) -> 4096
    # Phải khớp VECTOR(<dim>) của bảng lesson_content_embedding (migration 012
    # đặt cột về 1024 + tạo index HNSW).
    VECTOR_DIM = embedding_dim()

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
        # Khởi tạo VLM và embedding model (dùng chung theo registry)
        vlm = get_vlm(vlm_name())
        self.slide_to_text_chain = (
            self._create_chat_messages()
            # `function_calling` cho Markdown/bảng sạch hơn `json_schema` với
            # DeepSeek-V4.1-Flash qua River AI (đã kiểm thử cả hai).
            | vlm.with_structured_output(VLMOutput, method="function_calling")
        )
        self.embedding = get_embedding(embedding_name())

        # Khởi tạo storage (local / S3 / R2 / URL)
        self.storage = FileStorage()

        # Pool mặc định lấy từ singleton; test có thể gán pool giả.
        self._pool = None
        self._verify_vector_dim()

    # Trả về context manager cấp 1 connection.
    def _connection(self):
        return (self._pool or get_pool()).connection()

    # Fail-fast nếu EMBEDDING_DIM lệch số chiều của cột vector trong DB, thay vì
    # để lỗi khó hiểu của pgvector nổ ra ở lần ingest đầu tiên.
    def _verify_vector_dim(self) -> None:
        with self._connection() as conn:
            with conn.cursor() as cur:
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

        column_dim = int(row[0]) if not isinstance(row, dict) else int(row["atttypmod"])
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

        with self._connection() as conn:
            with conn.cursor(row_factory=dict_row) as cur:
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
                # Ảnh slide đã được backend render sẵn: giữ nguyên pixel.
                pix = doc[0].get_pixmap(alpha=False)
            return base64.b64encode(pix.tobytes("png")).decode("ascii")

    # VLM mô tả ảnh thành text qua River AI (API, không tốn VRAM local)
    def _describe_image(self, b64: str) -> str:
        try:
            return self.slide_to_text_chain.invoke({"b64": b64}).transcript
        except openai.APITimeoutError as exc:
            raise VLMUnavailableError(
                "VLM (River AI) không phản hồi kịp thời gian."
            ) from exc
        except openai.APIConnectionError as exc:
            base = os.getenv("RIVER_BASE_URL", "https://api.river.ai/v1")
            raise VLMUnavailableError(
                f"Không kết nối được VLM (River AI) tại {base}. "
                "Kiểm tra mạng và RIVER_BASE_URL."
            ) from exc
        except openai.APIStatusError as exc:
            # 429/5xx là tạm thời -> 503 để backend retry. 4xx khác (401/400) là
            # lỗi cấu hình/dữ liệu -> để slide bị đánh dấu failed, không retry mù.
            if exc.status_code == 429 or exc.status_code >= 500:
                raise VLMUnavailableError(
                    f"VLM (River AI) tạm thời không khả dụng (HTTP {exc.status_code})."
                ) from exc
            raise

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
    def _embed_batch(self, slides: list[dict]) -> tuple[int, int]:
        """Trả về (processed, failed). Mỗi slide lỗi bị bỏ qua (trừ lỗi VLM)."""
        content_by_id: list[tuple[str, str]] = []
        failed = 0

        # 1. Tải ảnh chạy trước; VLM xử lý slide nào thì ảnh đã sẵn.
        with ThreadPoolExecutor(max_workers=self.PREFETCH) as pool:
            futures = [
                pool.submit(self._load_image, slide["image_url"]) for slide in slides
            ]

            for slide, future in zip(slides, futures):
                try:
                    markdown = self._describe_image(future.result())
                except VLMUnavailableError:
                    raise  # VLM API hỏng -> để API trả 503
                except Exception:
                    logger.exception("Bỏ qua slide %s do lỗi xử lý", slide.get("id"))
                    failed += 1
                    continue

                context = self._add_context(
                    slide["course_title"],
                    slide["module_title"],
                    slide["lesson_title"],
                )
                content = f"{context}\n\n{markdown}" if context else markdown
                content_by_id.append((slide["id"], content))

        if not content_by_id:
            return 0, failed

        # 2. Embedding cả batch một lần
        contents = [content for _, content in content_by_id]
        vectors = self.embedding.embed_documents(texts=contents)

        # 3. Lưu vào PostgreSQL (upsert)
        data = [
            (slide_id, content, Vector(vector))
            for (slide_id, content), vector in zip(content_by_id, vectors)
        ]

        with self._connection() as conn:
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.executemany(
                        """
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
                        """,
                        data,
                    )

        return len(data), failed

    # Embedding một slide mới hoặc cập nhật lại
    def embed_new(self, lesson_content_id: str) -> tuple[int, int]:
        slide = self._load_slide(lesson_content_id)
        if slide is None:
            raise LookupError(lesson_content_id)
        return self._embed_batch([slide])

    def close(self):
        # storage.http do Ingestion sở hữu. `self.embedding` là client dùng chung
        # (registry) nên không đóng ở đây.
        self.storage.http.close()
