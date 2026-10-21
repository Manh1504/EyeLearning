-- =====================================================================
-- BẢO TRÌ PARTITION gaze_events — tạo partition tháng mới.
-- Function create_gaze_partitions() định nghĩa trong
-- db/migrations/003_gaze_partitions.sql (phải chạy migration trước).
--
-- Trong docker-compose.yml, service `db-maintenance` gọi function này mỗi 24h
-- (không phụ thuộc cron của host). File này để chạy thủ công:
--   psql -d eyetracking -f ops/maintain_partitions.sql
--
-- LƯU Ý: nếu gaze_events_default đang chứa dữ liệu trùng khoảng của
-- partition mới, CREATE sẽ lỗi (xung đột dữ liệu). Khi đó cần chuyển
-- dữ liệu trong default về đúng partition trước (xem db/README.md).
-- =====================================================================

SELECT create_gaze_partitions(3);
