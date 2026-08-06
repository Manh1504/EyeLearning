\echo 'Before backfill'
SELECT
    COUNT(*) AS total,
    COUNT(page_number) AS page_mapped,
    COUNT(pdf_document_version) AS version_mapped
FROM tracking_points;

BEGIN;

UPDATE tracking_points AS tp
SET
    user_id = COALESCE(tp.user_id, s.user_id),
    course_id = COALESCE(tp.course_id, s.course_id),
    course_item_id = COALESCE(tp.course_item_id, s.course_item_id),
    pdf_lesson_id = COALESCE(tp.pdf_lesson_id, s.pdf_lesson_id),
    pdf_document_version = COALESCE(tp.pdf_document_version, s.pdf_document_version),
    page_number = COALESCE(
        tp.page_number,
        NULLIF(tp.metadata_json ->> 'page_number', '')::INTEGER
    ),
    page_x_normalized = COALESCE(
        tp.page_x_normalized,
        NULLIF(tp.metadata_json ->> 'page_x_normalized', '')::DOUBLE PRECISION
    ),
    page_y_normalized = COALESCE(
        tp.page_y_normalized,
        NULLIF(tp.metadata_json ->> 'page_y_normalized', '')::DOUBLE PRECISION
    ),
    page_display_width = COALESCE(
        tp.page_display_width,
        NULLIF(tp.metadata_json ->> 'page_display_width', '')::DOUBLE PRECISION
    ),
    page_display_height = COALESCE(
        tp.page_display_height,
        NULLIF(tp.metadata_json ->> 'page_display_height', '')::DOUBLE PRECISION
    )
FROM sessions AS s
WHERE tp.session_id = s.session_id;

COMMIT;

\echo 'After backfill'
SELECT
    COUNT(*) AS total,
    COUNT(page_number) AS page_mapped,
    COUNT(pdf_document_version) AS version_mapped
FROM tracking_points;
