-- learning_events và aoi_snapshots cũng CHƯA TỪNG được tạo ở migration nào,
-- dù models.py đã định nghĩa class từ trước. Đặt sau 001 (không phải trong
-- 000) vì cả 2 đều REFERENCES aoi_definitions, bảng đó tạo ở 001.
--
-- aoi_snapshots hiện là BẢNG CHẾT trong code thật — không route nào insert
-- (kiến trúc thật resolve AOI real-time qua target_zone ở client, xem review
-- trước đó). Tạo bảng ở đây chỉ để khớp models.py, tránh lỗi "relation does
-- not exist" nếu sau này có code nào query tới. Quyết định giữ/bỏ vẫn để mở.

CREATE TABLE IF NOT EXISTS learning_events (
    event_id      TEXT PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    event_type    TEXT NOT NULL,
    target_aoi_id TEXT REFERENCES aoi_definitions(aoi_id) ON DELETE SET NULL,
    timestamp_ms  BIGINT NOT NULL,
    event_value   JSONB
);

CREATE TABLE IF NOT EXISTS aoi_snapshots (
    snapshot_id    TEXT PRIMARY KEY,
    session_id     TEXT NOT NULL REFERENCES sessions(session_id) ON DELETE CASCADE,
    aoi_id         TEXT NOT NULL REFERENCES aoi_definitions(aoi_id) ON DELETE CASCADE,
    viewport_x     DOUBLE PRECISION NOT NULL,
    viewport_y     DOUBLE PRECISION NOT NULL,
    viewport_w     DOUBLE PRECISION NOT NULL,
    viewport_h     DOUBLE PRECISION NOT NULL,
    scroll_x       DOUBLE PRECISION NOT NULL DEFAULT 0,
    scroll_y       DOUBLE PRECISION NOT NULL DEFAULT 0,
    captured_at_ms BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_learning_events_session_id ON learning_events (session_id);
CREATE INDEX IF NOT EXISTS idx_aoi_snapshots_session_id ON aoi_snapshots (session_id);
