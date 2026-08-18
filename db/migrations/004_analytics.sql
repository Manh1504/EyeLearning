-- =====================================================================
-- 004_analytics.sql — bảng analytics + sửa hash mật khẩu seed
-- Chạy sau 001/002/003. Idempotent.
-- =====================================================================

BEGIN;

ALTER TABLE lesson_progress ADD COLUMN IF NOT EXISTS last_watched_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS aoi_regions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_content_id UUID NOT NULL REFERENCES lesson_contents(id) ON DELETE CASCADE,
    name              VARCHAR(100) NOT NULL,
    x_min             REAL NOT NULL,
    y_min             REAL NOT NULL,
    x_max             REAL NOT NULL,
    y_max             REAL NOT NULL,
    created_by        UUID REFERENCES users(id),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (x_min >= 0 AND x_min <= 1 AND y_min >= 0 AND y_min <= 1
       AND x_max >= 0 AND x_max <= 1 AND y_max >= 0 AND y_max <= 1),
    CHECK (x_min < x_max AND y_min < y_max)
);

CREATE INDEX IF NOT EXISTS idx_aoi_regions_content ON aoi_regions (lesson_content_id);

CREATE TABLE IF NOT EXISTS gaze_slide_stats (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_session_id UUID NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    lesson_content_id   UUID NOT NULL REFERENCES lesson_contents(id) ON DELETE CASCADE,
    total_samples       INT NOT NULL DEFAULT 0,
    on_slide_samples    INT NOT NULL DEFAULT 0,
    view_ms             BIGINT NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_gaze_slide_stats UNIQUE (learning_session_id, lesson_content_id)
);

CREATE TABLE IF NOT EXISTS heatmap_aggregates (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lesson_content_id UUID NOT NULL REFERENCES lesson_contents(id) ON DELETE CASCADE,
    scope             VARCHAR(10) NOT NULL CHECK (scope IN ('class', 'student')),
    student_id        UUID REFERENCES users(id) ON DELETE CASCADE,
    sample_count      INT NOT NULL DEFAULT 0,
    on_slide_ratio    REAL,
    avg_view_ms       BIGINT,
    fixation_count    INT NOT NULL DEFAULT 0,
    hotspots          JSONB NOT NULL DEFAULT '[]',
    computed_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK ((scope = 'student') = (student_id IS NOT NULL))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_heatmap_class
    ON heatmap_aggregates (lesson_content_id) WHERE scope = 'class';
CREATE UNIQUE INDEX IF NOT EXISTS ux_heatmap_student
    ON heatmap_aggregates (lesson_content_id, student_id) WHERE scope = 'student';

CREATE TABLE IF NOT EXISTS aoi_dwell_stats (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    learning_session_id UUID NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    aoi_region_id       UUID NOT NULL REFERENCES aoi_regions(id) ON DELETE CASCADE,
    dwell_ms            BIGINT NOT NULL DEFAULT 0,
    sample_count        INT NOT NULL DEFAULT 0,
    CONSTRAINT uq_aoi_dwell_stats UNIQUE (learning_session_id, aoi_region_id)
);

CREATE TABLE IF NOT EXISTS engagement_scores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enrollment_id   UUID NOT NULL REFERENCES enrollments(id) ON DELETE CASCADE,
    lesson_id       UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    score           REAL NOT NULL CHECK (score >= 0 AND score <= 100),
    on_slide_ratio  REAL,
    computed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_engagement_scores UNIQUE (enrollment_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_engagement_scores_lesson ON engagement_scores (lesson_id);

UPDATE users
SET password_hash = '$2b$12$1q/iiUi4DF25DxUvlvyt5uUDwDBsEpGbTj5SqkEudV9QZCQhwYDoq'
WHERE email IN (
    'admin@school.edu.vn',
    'teacher@school.edu.vn',
    'student@school.edu.vn'
);

COMMIT;
