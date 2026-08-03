ALTER TABLE sessions DROP CONSTRAINT IF EXISTS sessions_session_type_check;

UPDATE sessions
SET session_type = 'student_learning'
WHERE session_type = 'official';

UPDATE sessions
SET session_type = 'legacy_unknown'
WHERE session_type IS NULL OR session_type NOT IN ('student_learning', 'admin_test');

ALTER TABLE sessions
    ALTER COLUMN session_type SET DEFAULT 'student_learning';

ALTER TABLE sessions
    ADD CONSTRAINT sessions_session_type_check
    CHECK (session_type IN ('student_learning', 'admin_test', 'legacy_unknown'));

CREATE INDEX IF NOT EXISTS idx_sessions_learning_production
    ON sessions (lesson_id, user_id, started_at)
    WHERE session_type = 'student_learning';
