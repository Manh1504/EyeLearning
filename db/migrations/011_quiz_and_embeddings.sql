BEGIN;

CREATE TABLE IF NOT EXISTS quiz_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(id),
    title VARCHAR(255) NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
    due_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
    status VARCHAR(20) NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'closed')),
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT quiz_assignments_questions_array CHECK (jsonb_typeof(questions) = 'array')
);

CREATE INDEX IF NOT EXISTS idx_quiz_assignments_course_due
    ON quiz_assignments(course_id, due_at);
CREATE INDEX IF NOT EXISTS idx_quiz_assignments_lesson
    ON quiz_assignments(lesson_id) WHERE lesson_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS quiz_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id UUID NOT NULL REFERENCES quiz_assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,
    score INTEGER NOT NULL CHECK (score >= 0),
    max_score INTEGER NOT NULL CHECK (max_score >= 0),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT quiz_attempts_answers_object CHECK (jsonb_typeof(answers) = 'object'),
    CONSTRAINT quiz_attempts_one_per_student UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_attempts_student
    ON quiz_attempts(student_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS quiz_attempt_sessions (
    assignment_id UUID NOT NULL REFERENCES quiz_assignments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (assignment_id, student_id)
);

-- Trạng thái embedding của từng slide để backfill/reindex và phát hiện slide
-- chưa có vector (chatbot không truy hồi được). 'none' | 'pending' | 'ready' | 'failed'
ALTER TABLE lesson_contents
    ADD COLUMN IF NOT EXISTS embedding_status VARCHAR(10) NOT NULL DEFAULT 'none';
ALTER TABLE lesson_contents
    ADD COLUMN IF NOT EXISTS embedding_error TEXT;
ALTER TABLE lesson_contents
    ADD COLUMN IF NOT EXISTS embedding_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_lesson_contents_embedding_status
    ON lesson_contents(embedding_status);


-- Embedding dimension must match EMBEDDING_DIM. Bảng tạo tạm với 4096 chiều;
-- migration 012 chuyển về 1024 (Qwen3-Embedding-0.6B) và tạo index HNSW cosine.
-- Đổi model embedding cần migration đổi số chiều tương ứng + re-ingest toàn bộ.
CREATE TABLE IF NOT EXISTS lesson_content_embedding (
    lesson_content_id UUID PRIMARY KEY REFERENCES lesson_contents(id) ON DELETE CASCADE,
    embedding_content TEXT NOT NULL,
    embedding VECTOR(4096) NOT NULL
);

COMMIT;
