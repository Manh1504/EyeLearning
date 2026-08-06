ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ;

ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_status_check;

UPDATE sessions
SET status = 'preparing'
WHERE status = 'calibrating';

ALTER TABLE sessions
    ADD CONSTRAINT sessions_status_check
    CHECK (
        status IN (
            'preparing',
            'validating',
            'learning',
            'finished',
            'abandoned',
            'failed'
        )
    );

CREATE INDEX IF NOT EXISTS idx_sessions_heartbeat_open
    ON sessions (status, last_heartbeat_at, started_at)
    WHERE status IN ('preparing', 'validating', 'learning');
