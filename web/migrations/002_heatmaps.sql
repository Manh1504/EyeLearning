CREATE TABLE IF NOT EXISTS heatmaps (
    heatmap_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    aoi_key TEXT,
    background_image_url TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    cloudinary_public_id TEXT,
    image_url TEXT,
    image_url_thumbnail TEXT,
    point_count INT NOT NULL DEFAULT 0,
    generated_at TIMESTAMPTZ DEFAULT now(),
    metadata_json JSONB
);

CREATE INDEX IF NOT EXISTS idx_heatmaps_session_id
    ON heatmaps (session_id);

CREATE INDEX IF NOT EXISTS idx_heatmaps_session_aoi_key
    ON heatmaps (session_id, aoi_key);

CREATE INDEX IF NOT EXISTS idx_heatmaps_status
    ON heatmaps (status);
