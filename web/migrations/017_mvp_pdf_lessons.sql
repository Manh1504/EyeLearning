BEGIN;

ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

CREATE TABLE IF NOT EXISTS course_items (
    course_item_id TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    item_type TEXT NOT NULL CHECK (item_type IN ('PDF_LESSON', 'TEST')),
    title TEXT NOT NULL,
    description TEXT,
    display_order INTEGER NOT NULL DEFAULT 1,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    available_from TIMESTAMPTZ,
    available_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_course_items_course_order
    ON course_items(course_id, display_order);

CREATE TABLE IF NOT EXISTS pdf_lessons (
    pdf_lesson_id TEXT PRIMARY KEY,
    course_item_id TEXT NOT NULL UNIQUE REFERENCES course_items(course_item_id) ON DELETE CASCADE,
    storage_key TEXT NOT NULL UNIQUE,
    pdf_url TEXT,
    original_filename TEXT NOT NULL,
    file_size BIGINT,
    page_count INTEGER,
    processing_status TEXT NOT NULL DEFAULT 'READY' CHECK (processing_status IN ('UPLOADING', 'READY', 'FAILED')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tests (
    test_id TEXT PRIMARY KEY,
    course_item_id TEXT NOT NULL UNIQUE REFERENCES course_items(course_item_id) ON DELETE CASCADE,
    question_count INTEGER NOT NULL DEFAULT 0,
    config_json JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pdf_lesson_progress (
    progress_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    course_item_id TEXT NOT NULL REFERENCES course_items(course_item_id) ON DELETE CASCADE,
    pdf_lesson_id TEXT NOT NULL REFERENCES pdf_lessons(pdf_lesson_id) ON DELETE CASCADE,
    last_page_number INTEGER NOT NULL DEFAULT 1,
    max_page_number_seen INTEGER NOT NULL DEFAULT 1,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT uq_pdf_lesson_progress_user_lesson UNIQUE (user_id, pdf_lesson_id)
);

ALTER TABLE sessions
    ALTER COLUMN lesson_id DROP NOT NULL;

ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS course_item_id TEXT REFERENCES course_items(course_item_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS pdf_lesson_id TEXT REFERENCES pdf_lessons(pdf_lesson_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS test_id TEXT REFERENCES tests(test_id) ON DELETE SET NULL;

ALTER TABLE tracking_points
    ADD COLUMN IF NOT EXISTS user_id TEXT REFERENCES users(user_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS course_item_id TEXT REFERENCES course_items(course_item_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS pdf_lesson_id TEXT REFERENCES pdf_lessons(pdf_lesson_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS test_id TEXT REFERENCES tests(test_id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS page_number INTEGER,
    ADD COLUMN IF NOT EXISTS page_x_normalized DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS page_y_normalized DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS page_display_width DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS page_display_height DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_tracking_points_pdf_page
    ON tracking_points(session_id, pdf_lesson_id, page_number, timestamp_ms);

DELETE FROM aoi_transitions WHERE lesson_id IN ('L001', 'L002');
DELETE FROM aoi_visits WHERE lesson_id IN ('L001', 'L002');
DELETE FROM learning_events WHERE lesson_id IN ('L001', 'L002');
DELETE FROM tracking_points WHERE session_id IN (SELECT session_id FROM sessions WHERE lesson_id IN ('L001', 'L002'));
DELETE FROM heatmaps WHERE session_id IN (SELECT session_id FROM sessions WHERE lesson_id IN ('L001', 'L002'));
DELETE FROM page_snapshots WHERE session_id IN (SELECT session_id FROM sessions WHERE lesson_id IN ('L001', 'L002'));
DELETE FROM gaze_chunks WHERE session_id IN (SELECT session_id FROM sessions WHERE lesson_id IN ('L001', 'L002'));
DELETE FROM sessions WHERE lesson_id IN ('L001', 'L002');
DELETE FROM content_imports WHERE lesson_id IN ('L001', 'L002');
DELETE FROM stimulus_elements WHERE stimulus_id IN (
    SELECT stimulus_id FROM content_stimuli WHERE activity_id IN ('ACT_L001_slide_deck', 'ACT_L002_slide_deck')
);
DELETE FROM content_stimuli WHERE activity_id IN ('ACT_L001_slide_deck', 'ACT_L002_slide_deck');
DELETE FROM lesson_activities WHERE lesson_id IN ('L001', 'L002');
DELETE FROM content_versions WHERE lesson_id IN ('L001', 'L002');
DELETE FROM aoi_definitions WHERE lesson_id IN ('L001', 'L002');
DELETE FROM lessons WHERE lesson_id IN ('L001', 'L002');
DELETE FROM course_modules WHERE module_id IN ('MOD_L001_1', 'MOD_L002_1', 'MOD_C001_DEFAULT', 'MOD_C002_DEFAULT');
DELETE FROM teacher_course_assignments WHERE course_id IN ('C001', 'C002');
DELETE FROM course_enrollments WHERE course_id IN ('C001', 'C002');
DELETE FROM courses WHERE course_id IN ('C001', 'C002');

INSERT INTO courses (course_id, course_title, course_description, status)
VALUES ('C001', 'ELA MVP', 'Khóa học mẫu tối giản cho PDF lesson và test.', 'active')
ON CONFLICT (course_id) DO UPDATE
SET course_title = EXCLUDED.course_title,
    course_description = EXCLUDED.course_description,
    status = EXCLUDED.status;

INSERT INTO users (user_id, role, full_name, student_code, email, password_hash, is_active)
VALUES
    (
        'U_TEACHER_MVP',
        'teacher',
        'ELA Teacher',
        NULL,
        'teacher@ela.local',
        'pbkdf2_sha256$2d8c4c81274f6d2dc4ba0cecb71d8e4f$8dfad46378d3445f6a59d6207fe0d375ec3bf0f74cb4c5622ab32f767bc12f63',
        true
    ),
    (
        'U_STUDENT_MVP',
        'student',
        'ELA Student',
        'sv001',
        NULL,
        'pbkdf2_sha256$e6acdbf045d9d67051657f73d73d75e5$06151e2f5bb89c204eec49cf8f238f1f3f6abdbde5c7c1e2f4e605be74d3f65d',
        true
    )
ON CONFLICT (user_id) DO UPDATE
SET role = EXCLUDED.role,
    full_name = EXCLUDED.full_name,
    student_code = EXCLUDED.student_code,
    email = EXCLUDED.email,
    password_hash = EXCLUDED.password_hash,
    is_active = EXCLUDED.is_active;

INSERT INTO teacher_course_assignments (teacher_id, course_id, assigned_by)
VALUES ('U_TEACHER_MVP', 'C001', NULL)
ON CONFLICT (teacher_id, course_id) DO NOTHING;

INSERT INTO course_enrollments (student_id, course_id, enrolled_by, status)
VALUES ('U_STUDENT_MVP', 'C001', NULL, 'active')
ON CONFLICT (student_id, course_id) DO UPDATE
SET status = EXCLUDED.status;

COMMIT;
