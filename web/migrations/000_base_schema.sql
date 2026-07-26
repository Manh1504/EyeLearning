-- Các bảng gốc (users, lessons, sessions, calibration_profiles, gaze_chunks)
-- CHƯA TỪNG được tạo ở bất kỳ migration nào trong repo — 001_analytics_tables.sql
-- REFERENCES thẳng tới lessons/sessions nhưng không file nào CREATE chúng.
-- Nếu chạy docker-entrypoint-initdb.d từ volume rỗng, Postgres sẽ dừng ngay
-- ở 001 vì "relation lessons does not exist". File này lấp đúng lỗ hổng đó,
-- đặt tên 000_ để chạy TRƯỚC 001 (thứ tự alphabet).
--
-- Giữ đúng shape GỐC (trước các patch 003/006 áp dụng lên trên) để 2 migration
-- đó (đã viết từ trước, ALTER TABLE ... ADD COLUMN / RENAME COLUMN) áp dụng
-- đúng như thiết kế ban đầu, không cần sửa lại 003/006.

CREATE TABLE IF NOT EXISTS users (
    user_id       TEXT PRIMARY KEY,
    role          TEXT,
    full_name     TEXT,
    student_code  TEXT UNIQUE,
    email         TEXT,
    created_at    TIMESTAMPTZ DEFAULT now(),
    password_hash TEXT
);

CREATE TABLE IF NOT EXISTS lessons (
    lesson_id          TEXT PRIMARY KEY,
    lesson_title       TEXT NOT NULL,
    teacher_id         TEXT REFERENCES users(user_id) ON DELETE SET NULL,
    lesson_description TEXT,
    video_url          TEXT,
    content_url        TEXT,
    layout_version     TEXT NOT NULL,
    created_at         TIMESTAMPTZ DEFAULT now()
);

-- Shape GỐC (dead table, trước khi migration 006 viết lại) — giữ đúng để 006
-- ALTER lên trên không bị lệch giả định.
CREATE TABLE IF NOT EXISTS calibration_profiles (
    calibration_id  TEXT PRIMARY KEY,
    user_id         TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    checkpoint_x    BYTEA NOT NULL,
    checkpoint_y    BYTEA NOT NULL,
    checkpoint_name TEXT NOT NULL,
    is_fullscreen   BOOLEAN NOT NULL,
    viewport_h      INT NOT NULL,
    viewport_w      INT NOT NULL
);

-- Shape GỐC (trước khi migration 003 thêm cột status) — giữ tên cột
-- calibration_id (trước khi 006 rename thành calibration_group_id).
CREATE TABLE IF NOT EXISTS sessions (
    session_id     TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    lesson_id      TEXT NOT NULL REFERENCES lessons(lesson_id) ON DELETE CASCADE,
    calibration_id TEXT REFERENCES calibration_profiles(calibration_id) ON DELETE SET NULL,
    started_at     TIMESTAMPTZ DEFAULT now(),
    ended_at       TIMESTAMPTZ,
    is_fullscreen  BOOLEAN,
    viewport_w     INT,
    viewport_h     INT
);

CREATE TABLE IF NOT EXISTS gaze_chunks (
    chunk_id   TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    seq        INT NOT NULL,
    start_ms   INT NOT NULL,
    data       JSONB NOT NULL,
    UNIQUE (session_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_lesson_id ON sessions (lesson_id);
CREATE INDEX IF NOT EXISTS idx_gaze_chunks_session_id ON gaze_chunks (session_id);
