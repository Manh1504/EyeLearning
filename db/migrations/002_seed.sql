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
-- TÀI KHOẢN MẪU — 1 admin, 1 giáo viên, 1 sinh viên
-- Idempotent: dựa vào email UNIQUE nên chạy lại không tạo trùng.
-- ⚠️ password_hash bên dưới là PLACEHOLDER, cần thay bằng hash thật
--    (bcrypt) khi deploy production. Trong 002_seed.sql dùng hash mẫu
--    của "Password123!" để test nhanh.
-- =====================================================================

-- ---------------------------------------------------------------------
-- users + profiles + user_roles cho ADMIN
-- ---------------------------------------------------------------------
INSERT INTO users (email, password_hash, status_id)
SELECT 'admin@school.edu.vn',
       '$2b$12$1q/iiUi4DF25DxUvlvyt5uUDwDBsEpGbTj5SqkEudV9QZCQhwYDoq',
       s.id
FROM user_statuses s WHERE s.code = 'active'
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u JOIN roles r ON r.code = 'admin'
WHERE u.email = 'admin@school.edu.vn'
ON CONFLICT DO NOTHING;

INSERT INTO user_profiles (user_id, full_name, email, gender_id)
SELECT u.id, 'Quản Trị Viên Hệ Thống', u.email, g.id
FROM users u JOIN genders g ON g.code = 'male'
WHERE u.email = 'admin@school.edu.vn'
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- users + profiles + user_roles + teacher_profiles cho GIÁO VIÊN
-- ---------------------------------------------------------------------
INSERT INTO users (email, password_hash, status_id)
SELECT 'teacher@school.edu.vn',
       '$2b$12$1q/iiUi4DF25DxUvlvyt5uUDwDBsEpGbTj5SqkEudV9QZCQhwYDoq',
       s.id
FROM user_statuses s WHERE s.code = 'active'
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u JOIN roles r ON r.code = 'teacher'
WHERE u.email = 'teacher@school.edu.vn'
ON CONFLICT DO NOTHING;

INSERT INTO user_profiles (user_id, full_name, email, gender_id)
SELECT u.id, 'Giáo Viên Mẫu', u.email, g.id
FROM users u JOIN genders g ON g.code = 'female'
WHERE u.email = 'teacher@school.edu.vn'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO teacher_profiles (user_id, teacher_code, department)
SELECT u.id, 'GV0001', 'Khoa Công Nghệ Thông Tin'
FROM users u
WHERE u.email = 'teacher@school.edu.vn'
ON CONFLICT (user_id) DO NOTHING;

-- ---------------------------------------------------------------------
-- users + profiles + user_roles + student_profiles cho SINH VIÊN
-- ---------------------------------------------------------------------
INSERT INTO users (email, password_hash, status_id)
SELECT 'student@school.edu.vn',
       '$2b$12$1q/iiUi4DF25DxUvlvyt5uUDwDBsEpGbTj5SqkEudV9QZCQhwYDoq',
       s.id
FROM user_statuses s WHERE s.code = 'active'
ON CONFLICT (email) DO NOTHING;

INSERT INTO user_roles (user_id, role_id)
SELECT u.id, r.id
FROM users u JOIN roles r ON r.code = 'student'
WHERE u.email = 'student@school.edu.vn'
ON CONFLICT DO NOTHING;

INSERT INTO user_profiles (user_id, full_name, email, gender_id)
SELECT u.id, 'Sinh Viên Mẫu', u.email, g.id
FROM users u JOIN genders g ON g.code = 'male'
WHERE u.email = 'student@school.edu.vn'
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO student_profiles (user_id, student_code, program)
SELECT u.id, 'SV0001', 'Công Nghệ Thông Tin K20'
FROM users u
WHERE u.email = 'student@school.edu.vn'
ON CONFLICT (user_id) DO NOTHING;

COMMIT;
