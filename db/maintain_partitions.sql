-- =====================================================================
-- BẢO TRÌ PARTITION gaze_events — chạy định kỳ qua cron
-- Function create_gaze_partitions() định nghĩa trong
-- migrations/003_gaze_partitions.sql (phải chạy migration trước).
--
-- Cron gợi ý (ngày 25 hàng tháng, 03:00 — tạo trước 3 tháng):
--   0 3 25 * * psql -d eyetracking -f /path/to/db/maintain_partitions.sql
--
-- LƯU Ý: nếu gaze_events_default đang chứa dữ liệu trùng khoảng của
-- partition mới, CREATE sẽ lỗi (xung đột dữ liệu). Khi đó cần chuyển
-- dữ liệu trong default về đúng partition trước (xem README.md).
-- =====================================================================

SELECT create_gaze_partitions(3);
