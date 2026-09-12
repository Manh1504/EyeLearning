-- =====================================================================
-- 008_key_slides_coverage.sql — slide trọng tâm + độ bao phủ nội dung + điểm hoàn thành.
--
--   - lesson_contents.is_key: giáo viên đánh dấu slide trọng tâm (trọng số cao).
--   - lesson_contents.aoi_source: pdf | grid | none (nguồn AOI dùng đo độ bao phủ).
--   - aoi_regions.*: bổ sung siêu dữ liệu trích tự động từ PDF (pymupdf).
--   - slide_coverage_stats: độ bao phủ từng trang theo học viên.
--   - lesson_mastery_scores: điểm hoàn thành bài học (85% trang trọng tâm / 15% còn lại).
-- Idempotent.
-- =====================================================================

BEGIN;

ALTER TABLE lesson_contents ADD COLUMN IF NOT EXISTS is_key     BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE lesson_contents ADD COLUMN IF NOT EXISTS aoi_source VARCHAR(6) NOT NULL DEFAULT 'none';

ALTER TABLE aoi_regions ADD COLUMN IF NOT EXISTS source      VARCHAR(10) NOT NULL DEFAULT 'pdf';
ALTER TABLE aoi_regions ADD COLUMN IF NOT EXISTS weight      REAL NOT NULL DEFAULT 1;
ALTER TABLE aoi_regions ADD COLUMN IF NOT EXISTS char_count  INT NOT NULL DEFAULT 0;
ALTER TABLE aoi_regions ADD COLUMN IF NOT EXISTS block_index INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS slide_coverage_stats (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id     UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    lesson_content_id UUID NOT NULL REFERENCES lesson_contents(id) ON DELETE CASCADE,
    coverage          REAL NOT NULL DEFAULT 0 CHECK (coverage >= 0 AND coverage <= 1),
    dwell_ms          BIGINT NOT NULL DEFAULT 0,
    is_complete       BOOLEAN NOT NULL DEFAULT false,
    computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_slide_coverage_stats UNIQUE (enrollment_id, lesson_content_id)
);

CREATE INDEX IF NOT EXISTS idx_slide_coverage_enrollment ON slide_coverage_stats (enrollment_id);

CREATE TABLE IF NOT EXISTS lesson_mastery_scores (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    lesson_id    UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    score        REAL NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
    key_score    REAL NOT NULL DEFAULT 0,
    normal_score REAL NOT NULL DEFAULT 0,
    key_done     INT NOT NULL DEFAULT 0,
    key_total    INT NOT NULL DEFAULT 0,
    slides_done  INT NOT NULL DEFAULT 0,
    slides_total INT NOT NULL DEFAULT 0,
    computed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_lesson_mastery_scores UNIQUE (enrollment_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_lesson_mastery_lesson ON lesson_mastery_scores (lesson_id);

COMMIT;