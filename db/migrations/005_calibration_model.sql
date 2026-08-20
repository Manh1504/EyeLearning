-- =====================================================================
-- 005_calibration_model.sql — lưu mô hình calibration (.ubj) thay vì
-- 6 tham số kappa của protocol cũ.
--
-- AI service (API/server.py) giờ cung cấp session-based protocol:
--   POST /session → POST /session/{sid}/import → WS /session/{sid}/stream
-- Mô hình calibration sau khi train được tải (GET /session/{sid}/model)
-- về dạng file .ubj và lưu vào DB để tái sử dụng qua /import.
--
-- Chạy sau 001/002/003/004. Idempotent.
-- =====================================================================

BEGIN;

ALTER TABLE calibration_params
    ADD COLUMN IF NOT EXISTS model_ubj BYTEA,
    ADD COLUMN IF NOT EXISTS mae_px    REAL;

-- Cột params (NUMERIC[6]) không còn dùng; để nullable cho tương thích dữ liệu cũ.
ALTER TABLE calibration_params ALTER COLUMN params DROP NOT NULL;

COMMIT;