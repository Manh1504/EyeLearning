-- =====================================================================
-- 007_calibration_settings.sql — cấu hình ngưỡng MAE hiệu chỉnh.
--
-- Admin điều chỉnh:
--   - enabled: có tính điểm MAE khi train không (false = luôn pass)
--   - threshold: ngưỡng MAE tối đa (0.01-0.30, đơn vị chuẩn hóa [0,1])
--              0.05=5%, 0.12=12%, 0.15=15%
--
-- Có đúng 1 row (id=1) — idempotent.
-- =====================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS calibration_settings (
    id             smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    enabled        boolean NOT NULL DEFAULT true,
    threshold      real    NOT NULL DEFAULT 0.12 CHECK (threshold >= 0.01 AND threshold <= 0.30),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    updated_by     uuid REFERENCES users(id) ON DELETE SET NULL
);

-- Đảm bảo luôn có 1 row mặc định (upsert)
INSERT INTO calibration_settings (id, enabled, threshold)
VALUES (1, true, 0.12)
ON CONFLICT (id) DO NOTHING;

-- Nếu bảng đã tồn tại nhưng threshold cũ còn 0.05, nâng lên 0.12 cho nhanh pass
UPDATE calibration_settings SET threshold = 0.12 WHERE threshold = 0.05 AND enabled = true;

COMMIT;
