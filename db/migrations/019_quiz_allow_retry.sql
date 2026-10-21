-- 019_quiz_allow_retry.sql — Cờ theo từng bài tập: giáo viên cho phép học viên
-- làm lại bài. Khi bật, học viên đã nộp có thể bấm "Làm lại": lượt làm cũ bị
-- xoá (mỗi học viên vẫn chỉ giữ 1 lượt) và đồng hồ làm bài chạy lại từ đầu.
-- Mặc định TẮT để giữ nguyên hành vi cũ (nộp xong là hết).
-- Idempotent: file này chạy lại mỗi lần deploy (không có bảng tracking).

BEGIN;

ALTER TABLE quiz_assignments
    ADD COLUMN IF NOT EXISTS allow_retry BOOLEAN NOT NULL DEFAULT false;

COMMIT;
