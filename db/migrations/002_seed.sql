-- =====================================================================
-- SEED DỮ LIỆU LOOKUP — chạy sau 001_init.sql
-- Chạy: psql -d eyetracking -f 002_seed.sql
-- Idempotent: ON CONFLICT (code) DO NOTHING
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- user_statuses
-- ---------------------------------------------------------------------
INSERT INTO user_statuses (code, label) VALUES
    ('active',               'Đang hoạt động'),
    ('suspended',            'Tạm khóa'),
    ('banned',               'Bị cấm')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- roles — 3 role: admin, teacher, student
-- ---------------------------------------------------------------------
INSERT INTO roles (code, label) VALUES
    ('admin',   'Quản trị viên'),
    ('teacher', 'Giáo viên'),
    ('student', 'Học sinh')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- permissions
-- ---------------------------------------------------------------------
INSERT INTO permissions (code, label) VALUES
    ('course.create',      'Tạo khóa học'),
    ('course.read',        'Xem khóa học'),
    ('course.update',      'Sửa khóa học'),
    ('course.delete',      'Xóa khóa học'),
    ('course.publish',     'Xuất bản / thu hồi khóa học'),
    ('lesson.manage',      'Quản lý chương và bài học'),
    ('enrollment.enroll',  'Đăng ký khóa học'),
    ('enrollment.view',    'Xem danh sách học viên của lớp'),
    ('heatmap.view.class', 'Xem heatmap của cả lớp'),
    ('analytics.view',     'Xem báo cáo phân tích hành vi'),
    ('calibration.create', 'Thực hiện calibration thiết bị'),
    ('user.manage',        'Quản lý người dùng'),
    ('role.manage',        'Quản lý vai trò và phân quyền')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- role_permissions
--   admin   : toàn quyền
--   teacher : quản lý nội dung khóa học của mình + xem phân tích lớp
--   student : học, xem heatmap của mình, tự calibration
-- ---------------------------------------------------------------------
WITH map(role_code, perm_code) AS (VALUES
    ('admin',   'course.create'),
    ('admin',   'course.read'),
    ('admin',   'course.update'),
    ('admin',   'course.delete'),
    ('admin',   'course.publish'),
    ('admin',   'lesson.manage'),
    ('admin',   'aoi.manage'),
    ('admin',   'enrollment.enroll'),
    ('admin',   'enrollment.view'),
    ('admin',   'heatmap.view.class'),
    ('admin',   'analytics.view'),
    ('admin',   'calibration.create'),
    ('admin',   'user.manage'),
    ('admin',   'role.manage'),

    ('teacher', 'course.create'),
    ('teacher', 'course.read'),
    ('teacher', 'course.update'),
    ('teacher', 'course.delete'),
    ('teacher', 'course.publish'),
    ('teacher', 'lesson.manage'),
    ('teacher', 'aoi.manage'),
    ('teacher', 'enrollment.view'),
    ('teacher', 'heatmap.view.class'),
    ('teacher', 'analytics.view'),
    ('teacher', 'calibration.create'),

    ('student', 'course.read'),
    ('student', 'enrollment.enroll'),
    ('student', 'calibration.create')
)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM map m
JOIN roles r       ON r.code = m.role_code
JOIN permissions p ON p.code = m.perm_code
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------
-- genders
-- ---------------------------------------------------------------------
INSERT INTO genders (code, label) VALUES
    ('male',   'Nam'),
    ('female', 'Nữ'),
    ('other',  'Khác')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------
-- course_statuses
-- ---------------------------------------------------------------------
INSERT INTO course_statuses (code, label) VALUES
    ('draft',     'Bản nháp'),
    ('published', 'Đã xuất bản'),
    ('archived',  'Đã lưu trữ')
ON CONFLICT (code) DO NOTHING;

-- =====================================================================
-- TÀI KHOẢN MẪU đã được CHUYỂN RA khỏi migrations.
-- Migrations chạy lại toàn bộ mỗi lần deploy nên KHÔNG được tạo/ghi đè tài
-- khoản người dùng ở đây. Tài khoản dev (admin/teacher/student) nằm ở
-- db/seed_dev_users.sql và chỉ chạy THỦ CÔNG khi phát triển.
-- =====================================================================

COMMIT;
