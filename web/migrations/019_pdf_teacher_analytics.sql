ALTER TABLE sessions
    ADD COLUMN IF NOT EXISTS pdf_document_version TEXT;

ALTER TABLE tracking_points
    ADD COLUMN IF NOT EXISTS pdf_document_version TEXT;

UPDATE sessions s
SET pdf_document_version = p.storage_key
FROM pdf_lessons p
WHERE s.pdf_document_version IS NULL
  AND s.pdf_lesson_id = p.pdf_lesson_id;

UPDATE tracking_points tp
SET pdf_document_version = COALESCE(s.pdf_document_version, p.storage_key)
FROM sessions s
LEFT JOIN pdf_lessons p ON p.pdf_lesson_id = s.pdf_lesson_id
WHERE tp.pdf_document_version IS NULL
  AND tp.session_id = s.session_id;

CREATE INDEX IF NOT EXISTS idx_sessions_course_item_version_started
    ON sessions(course_id, course_item_id, pdf_document_version, started_at);

CREATE INDEX IF NOT EXISTS idx_tracking_points_course_item_version_page_ts
    ON tracking_points(course_id, course_item_id, pdf_document_version, page_number, timestamp_ms);

CREATE INDEX IF NOT EXISTS idx_tracking_points_version_confidence
    ON tracking_points(pdf_document_version, confidence);
