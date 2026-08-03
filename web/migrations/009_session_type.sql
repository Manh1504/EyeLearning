ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS session_type TEXT NOT NULL DEFAULT 'student_learning';

ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS created_by_role TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'sessions_session_type_check'
    ) THEN
        ALTER TABLE sessions
            ADD CONSTRAINT sessions_session_type_check
            CHECK (session_type IN ('student_learning', 'admin_test', 'legacy_unknown'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_sessions_session_type
    ON sessions (session_type);
