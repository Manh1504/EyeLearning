BEGIN;

-- ============================================================================
-- 013 — Sửa FK gaze_events + bổ sung index còn thiếu + cờ must_change_password.
--
-- 1) gaze_events.lesson_content_id trước đây REFERENCES lesson_contents(id)
--    KHÔNG có ON DELETE. Backend hard-delete slide/bài/chương
--    (backend/app/api/routes/lessons.py, modules.py) nên khi một slide đã có
--    dữ liệu gaze, thao tác xoá vấp FK → lỗi 500.
--    → chuyển sang ON DELETE CASCADE (xoá slide thì xoá luôn gaze của slide đó).
--
-- 2) Index cho 2 FK nóng chưa được PK/UNIQUE phủ.
--
-- 3) users.must_change_password: buộc đổi mật khẩu lần đăng nhập đầu (dùng cho
--    tài khoản seed dev; xem db/seed_dev_users.sql).
--
-- Idempotent: chạy lại an toàn (migration chạy toàn bộ mỗi lần deploy).
-- ============================================================================

-- 1) FK cascade cho gaze_events.lesson_content_id ---------------------------
-- confdeltype: 'a' = NO ACTION (mặc định), 'c' = CASCADE.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'gaze_events'::regclass
           AND conname  = 'gaze_events_lesson_content_id_fkey'
           AND confdeltype <> 'c'
    ) THEN
        ALTER TABLE gaze_events DROP CONSTRAINT gaze_events_lesson_content_id_fkey;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
         WHERE conrelid = 'gaze_events'::regclass
           AND conname  = 'gaze_events_lesson_content_id_fkey'
    ) THEN
        ALTER TABLE gaze_events
            ADD CONSTRAINT gaze_events_lesson_content_id_fkey
            FOREIGN KEY (lesson_content_id)
            REFERENCES lesson_contents(id)
            ON DELETE CASCADE;
    END IF;
END $$;

-- 2) Index còn thiếu -------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_slide_coverage_stats_content
    ON slide_coverage_stats (lesson_content_id);
CREATE INDEX IF NOT EXISTS idx_aoi_dwell_stats_region
    ON aoi_dwell_stats (aoi_region_id);

-- 3) users.must_change_password -------------------------------------------
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false;

COMMIT;
