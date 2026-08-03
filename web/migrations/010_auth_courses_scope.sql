ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS auth_sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON auth_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_active ON auth_sessions (expires_at, revoked_at);

CREATE TABLE IF NOT EXISTS courses (
    course_id TEXT PRIMARY KEY,
    course_title TEXT NOT NULL,
    course_description TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE lessons
    ADD COLUMN IF NOT EXISTS course_id TEXT REFERENCES courses(course_id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS teacher_course_assignments (
    teacher_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    assigned_by TEXT REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (teacher_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_course_assignments_teacher ON teacher_course_assignments (teacher_id);
CREATE INDEX IF NOT EXISTS idx_teacher_course_assignments_course ON teacher_course_assignments (course_id);

CREATE TABLE IF NOT EXISTS course_enrollments (
    student_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    course_id TEXT NOT NULL REFERENCES courses(course_id) ON DELETE CASCADE,
    enrolled_by TEXT REFERENCES users(user_id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (student_id, course_id),
    CHECK (status IN ('active', 'inactive'))
);

CREATE INDEX IF NOT EXISTS idx_course_enrollments_student ON course_enrollments (student_id);
CREATE INDEX IF NOT EXISTS idx_course_enrollments_course ON course_enrollments (course_id);

INSERT INTO courses (course_id, course_title, course_description)
VALUES ('C001', 'ELA', 'Khóa học demo của hệ thống ELA')
ON CONFLICT (course_id) DO NOTHING;

UPDATE lessons SET course_id = 'C001' WHERE course_id IS NULL;

INSERT INTO course_enrollments (student_id, course_id, enrolled_by, status)
SELECT user_id, 'C001', NULL, 'active'
FROM users
WHERE role = 'student'
ON CONFLICT (student_id, course_id) DO NOTHING;

INSERT INTO teacher_course_assignments (teacher_id, course_id, assigned_by)
SELECT user_id, 'C001', NULL
FROM users
WHERE role IN ('teacher', 'instructor')
ON CONFLICT (teacher_id, course_id) DO NOTHING;
