-- =====================================================================
-- 006_course_teachers.sql — phân công giảng viên cho khóa học (many-to-many).
--
-- Admin được phép gán nhiều giảng viên cho một khóa học. Giảng viên được
-- phân công (ngoài chủ khóa học teacher_id) sẽ xem/đồng quản lý khóa học
-- và xem slide/heatmap dù chưa có dữ liệu học viên.
--
-- Chạy sau 005. Idempotent.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS course_teachers (
    course_id   uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    teacher_id  uuid NOT NULL REFERENCES teacher_profiles(user_id) ON DELETE CASCADE,
    assigned_by uuid REFERENCES users(id) ON DELETE SET NULL,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (course_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS idx_course_teachers_teacher ON course_teachers (teacher_id);

COMMIT;