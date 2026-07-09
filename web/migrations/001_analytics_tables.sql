CREATE TABLE IF NOT EXISTS aoi_definitions (
    aoi_id TEXT PRIMARY KEY,
    lesson_id TEXT NOT NULL REFERENCES lessons(lesson_id) ON DELETE CASCADE,
    layout_version TEXT NOT NULL,
    aoi_key TEXT NOT NULL,
    aoi_name TEXT NOT NULL,
    css_selector TEXT NOT NULL,
    aoi_type TEXT NOT NULL,
    is_learning_area BOOLEAN NOT NULL DEFAULT TRUE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    UNIQUE (lesson_id, layout_version, aoi_key)
);

CREATE TABLE IF NOT EXISTS tracking_points (
    point_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    aoi_id TEXT REFERENCES aoi_definitions(aoi_id) ON DELETE SET NULL,
    timestamp_ms BIGINT NOT NULL,
    viewport_x DOUBLE PRECISION NOT NULL,
    viewport_y DOUBLE PRECISION NOT NULL,
    scroll_x DOUBLE PRECISION NOT NULL DEFAULT 0,
    scroll_y DOUBLE PRECISION NOT NULL DEFAULT 0,
    confidence DOUBLE PRECISION,
    gaze_status TEXT
);

CREATE TABLE IF NOT EXISTS aoi_metrics (
    metric_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    aoi_id TEXT NOT NULL REFERENCES aoi_definitions(aoi_id) ON DELETE CASCADE,
    dwell_time_ms BIGINT NOT NULL,
    dwell_time_pct DOUBLE PRECISION NOT NULL,
    point_count INT NOT NULL,
    first_hit_ms BIGINT,
    revisit_count INT NOT NULL DEFAULT 0,
    calculated_at TIMESTAMPTZ DEFAULT now(),
    algorithm_version TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aoi_definitions_lesson_layout
    ON aoi_definitions (lesson_id, layout_version);

CREATE INDEX IF NOT EXISTS idx_tracking_points_session_id
    ON tracking_points (session_id);

CREATE INDEX IF NOT EXISTS idx_tracking_points_aoi_id
    ON tracking_points (aoi_id);

CREATE INDEX IF NOT EXISTS idx_tracking_points_timestamp_ms
    ON tracking_points (timestamp_ms);

CREATE INDEX IF NOT EXISTS idx_aoi_metrics_session_id
    ON aoi_metrics (session_id);
