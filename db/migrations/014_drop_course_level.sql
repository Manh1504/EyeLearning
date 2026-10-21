-- Bỏ cột courses.level (trình độ khóa học: beginner/intermediate/advanced).
-- Cột này không còn dùng ở UI/API. Idempotent để chạy lại an toàn mỗi lần deploy.
ALTER TABLE courses DROP COLUMN IF EXISTS level;
