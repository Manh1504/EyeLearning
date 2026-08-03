ALTER TABLE calibration_profiles
  ADD COLUMN IF NOT EXISTS profile_name TEXT,
  ADD COLUMN IF NOT EXISTS model_version TEXT NOT NULL DEFAULT 'svr:v1',
  ADD COLUMN IF NOT EXISTS environment_json JSONB,
  ADD COLUMN IF NOT EXISTS artifact_status TEXT NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS last_validation_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_validation_status TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE calibration_profiles
SET profile_name = COALESCE(profile_name, 'Hồ sơ căn chỉnh ' || calibration_group_id)
WHERE profile_name IS NULL;

CREATE TABLE IF NOT EXISTS calibration_validation_runs (
  validation_id TEXT PRIMARY KEY,
  calibration_group_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  session_id TEXT REFERENCES sessions(session_id) ON DELETE SET NULL,
  status TEXT NOT NULL,
  sample_count INTEGER NOT NULL DEFAULT 0,
  valid_sample_count INTEGER NOT NULL DEFAULT 0,
  valid_sample_ratio DOUBLE PRECISION,
  median_error_norm DOUBLE PRECISION,
  max_error_norm DOUBLE PRECISION,
  environment_json JSONB,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calibration_profiles_user_group ON calibration_profiles(user_id, calibration_group_id);
CREATE INDEX IF NOT EXISTS idx_calibration_profiles_artifact_status ON calibration_profiles(artifact_status);
CREATE INDEX IF NOT EXISTS idx_calibration_validation_runs_user_created ON calibration_validation_runs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_calibration_validation_runs_group_created ON calibration_validation_runs(calibration_group_id, created_at DESC);
