ALTER TABLE tracking_points
    ADD COLUMN IF NOT EXISTS metadata_json JSONB;

CREATE INDEX IF NOT EXISTS idx_tracking_points_metadata_slide_id
    ON tracking_points ((metadata_json ->> 'slide_id'));
