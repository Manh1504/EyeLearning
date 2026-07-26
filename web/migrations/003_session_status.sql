-- Thêm cột status vào sessions — DB thật trước đây chỉ dựa vào
-- ended_at IS NULL/NOT NULL để suy ra trạng thái, không phân biệt được
-- calibrating / learning / abandoned.
ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'calibrating';

ALTER TABLE sessions
    ADD CONSTRAINT sessions_status_check
    CHECK (status IN ('calibrating', 'learning', 'finished', 'abandoned'));

-- Backfill: session nào đã có ended_at trước migration này thì coi là finished
UPDATE sessions SET status = 'finished' WHERE ended_at IS NOT NULL AND status != 'finished';

CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions (status);
