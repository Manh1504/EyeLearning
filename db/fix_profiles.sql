-- Sửa dữ liệu seed bị mất dấu (tiếng Việt) trong student_profiles / teacher_profiles
UPDATE teacher_profiles SET department = 'Khoa Công Nghệ Thông Tin'
WHERE teacher_code = 'GV0001';

UPDATE student_profiles SET program = 'Công Nghệ Thông Tin K20'
WHERE student_code = 'SV0001';