-- Seed dữ liệu tối thiểu để chạy demo lần đầu.
--
-- Frontend hard-code LESSON_ID = "L001" ở nhiều nơi (session.js, StartPage.jsx,
-- LessonPage.jsx, TeacherPage.jsx) và KHÔNG có endpoint POST /lessons nào để
-- tạo lesson qua API — nên nếu không seed sẵn, tạo session đầu tiên sẽ lỗi
-- FK violation (sessions.lesson_id -> lessons.lesson_id không tồn tại).

INSERT INTO lessons (lesson_id, lesson_title, teacher_id, lesson_description, layout_version)
VALUES (
    'L001',
    'Đọc biểu đồ dữ liệu',
    NULL,   -- teacher_id nullable (ON DELETE SET NULL) — không bắt buộc phải có user giáo viên
    'Bài giảng demo dùng để test luồng calibration + gaze tracking + heatmap.',
    'v1'
)
ON CONFLICT (lesson_id) DO NOTHING;

-- 9 AOI demo — khớp DEMO_AOIS trong web/routers/lessons.py (_seed_demo_aois()).
-- Bình thường được seed qua POST /lessons/L001/aois/seed-demo, nhưng insert
-- thẳng ở đây để không phụ thuộc phải gọi API sau khi container mới lên.
INSERT INTO aoi_definitions (aoi_id, lesson_id, layout_version, aoi_key, aoi_name, css_selector, aoi_type, is_learning_area, is_active)
VALUES
    ('AOI_VIDEO_L001',      'L001', 'v1', 'video_area',       'Video Area',       '.video-box',        'video',      TRUE,  TRUE),
    ('AOI_TRANSCRIPT_L001', 'L001', 'v1', 'transcript_panel', 'Transcript Panel', '.transcript-panel', 'text',       TRUE,  TRUE),
    ('AOI_QUIZ_L001',       'L001', 'v1', 'quiz_area',        'Quiz Area',        '.quiz-box',         'quiz',       TRUE,  TRUE),
    ('AOI_NOTES_L001',      'L001', 'v1', 'notes_panel',      'Notes Panel',      '.notes-panel',      'notes',      TRUE,  TRUE),
    ('AOI_SIDEBAR_L001',    'L001', 'v1', 'lesson_sidebar',   'Lesson Sidebar',   '.sidebar',          'navigation', FALSE, TRUE),
    ('AOI_HEADER_L001',     'L001', 'v1', 'lesson_header',    'Lesson Header',    '.lesson-main h1',   'header',     FALSE, TRUE),
    ('AOI_TOP_NAV_L001',    'L001', 'v1', 'top_nav',          'Top Navigation',   '.topbar',           'navigation', FALSE, TRUE),
    ('AOI_TRACKING_L001',   'L001', 'v1', 'tracking_panel',   'Tracking Panel',   '.status-chips',     'control',    FALSE, TRUE),
    ('AOI_COMPLETION_L001', 'L001', 'v1', 'completion_panel', 'Completion Panel', '.finish-btn',       'control',    FALSE, TRUE)
ON CONFLICT (lesson_id, layout_version, aoi_key) DO NOTHING;
