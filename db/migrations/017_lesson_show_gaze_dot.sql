-- 017_lesson_show_gaze_dot.sql — Cờ theo từng bài học: cho sinh viên thấy chấm
-- điểm nhìn (gaze dot) của chính họ khi đang học. Dùng chủ yếu để test/kiểm tra
-- việc ước lượng điểm nhìn; mặc định TẮT để không gây xao nhãng.
-- Idempotent: file này chạy lại mỗi lần deploy (không có bảng tracking).

BEGIN;

ALTER TABLE lessons
    ADD COLUMN IF NOT EXISTS show_gaze_dot BOOLEAN NOT NULL DEFAULT false;

COMMIT;
