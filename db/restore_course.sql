-- Khôi phục course bị soft-delete trong lúc test e2e (để /api/me/enrollments hoạt động)
UPDATE courses
SET deleted_at = NULL
WHERE title = 'E2E Course'
  AND deleted_at IS NOT NULL;