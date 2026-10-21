-- Bỏ hoàn toàn bảng lesson_progress (tiến độ học tập: % hoàn thành, số slide đã
-- xem, đánh dấu hoàn thành bài). Không còn API/UI nào dùng. Idempotent để chạy
-- lại an toàn mỗi lần deploy.
DROP TABLE IF EXISTS lesson_progress;
