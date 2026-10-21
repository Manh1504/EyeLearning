-- =====================================================================
-- 018_calibration_keep_latest.sql — mỗi (user, device) chỉ giữ ĐÚNG MỘT
-- bản ghi calibration: bộ mới nhất. Dọn các bộ cũ đã tích luỹ.
--
-- Trước đây mỗi lần hiệu chỉnh lại sẽ INSERT thêm 1 dòng calibration_params
-- rồi deactivate dòng cũ, nên .ubj (~1-3KB/bản) tích luỹ vô hạn theo thời
-- gian mà không có endpoint nào đọc lại bản cũ. Từ nay tầng API ghi đè tại
-- chỗ (xem POST /api/calibrations); migration này dọn dữ liệu đã có.
--
-- Lưu ý FK: learning_sessions.calibration_param_id trỏ tới calibration_params
-- (chỉ được dùng như cờ "đã hiệu chỉnh", không đọc model) — phải trỏ lại về
-- bản ghi được giữ TRƯỚC khi xoá, nếu không sẽ vi phạm khoá ngoại.
--
-- Idempotent: chạy lại không còn gì để xoá.
-- =====================================================================

BEGIN;

-- Bản ghi được giữ cho mỗi (user, device): ưu tiên dòng đang active, sau đó
-- tới valid_from mới nhất (id chỉ để phá hoà khi valid_from trùng nhau).
CREATE TEMP TABLE _calib_keep ON COMMIT DROP AS
SELECT DISTINCT ON (user_id, device_id) user_id, device_id, id
FROM calibration_params
ORDER BY user_id, device_id, is_active DESC, valid_from DESC, id DESC;

-- 1) Trỏ lại FK của learning_sessions về bản ghi được giữ.
UPDATE learning_sessions ls
SET calibration_param_id = k.id
FROM calibration_params cp
JOIN _calib_keep k
  ON k.user_id = cp.user_id AND k.device_id = cp.device_id
WHERE ls.calibration_param_id = cp.id
  AND cp.id <> k.id;

-- 2) Xoá các bộ calibration cũ.
DELETE FROM calibration_params cp
USING _calib_keep k
WHERE cp.user_id = k.user_id
  AND cp.device_id = k.device_id
  AND cp.id <> k.id;

-- 3) Xoá các calibration_session không còn bản ghi nào tham chiếu.
DELETE FROM calibration_sessions cs
WHERE NOT EXISTS (
    SELECT 1 FROM calibration_params cp
    WHERE cp.calibration_session_id = cs.id
);

-- 4) Bản giữ lại luôn ở trạng thái active để không còn dòng "mồ côi" inactive.
UPDATE calibration_params cp
SET is_active = TRUE, valid_to = NULL
FROM _calib_keep k
WHERE cp.id = k.id
  AND (cp.is_active IS NOT TRUE OR cp.valid_to IS NOT NULL);

COMMIT;
