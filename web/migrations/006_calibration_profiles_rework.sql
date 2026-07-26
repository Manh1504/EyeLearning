-- Viết lại calibration_profiles cho đúng thiết kế đã chốt: GIỮ 1 bảng (không
-- tách calibration_sessions/checkpoints), 1 row = 1 checkpoint, các checkpoint
-- cùng 1 lần calib share chung calibration_group_id.
--
-- Bảng cũ trong code thật gần như chưa từng được ghi (dead table — frontend
-- không hề gọi POST /calibration), nên an toàn để đổi cấu trúc cột thẳng,
-- không cần lo mất dữ liệu thật.

ALTER TABLE calibration_profiles
    DROP COLUMN IF EXISTS checkpoint_x,
    DROP COLUMN IF EXISTS checkpoint_y;

ALTER TABLE calibration_profiles
    ADD COLUMN IF NOT EXISTS calibration_group_id TEXT,
    ADD COLUMN IF NOT EXISTS checkpoint_x DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS checkpoint_y DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS pitch DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS yaw DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS avg_error_px DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS n_points INTEGER NOT NULL DEFAULT 9,
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS trained_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS is_micro BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS device_fingerprint TEXT,
    ADD COLUMN IF NOT EXISTS model_storage_url TEXT,
    ADD COLUMN IF NOT EXISTS model_format TEXT DEFAULT 'joblib';

-- Backfill phòng trường hợp có row cũ (không nên có, bảng gần như rỗng)
UPDATE calibration_profiles
   SET calibration_group_id = calibration_id
 WHERE calibration_group_id IS NULL;

UPDATE calibration_profiles
   SET checkpoint_x = 0.5, checkpoint_y = 0.5, pitch = 0, yaw = 0
 WHERE checkpoint_x IS NULL OR checkpoint_y IS NULL OR pitch IS NULL OR yaw IS NULL;

ALTER TABLE calibration_profiles
    ALTER COLUMN calibration_group_id SET NOT NULL,
    ALTER COLUMN checkpoint_x SET NOT NULL,
    ALTER COLUMN checkpoint_y SET NOT NULL,
    ALTER COLUMN pitch SET NOT NULL,
    ALTER COLUMN yaw SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_calib_group ON calibration_profiles (calibration_group_id);
CREATE INDEX IF NOT EXISTS idx_calib_user  ON calibration_profiles (user_id, status);

-- sessions.calibration_id (FK 1-1 cứng tới 1 checkpoint) không còn hợp lý vì
-- giờ 1 lần calib có 9 row cùng group. Đổi sang calibration_group_id, KHÔNG
-- FK cứng (calibration_group_id không phải PK của calibration_profiles) —
-- validate tồn tại ở tầng application (routers/calibration.py).
ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_calibration_id_fkey;
ALTER TABLE sessions RENAME COLUMN calibration_id TO calibration_group_id;
