BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS ux_auth_sessions_refresh_token_hash
    ON auth_sessions (refresh_token_hash);

COMMIT;
