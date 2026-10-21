-- =====================================================================
-- seed_dev_users.sql — TÀI KHOẢN MẪU CHO DEV (KHÔNG chạy tự động).
--
-- ⚠️ KHÔNG nằm trong db/migrations/ nên Dockerfile.migrations sẽ KHÔNG chạy file
--    này. Chỉ chạy thủ công khi phát triển:
--        psql -h localhost -p 5435 -U postgres -d eyetracking -f db/seed_dev_users.sql
--
-- Mật khẩu của cả 3 tài khoản là "Password123!" (hash bcrypt bên dưới).
-- Mọi tài khoản được đặt must_change_password = true để buộc đổi mật khẩu ngay
-- lần đăng nhập đầu tiên (xem backend: POST /api/auth/change-password).
--
-- Idempotent: dựa vào email UNIQUE.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- ADMIN
-- ---------------------------------------------------------------------
INSERT INTO users (email, password_hash, status_id, must_change_password)
SELECT 'admin@school.edu.vn',
       '$2b$12$1q/iiUi4DF25DxUvlvyt5uUDwDBsEpGbTj5SqkEudV9QZCQhwYDoq',
       s.id,
       true
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
-- GIÁO VIÊN
-- ---------------------------------------------------------------------
INSERT INTO users (email, password_hash, status_id, must_change_password)
SELECT 'teacher@school.edu.vn',
       '$2b$12$1q/iiUi4DF25DxUvlvyt5uUDwDBsEpGbTj5SqkEudV9QZCQhwYDoq',
       s.id,
       true
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
-- SINH VIÊN
-- ---------------------------------------------------------------------
INSERT INTO users (email, password_hash, status_id, must_change_password)
SELECT 'student@school.edu.vn',
       '$2b$12$1q/iiUi4DF25DxUvlvyt5uUDwDBsEpGbTj5SqkEudV9QZCQhwYDoq',
       s.id,
       true
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
