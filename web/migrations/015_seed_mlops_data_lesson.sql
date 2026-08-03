INSERT INTO courses (course_id, course_title, course_description)
VALUES (
    'C002',
    'MLOps',
    'Khóa học về data stage, scoping và vận hành hệ thống machine learning trong production.'
)
ON CONFLICT (course_id) DO UPDATE
SET
    course_title = EXCLUDED.course_title,
    course_description = EXCLUDED.course_description;

INSERT INTO lessons (lesson_id, lesson_title, teacher_id, lesson_description, layout_version, course_id)
VALUES (
    'L002',
    'Data Stage and Scoping',
    NULL,
    'Bài học được chuyển từ tài liệu MLOPs_data.pdf thành 54 slide học trong ELA.',
    'v1',
    'C002'
)
ON CONFLICT (lesson_id) DO UPDATE
SET
    lesson_title = EXCLUDED.lesson_title,
    lesson_description = EXCLUDED.lesson_description,
    layout_version = EXCLUDED.layout_version,
    course_id = EXCLUDED.course_id;

INSERT INTO aoi_definitions (aoi_id, lesson_id, layout_version, aoi_key, aoi_name, css_selector, aoi_type, is_learning_area, is_active)
VALUES
    ('AOI_SLIDE_CONTENT_L002', 'L002', 'v1', 'transcript_panel', 'Slide Content', '.slide-canvas', 'slide', TRUE, TRUE),
    ('AOI_UI_CONTROLS_L002', 'L002', 'v1', 'ui_controls', 'Lesson Controls', '.lesson-controls', 'control', FALSE, TRUE),
    ('AOI_LESSON_HEADER_L002', 'L002', 'v1', 'lesson_header', 'Lesson Header', '.lesson-viewer-header', 'header', FALSE, TRUE)
ON CONFLICT (lesson_id, layout_version, aoi_key) DO UPDATE
SET
    aoi_name = EXCLUDED.aoi_name,
    css_selector = EXCLUDED.css_selector,
    aoi_type = EXCLUDED.aoi_type,
    is_learning_area = EXCLUDED.is_learning_area,
    is_active = EXCLUDED.is_active;

INSERT INTO course_enrollments (student_id, course_id, enrolled_by, status)
SELECT user_id, 'C002', NULL, 'active'
FROM users
WHERE role = 'student'
ON CONFLICT (student_id, course_id) DO UPDATE
SET status = 'active';

INSERT INTO teacher_course_assignments (teacher_id, course_id, assigned_by)
SELECT user_id, 'C002', NULL
FROM users
WHERE role IN ('teacher', 'instructor')
ON CONFLICT (teacher_id, course_id) DO NOTHING;
