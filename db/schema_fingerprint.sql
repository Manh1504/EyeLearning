-- schema_fingerprint.sql — in ra "dấu vân tay" schema đã chuẩn hoá: mỗi đối
-- tượng một dòng text, đã sort, KHÔNG phụ thuộc thứ tự tạo cột hay whitespace.
--
-- Dùng trong CI (job `migrations`): so schema của DB "dựng mới từ đầu" với DB
-- "nâng cấp từ bộ migration của bản đang chạy". Hai bên phải GIỐNG HỆT.
--
--   psql -tA -f db/schema_fingerprint.sql > fingerprint.txt
--   diff -u fresh.txt upgraded.txt
--
-- Loại trừ có chủ đích (khác nhau theo thời điểm/tiến trình, không phải schema):
--   * partition động của gaze_events: gaze_events_<YYYY_MM>, gaze_events_default
--   * bảng checkpoint* (LangGraph tự tạo khi chatbot khởi động)
--   * schema_migrations (bảng hạ tầng của runner db/migrate.sh)
WITH rel AS (
    SELECT c.oid, c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname NOT LIKE 'gaze_events_%'   -- partition động (giữ lại bảng cha gaze_events)
      AND c.relname NOT LIKE 'checkpoint%'     -- LangGraph tự tạo lúc runtime
      AND c.relname <> 'schema_migrations'     -- hạ tầng runner
)
SELECT line FROM (
    -- Cột: table.column | kiểu | NULL/NOT NULL | default
    SELECT format('column|%s.%s|%s|%s|%s',
                  c.relname, a.attname,
                  format_type(a.atttypid, a.atttypmod),
                  CASE WHEN a.attnotnull THEN 'NOT NULL' ELSE 'NULL' END,
                  COALESCE(regexp_replace(pg_get_expr(d.adbin, d.adrelid), '\s+', ' ', 'g'), '-')) AS line
    FROM rel c
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
    WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')

    UNION ALL
    -- Ràng buộc: PK/UNIQUE/FK/CHECK/EXCLUDE
    SELECT format('constraint|%s|%s|%s',
                  c.relname, con.conname,
                  regexp_replace(pg_get_constraintdef(con.oid), '\s+', ' ', 'g'))
    FROM pg_constraint con
    JOIN rel c ON c.oid = con.conrelid
    WHERE con.contype IN ('p', 'u', 'f', 'c', 'x')

    UNION ALL
    -- Index (kể cả index do PK/UNIQUE sinh ra — tên phải khớp giữa 2 DB)
    SELECT format('index|%s|%s',
                  i.relname,
                  regexp_replace(pg_get_indexdef(ix.indexrelid), '\s+', ' ', 'g'))
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN rel c ON c.oid = ix.indrelid

    UNION ALL
    -- Sequence (identity/serial)
    SELECT format('sequence|%s|%s|%s|%s',
                  c.relname, format_type(s.seqtypid, NULL), s.seqstart, s.seqincrement)
    FROM pg_sequence s
    JOIN rel c ON c.oid = s.seqrelid

    UNION ALL
    -- Function: tên + tham số + kiểu trả về + ngôn ngữ + md5 thân hàm
    SELECT format('function|%s(%s)|%s|%s|%s',
                  p.proname,
                  pg_get_function_identity_arguments(p.oid),
                  pg_get_function_result(p.oid),
                  l.lanname,
                  md5(p.prosrc))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public'

    UNION ALL
    -- Trigger (bỏ trigger nội bộ do FK sinh ra)
    SELECT format('trigger|%s|%s|%s',
                  c.relname, t.tgname,
                  regexp_replace(pg_get_triggerdef(t.oid), '\s+', ' ', 'g'))
    FROM pg_trigger t
    JOIN rel c ON c.oid = t.tgrelid
    WHERE NOT t.tgisinternal

    UNION ALL
    -- Enum type + nhãn
    SELECT format('enum|%s|%s|%s', t.typname, e.enumlabel, e.enumsortorder)
    FROM pg_type t
    JOIN pg_enum e ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'

    UNION ALL
    -- Extension (vd pgvector)
    SELECT format('extension|%s|%s', extname, extversion)
    FROM pg_extension

    UNION ALL
    -- View / materialized view (so bằng md5 định nghĩa để bỏ qua whitespace)
    SELECT format('view|%s|%s', c.relname, md5(pg_get_viewdef(c.oid, true)))
    FROM rel c
    WHERE c.relkind IN ('v', 'm')

    UNION ALL
    -- Row-level security policy
    SELECT format('policy|%s|%s|%s',
                  c.relname, pol.polname,
                  regexp_replace(COALESCE(pg_get_expr(pol.polqual, pol.polrelid), '-'), '\s+', ' ', 'g'))
    FROM pg_policy pol
    JOIN rel c ON c.oid = pol.polrelid
) t
ORDER BY line;
