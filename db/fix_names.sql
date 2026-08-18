-- Sửa tên hiển thị bị mất dấu khi seed (đặt lại giá trị UTF-8 chuẩn)
UPDATE user_profiles SET full_name = 'Quản Trị Viên Hệ Thống'
WHERE user_id = (SELECT id FROM users WHERE email = 'admin@school.edu.vn');

UPDATE user_profiles SET full_name = 'Giáo Viên Mẫu'
WHERE user_id = (SELECT id FROM users WHERE email = 'teacher@school.edu.vn');

UPDATE user_profiles SET full_name = 'Sinh Viên Mẫu'
WHERE user_id = (SELECT id FROM users WHERE email = 'student@school.edu.vn');