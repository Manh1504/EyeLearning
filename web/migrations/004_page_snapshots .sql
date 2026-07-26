CREATE TABLE IF NOT EXISTS page_snapshots (
    snapshot_id          TEXT PRIMARY KEY,
    session_id           TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    captured_at_ms       BIGINT NOT NULL,

    viewport_w           INT NOT NULL,
    viewport_h           INT NOT NULL,
    document_w           INT NOT NULL,
    document_h           INT NOT NULL,

    requested_scale      DOUBLE PRECISION NOT NULL,
    actual_scale         DOUBLE PRECISION NOT NULL,
    canvas_w             INT NOT NULL,
    canvas_h             INT NOT NULL,

    cloudinary_public_id TEXT,
    image_url            TEXT,
    image_url_thumbnail  TEXT,
    status               TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'done', 'failed')),
    error_message        TEXT,

    UNIQUE (session_id)
);

CREATE INDEX IF NOT EXISTS idx_page_snapshots_session ON page_snapshots (session_id);