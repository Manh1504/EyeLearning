// lib/api/admin.ts — API khu vực quản trị viên (FastAPI).
//   GET    /api/admin/teachers                           -> TeacherDirectory[]
//   GET    /api/admin/courses/{id}/teachers              -> CourseTeacher[]
//   POST   /api/admin/courses/{id}/teachers {teacherIds} -> gán nhiều GV
//   DELETE /api/admin/courses/{id}/teachers/{teacherId}  -> gỡ phân công

import { apiFetch } from './client';

export interface TeacherDirectory {
  id: string;
  name: string;
  code: string;
  email?: string | null;
  department?: string | null;
}

export interface CourseTeacher {
  teacherId: string;
  name: string;
  code: string;
  email?: string | null;
  isOwner: boolean;
}

export function fetchTeachers(q?: string): Promise<TeacherDirectory[]> {
  return apiFetch<TeacherDirectory[]>('/api/admin/teachers', { params: { q } });
}

export function fetchCourseTeachers(courseId: string): Promise<CourseTeacher[]> {
  return apiFetch<CourseTeacher[]>(`/api/admin/courses/${courseId}/teachers`);
}

export function assignTeachers(
  courseId: string,
  teacherIds: string[],
): Promise<{ ok: boolean; assigned: string[]; added: number }> {
  return apiFetch(`/api/admin/courses/${courseId}/teachers`, {
    method: 'POST',
    body: { teacherIds },
  });
}

export function unassignTeacher(
  courseId: string,
  teacherId: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/admin/courses/${courseId}/teachers/${teacherId}`, {
    method: 'DELETE',
  });
}