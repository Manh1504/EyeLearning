BEGIN;

-- ============================================================================
-- 012 — Index vector cho RAG (pgvector HNSW) + chuẩn hoá số chiều embedding.
--
-- Trước đây bảng lesson_content_embedding dùng VECTOR(4096). pgvector chỉ tạo
-- được index HNSW/IVFFlat cho kiểu `vector` tối đa 2000 chiều, nên 4096 chiều
-- buộc phải quét tuần tự (exact search) → truy hồi chậm dần theo số slide.
--
-- Hệ thống nay dùng Qwen3-Embedding-0.6B (1024 chiều) → đủ điều kiện tạo index
-- HNSW cosine, khớp toán tử `<=>` mà Retriever (workflow/shared/retrieval.py)
-- đang dùng.
--
-- LƯU Ý: migrations chạy lại toàn bộ mỗi lần deploy (Dockerfile.migrations),
-- nên file này phải idempotent. Việc chuyển số chiều chỉ chạy khi cột vector
-- còn ở số chiều KHÁC 1024 (đổi model embedding thì phải re-ingest toàn bộ).
-- ============================================================================

DO $$
DECLARE
    current_dim integer;
BEGIN
    SELECT a.atttypmod
      INTO current_dim
      FROM pg_attribute a
     WHERE a.attrelid = to_regclass('lesson_content_embedding')
       AND a.attname = 'embedding';

    -- Bảng chưa tồn tại (migration 011 lo) hoặc đã đúng 1024 chiều → bỏ qua.
    IF current_dim IS NULL OR current_dim = 1024 THEN
        RETURN;
    END IF;

    -- Vector cũ không dùng lại được với model mới: xoá dữ liệu vector và đánh
    -- dấu toàn bộ slide để backend re-ingest (embedding_status='none').
    TRUNCATE TABLE lesson_content_embedding;

    ALTER TABLE lesson_content_embedding
        ALTER COLUMN embedding TYPE vector(1024);

    UPDATE lesson_contents
       SET embedding_status = 'none',
           embedding_error = NULL,
           embedding_updated_at = NULL
     WHERE embedding_status <> 'none';
END $$;

-- HNSW cosine: khớp `1 - (embedding <=> query)` của Retriever.
CREATE INDEX IF NOT EXISTS idx_lesson_content_embedding_hnsw
    ON lesson_content_embedding
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

COMMIT;
