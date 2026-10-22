-- 021_course_show_gaze_dot.sql
--
-- Gồm 2 thay đổi schema độc lập nhưng cùng phục vụ tính năng "điểm nhìn":
--
-- 1) Cờ "hiển thị điểm nhìn cho sinh viên" chuyển từ cấp BÀI HỌC lên cấp KHÓA HỌC
--    (courses.show_gaze_dot). Trước đây cờ nằm ở lessons.show_gaze_dot (017) và
--    công tắc cấp khóa chỉ là thao tác hàng loạt (fan-out) — nên không có nguồn
--    sự thật duy nhất và bài tập trắc nghiệm không có cờ.
--    Backfill: khóa được bật khi khóa CÓ bài giảng và MỌI bài giảng đang bật —
--    đúng bằng giá trị công tắc cấp khóa mà giáo viên đang thấy trước nâng cấp
--    (logic all_on cũ). Sau đó bỏ hẳn cột lessons.show_gaze_dot.
--
-- 2) Ghi gaze cho BÀI TẬP TRẮC NGHIỆM (lessons.kind = 'quiz' không có
--    lesson_contents/slide):
--    - gaze_events.lesson_content_id cho phép NULL (bài tập không có slide).
--    - gaze_events.surface: 'slide' | 'quiz' — khung toạ độ của dòng dữ liệu:
--        + 'slide': gaze_x/y chuẩn hoá theo ảnh slide (hành vi cũ, mặc định).
--        + 'quiz' : gaze_x/y chuẩn hoá theo VIEWPORT (toạ độ thô AI service trả về).
--      Cột này giữ cho dữ liệu tự mô tả khi export phân tích, không phải suy diễn
--      từ `lesson_content_id IS NULL`.
--    - gaze_session_stats: tổng hợp mức PHIÊN cho bài KHÔNG có slide, vì
--      gaze_slide_stats gắn chặt lesson_content_id (NOT NULL + UNIQUE) nên không
--      dùng được cho bài tập.
--
-- Idempotent: chạy lại nhiều lần an toàn.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Cờ hiển thị điểm nhìn: cấp bài học -> cấp khóa học
-- ---------------------------------------------------------------------------
ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS show_gaze_dot BOOLEAN NOT NULL DEFAULT false;

-- Backfill dữ liệu cũ (chỉ có ý nghĩa ở lần chạy đầu, khi cột cũ còn tồn tại).
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
          FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = 'lessons'
           AND column_name = 'show_gaze_dot'
    ) THEN
        UPDATE courses c
           SET show_gaze_dot = true
         WHERE EXISTS (
                   SELECT 1
                     FROM modules m
                     JOIN lessons l ON l.module_id = m.id
                    WHERE m.course_id = c.id
                      AND l.kind = 'lesson'
               )
           -- Mọi bài giảng (không tính bài tập) đều đang bật.
           AND NOT EXISTS (
                   SELECT 1
                     FROM modules m
                     JOIN lessons l ON l.module_id = m.id
                    WHERE m.course_id = c.id
                      AND l.kind = 'lesson'
                      AND l.show_gaze_dot IS NOT TRUE
               );
    END IF;
END $$;

ALTER TABLE lessons DROP COLUMN IF EXISTS show_gaze_dot;

-- ---------------------------------------------------------------------------
-- 2) Gaze cho bài tập trắc nghiệm (không có slide)
-- ---------------------------------------------------------------------------

-- Khung toạ độ của dòng gaze ('slide' = theo ảnh slide, 'quiz' = theo viewport).
ALTER TABLE gaze_events
    ADD COLUMN IF NOT EXISTS surface VARCHAR(8) NOT NULL DEFAULT 'slide';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'gaze_events_surface_check'
    ) THEN
        ALTER TABLE gaze_events
            ADD CONSTRAINT gaze_events_surface_check
            CHECK (surface IN ('slide', 'quiz'));
    END IF;
END $$;

-- Bài tập không có lesson_contents -> cho phép NULL (FK vẫn giữ cho bài giảng).
ALTER TABLE gaze_events
    ALTER COLUMN lesson_content_id DROP NOT NULL;

-- Tổng hợp mức phiên cho bài không có slide.
CREATE TABLE IF NOT EXISTS gaze_session_stats (
    learning_session_id UUID PRIMARY KEY
        REFERENCES learning_sessions(id) ON DELETE CASCADE,
    total_samples      INTEGER     NOT NULL DEFAULT 0,
    on_screen_samples  INTEGER     NOT NULL DEFAULT 0,
    view_ms            BIGINT      NOT NULL DEFAULT 0,
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
