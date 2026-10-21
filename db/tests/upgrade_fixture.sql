-- upgrade_fixture.sql — dữ liệu "xấu" mà schema CŨ cho phép, dùng cho job CI
-- `migrations` để kiểm tra đường NÂNG CẤP trên DB có dữ liệu (DB rỗng không lộ
-- các lỗi kiểu này).
--
-- Cụ thể: 2 quiz_assignments CÙNG một lesson_id — đúng loại dữ liệu đã làm
-- migration 016 gãy khi tạo unique index TRƯỚC bước backfill (lỗi deploy thật).
--
-- Đặc điểm: idempotent, tự bỏ qua nếu schema chưa có bảng cần thiết, và chỉ dùng
-- các cột tồn tại ở CẢ schema cũ lẫn mới.
DO $$
DECLARE
    v_user    UUID;
    v_status  SMALLINT;
    v_course  UUID := 'f1000000-0000-0000-0000-000000000001';
    v_module  UUID := 'f1000000-0000-0000-0000-000000000002';
    v_lesson  UUID := 'f1000000-0000-0000-0000-000000000003';
BEGIN
    IF to_regclass('public.quiz_assignments') IS NULL
       OR to_regclass('public.lessons') IS NULL
       OR to_regclass('public.teacher_profiles') IS NULL THEN
        RAISE NOTICE 'fixture: schema thiếu bảng cần thiết — bỏ qua';
        RETURN;
    END IF;

    -- 002_seed KHÔNG tạo user (chỉ tạo bảng lookup), nên fixture tự tạo nếu cần.
    IF NOT EXISTS (SELECT 1 FROM user_statuses)
       OR NOT EXISTS (SELECT 1 FROM course_statuses) THEN
        RAISE NOTICE 'fixture: chưa có user_statuses/course_statuses — bỏ qua';
        RETURN;
    END IF;

    SELECT id INTO v_user FROM users ORDER BY created_at, id LIMIT 1;
    IF v_user IS NULL THEN
        INSERT INTO users (email, password_hash, status_id)
        SELECT 'fixture-ci@example.invalid', 'fixture',
               COALESCE((SELECT id FROM user_statuses WHERE code = 'active'),
                        (SELECT id FROM user_statuses ORDER BY id LIMIT 1))
        ON CONFLICT (email) DO NOTHING;
        SELECT id INTO v_user FROM users WHERE email = 'fixture-ci@example.invalid';
    END IF;

    SELECT COALESCE((SELECT id FROM course_statuses WHERE code = 'draft'),
                    (SELECT id FROM course_statuses ORDER BY id LIMIT 1)) INTO v_status;
    IF v_user IS NULL OR v_status IS NULL THEN
        RAISE NOTICE 'fixture: không tạo được user/course_status — bỏ qua';
        RETURN;
    END IF;

    INSERT INTO teacher_profiles (user_id, teacher_code, department)
    VALUES (v_user, 'FIXTURE01', 'Fixture')
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO courses (id, title, description, status_id, teacher_id, created_by)
    VALUES (v_course, 'Fixture course', 'fixture cho CI upgrade test', v_status, v_user, v_user)
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO modules (id, course_id, title, order_index)
    VALUES (v_module, v_course, 'Fixture module', 1)
    ON CONFLICT DO NOTHING;

    INSERT INTO lessons (id, module_id, title, order_index)
    VALUES (v_lesson, v_module, 'Fixture lesson', 1)
    ON CONFLICT DO NOTHING;

    -- Dữ liệu cũ có thể có nhiều bài tập trên CÙNG một item: trước 016 bảng chưa có
    -- ràng buộc 1:1. Nếu bản đang chạy đã tạo unique index (016 chạy trên DB rỗng
    -- vẫn tạo được), bỏ index đó đi để mô phỏng đúng DB legacy.
    IF to_regclass('public.ux_quiz_assignments_lesson') IS NOT NULL THEN
        DROP INDEX public.ux_quiz_assignments_lesson;
        RAISE NOTICE 'fixture: đã bỏ ux_quiz_assignments_lesson để mô phỏng DB legacy';
    END IF;

    -- HAI bài tập cùng một lesson: bản cũ cho phép, 016 phải tách ra được.
    INSERT INTO quiz_assignments
        (id, course_id, lesson_id, created_by, title, due_at, duration_minutes, status, questions)
    VALUES
        ('f1000000-0000-0000-0000-000000000004', v_course, v_lesson, v_user,
         'Fixture quiz 1', now() + interval '1 day', 10, 'draft', '[]'::jsonb),
        ('f1000000-0000-0000-0000-000000000005', v_course, v_lesson, v_user,
         'Fixture quiz 2', now() + interval '2 day', 10, 'draft', '[]'::jsonb)
    ON CONFLICT (id) DO NOTHING;

    RAISE NOTICE 'fixture: đã tạo dữ liệu trùng lesson_id cho quiz_assignments';
END $$;
