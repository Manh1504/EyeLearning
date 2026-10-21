-- 016_quiz_items.sql — Bài tập trắc nghiệm là một loại "lesson" trong chương.
-- Một chương chứa danh sách item có thứ tự: bài học slide (kind='lesson') hoặc
-- bài tập trắc nghiệm (kind='quiz'). Item quiz có đúng một quiz_assignments (1:1).
-- Idempotent: file này chạy lại mỗi lần deploy (không có bảng tracking).

BEGIN;

-- 1) Loại item cho lessons.
ALTER TABLE lessons
    ADD COLUMN IF NOT EXISTS kind VARCHAR(10) NOT NULL DEFAULT 'lesson';
ALTER TABLE lessons DROP CONSTRAINT IF EXISTS lessons_kind_check;
ALTER TABLE lessons
    ADD CONSTRAINT lessons_kind_check CHECK (kind IN ('lesson', 'quiz'));
CREATE INDEX IF NOT EXISTS idx_lessons_module_kind ON lessons(module_id, kind);

-- 2) Hạn nộp không bắt buộc (thời lượng vẫn bắt buộc => có đồng hồ đếm ngược).
ALTER TABLE quiz_assignments ALTER COLUMN due_at DROP NOT NULL;

-- 3) Mỗi bài tập gắn đúng một item quiz trong chương.
CREATE UNIQUE INDEX IF NOT EXISTS ux_quiz_assignments_lesson
    ON quiz_assignments(lesson_id) WHERE lesson_id IS NOT NULL;

-- 4) Backfill: quiz cũ (gắn vào bài học hoặc ở cấp khóa học) trở thành item quiz.
DO $$
DECLARE
    r RECORD;
    target_module UUID;
    next_index INT;
    new_lesson_id UUID;
BEGIN
    FOR r IN
        SELECT q.id, q.title, q.course_id, q.lesson_id, q.created_at
        FROM quiz_assignments q
        WHERE q.lesson_id IS NULL
           OR NOT EXISTS (
                SELECT 1 FROM lessons l WHERE l.id = q.lesson_id AND l.kind = 'quiz'
           )
        ORDER BY q.created_at
    LOOP
        target_module := NULL;
        IF r.lesson_id IS NOT NULL THEN
            SELECT m.id INTO target_module
            FROM lessons l JOIN modules m ON m.id = l.module_id
            WHERE l.id = r.lesson_id;
        END IF;
        IF target_module IS NULL THEN
            SELECT m.id INTO target_module
            FROM modules m WHERE m.course_id = r.course_id
            ORDER BY m.order_index LIMIT 1;
        END IF;
        IF target_module IS NULL THEN
            INSERT INTO modules (course_id, title, order_index)
            VALUES (
                r.course_id, 'Bài tập',
                COALESCE((SELECT MAX(m.order_index) FROM modules m WHERE m.course_id = r.course_id), 0) + 1
            )
            RETURNING id INTO target_module;
        END IF;
        SELECT COALESCE(MAX(l.order_index), 0) + 1 INTO next_index
        FROM lessons l WHERE l.module_id = target_module;
        INSERT INTO lessons (module_id, title, order_index, kind)
        VALUES (target_module, r.title, next_index, 'quiz')
        RETURNING id INTO new_lesson_id;
        UPDATE quiz_assignments SET lesson_id = new_lesson_id WHERE id = r.id;
    END LOOP;
END $$;

-- 5) Câu hỏi cũ (correctOptionId một đáp án) -> nhiều đáp án (correctOptionIds).
UPDATE quiz_assignments AS target
SET questions = sub.converted
FROM (
    SELECT a.id,
           jsonb_agg(
               CASE
                   WHEN q ? 'correctOptionIds' THEN q
                   ELSE (q - 'correctOptionId')
                        || jsonb_build_object(
                               'correctOptionIds',
                               jsonb_build_array(q->>'correctOptionId')
                           )
               END
           ) AS converted
    FROM (
        SELECT id, questions
        FROM quiz_assignments
        WHERE jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) > 0
    ) a
    CROSS JOIN LATERAL jsonb_array_elements(a.questions) AS q
    GROUP BY a.id
    HAVING bool_or(q ? 'correctOptionId')
) AS sub
WHERE target.id = sub.id;

-- 6) Xóa item quiz thì xóa luôn bài tập (tránh orphan quiz_assignments).
--    FK gốc ở 011 là ON DELETE SET NULL; thay bằng CASCADE.
DO $$
DECLARE
    cname TEXT;
BEGIN
    FOR cname IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'quiz_assignments'::regclass
          AND contype = 'f'
          AND confrelid = 'lessons'::regclass
    LOOP
        EXECUTE format('ALTER TABLE quiz_assignments DROP CONSTRAINT %I', cname);
    END LOOP;
END $$;
ALTER TABLE quiz_assignments
    ADD CONSTRAINT quiz_assignments_lesson_id_fkey
    FOREIGN KEY (lesson_id) REFERENCES lessons(id) ON DELETE CASCADE;

COMMIT;
