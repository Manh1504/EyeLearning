// lib/api/teacher.ts — Hàm API khu vực giảng viên (đã nối FastAPI).
//   GET   /api/teacher/courses?status=&q=            -> TeacherCourse[]
//   GET   /api/teacher/courses/{id}                   -> ModuleNode[]
//   GET   /api/teacher/courses/{id}/students          -> StudentRow[]
//   GET   /api/teacher/lessons/{id}/heatmap           -> SlideStat[]

import { apiFetch, apiFetchMultipart } from './client';
import type {
  TeacherCourse, CourseStatus, Level, ModuleNode, StudentRow, SlideStat,
} from '@/lib/types/domain';
import { formatShortDate } from '@/lib/utils';

export interface CourseListQuery {
  status?: CourseStatus;
  q?: string;
}

interface TeacherCourseRaw extends Omit<TeacherCourse, 'updatedAt'> {
  updatedAt: string;
}

// GET /api/teacher/courses?status=&q=
export function fetchTeacherCourses(query: CourseListQuery = {}): Promise<TeacherCourse[]> {
  const { status, q } = query;
  return apiFetch<TeacherCourseRaw[]>('/api/teacher/courses', {
    params: { status, q },
  }).then((courses) =>
    courses.map((course) => ({ ...course, updatedAt: formatShortDate(course.updatedAt) })),
  );
}

// GET /api/teacher/courses/{id} (kèm modules.lessons)
export function fetchCourseTree(courseId: string): Promise<ModuleNode[]> {
  return apiFetch<ModuleNode[]>(`/api/teacher/courses/${courseId}`);
}

// GET /api/teacher/courses/{id}/students (enrollments + lesson_progress)
export function fetchCourseStudents(courseId: string): Promise<StudentRow[]> {
  return apiFetch<StudentRow[]>(`/api/teacher/courses/${courseId}/students`);
}

export interface StudentDirectoryEntry {
  id: string;
  name: string;
  code: string;
  email?: string;
  color: string;
}

// GET /api/teacher/students?q= — danh mục học viên để thêm vào khóa học
export function fetchStudentDirectory(q?: string): Promise<StudentDirectoryEntry[]> {
  return apiFetch<StudentDirectoryEntry[]>(
    `/api/teacher/students${q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
  );
}

// POST /api/teacher/courses/{id}/students — enroll học viên vào khóa
export function addCourseStudents(
  courseId: string,
  studentIds: string[],
): Promise<{ ok: boolean; added: number }> {
  return apiFetch(`/api/teacher/courses/${courseId}/students`, {
    method: 'POST',
    body: { studentIds },
  });
}

// DELETE /api/teacher/courses/{id}/students/{studentId} — gỡ học viên (soft, status=dropped)
export function removeCourseStudent(
  courseId: string,
  studentId: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/api/teacher/courses/${courseId}/students/${studentId}`, {
    method: 'DELETE',
  });
}

// GET /api/teacher/lessons/{id}/heatmap?student_id=&content_id=
export function fetchHeatmap(
  lessonId: string,
  _slideCount: number,
  scope: 'class' | string = 'class',
): Promise<SlideStat[]> {
  return apiFetch<SlideStat[]>(`/api/teacher/lessons/${lessonId}/heatmap`, {
    params: scope === 'class' ? {} : { student_id: scope },
  });
}

// ---- Mutations: tạo / sửa / xóa khóa học ----

export interface CourseWriteInput {
  title: string;
  description?: string;
  level?: Level;
  status?: CourseStatus;
}

// POST /api/teacher/courses
export function createCourse(input: CourseWriteInput): Promise<TeacherCourse> {
  return apiFetch<TeacherCourse>('/api/teacher/courses', { method: 'POST', body: input });
}

// PATCH /api/teacher/courses/{id}
export function updateCourse(
  courseId: string,
  patch: Partial<CourseWriteInput>,
): Promise<TeacherCourse> {
  return apiFetch<TeacherCourse>(`/api/teacher/courses/${courseId}`, {
    method: 'PATCH',
    body: patch,
  });
}

// DELETE /api/teacher/courses/{id}
export function deleteCourse(courseId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/teacher/courses/${courseId}`, { method: 'DELETE' });
}

// POST /api/teacher/courses/{id}/modules
export function createModule(courseId: string, title: string): Promise<{ id: string }> {
  return apiFetch(`/api/teacher/courses/${courseId}/modules`, {
    method: 'POST',
    body: { title },
  });
}

// PATCH /api/teacher/modules/{id}
export function updateModule(moduleId: string, title: string): Promise<{ id: string }> {
  return apiFetch(`/api/teacher/modules/${moduleId}`, {
    method: 'PATCH',
    body: { title },
  });
}

// DELETE /api/teacher/modules/{id}
export function deleteModule(moduleId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/teacher/modules/${moduleId}`, { method: 'DELETE' });
}

// POST /api/teacher/modules/{id}/lessons
export function createLesson(moduleId: string, title: string): Promise<{ id: string }> {
  return apiFetch(`/api/teacher/modules/${moduleId}/lessons`, {
    method: 'POST',
    body: { title },
  });
}

// PATCH /api/teacher/lessons/{id}
export function updateLesson(lessonId: string, title: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/teacher/lessons/${lessonId}`, {
    method: 'PATCH',
    body: { title },
  });
}

// DELETE /api/teacher/lessons/{id}
export function deleteLesson(lessonId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/api/teacher/lessons/${lessonId}`, { method: 'DELETE' });
}

// POST /api/teacher/lessons/{id}/slides/upload — PDF → render slide ảnh
export function uploadLessonPdf(
  lessonId: string,
  pdf: Blob,
  filename: string,
): Promise<{ ok: boolean; slides: number }> {
  const form = new FormData();
  form.append('pdf', pdf, filename);
  return apiFetchMultipart(`/api/teacher/lessons/${lessonId}/slides/upload`, form, 'POST');
}
