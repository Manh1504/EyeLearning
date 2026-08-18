-- =====================================================================
-- PARTITION CHO gaze_events — chạy sau 001_init.sql
-- Tạo: default partition + partition từng tháng cho 12 tháng tới
-- (fillfactor=90 vì gaze_events là bảng insert-heavy)
-- =====================================================================

BEGIN;

-- Chứa mọi event rơi ngoài các partition tháng đã tạo (tránh mất dữ liệu)
CREATE TABLE IF NOT EXISTS gaze_events_default PARTITION OF gaze_events DEFAULT;

-- Function idempotent: tạo partition tháng hiện tại + months_ahead tháng tới.
-- Trả về số partition mới tạo. Dùng lại bởi db/maintain_partitions.sql (cron).
CREATE OR REPLACE FUNCTION create_gaze_partitions(months_ahead INT DEFAULT 3)
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
    start_date DATE := date_trunc('month', CURRENT_DATE);
    d          DATE;
    part_name  TEXT;
    created    INT := 0;
BEGIN
    FOR i IN 0..months_ahead LOOP
        d         := start_date + make_interval(months => i);
        part_name := 'gaze_events_' || to_char(d, 'YYYY_MM');
        IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = part_name) THEN
            EXECUTE format(
                'CREATE TABLE %I PARTITION OF gaze_events
                 FOR VALUES FROM (%L) TO (%L)
                 WITH (fillfactor = 90)',
                part_name, d, d + INTERVAL '1 month'
            );
            created := created + 1;
        END IF;
    END LOOP;
    RETURN created;
END;
$$;

-- Tạo sẵn 12 tháng kể từ tháng hiện tại
SELECT create_gaze_partitions(12);

COMMIT;
