// lib/api/teacher.ts — Hàm API khu vực giảng viên (đã nối FastAPI).
//   GET   /teacher/courses?status=&q=            -> TeacherCourse[]
//   GET   /teacher/courses/{id}                   -> ModuleNode[]
//   GET   /teacher/courses/{id}/students          -> StudentRow[]
//   GET   /teacher/lessons/{id}/heatmap           -> SlideStat[]

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

// GET /teacher/courses?status=&q=
export function fetchTeacherCourses(query: CourseListQuery = {}): Promise<TeacherCourse[]> {
  const { status, q } = query;
  return apiFetch<TeacherCourseRaw[]>('/teacher/courses', {
    params: { status, q },
  }).then((courses) =>
    courses.map((course) => ({ ...course, updatedAt: formatShortDate(course.updatedAt) })),
  );
}

// GET /teacher/courses/{id} (kèm modules.lessons)
export function fetchCourseTree(courseId: string): Promise<ModuleNode[]> {
  return apiFetch<ModuleNode[]>(`/teacher/courses/${courseId}`);
}

// GET /teacher/courses/{id}/students (enrollments + lesson_progress)
export function fetchCourseStudents(courseId: string): Promise<StudentRow[]> {
  return apiFetch<StudentRow[]>(`/teacher/courses/${courseId}/students`);
}

export interface StudentDirectoryEntry {
  id: string;
  name: string;
  code: string;
  email?: string;
  color: string;
}

// GET /teacher/students?q= — danh mục học viên để thêm vào khóa học
export function fetchStudentDirectory(q?: string): Promise<StudentDirectoryEntry[]> {
  return apiFetch<StudentDirectoryEntry[]>(
    `/teacher/students${q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`,
  );
}

// POST /teacher/courses/{id}/students — enroll học viên vào khóa
export function addCourseStudents(
  courseId: string,
  studentIds: string[],
): Promise<{ ok: boolean; added: number }> {
  return apiFetch(`/teacher/courses/${courseId}/students`, {
    method: 'POST',
    body: { studentIds },
  });
}

// DELETE /teacher/courses/{id}/students/{studentId} — gỡ học viên (soft, status=dropped)
export function removeCourseStudent(
  courseId: string,
  studentId: string,
): Promise<{ ok: boolean }> {
  return apiFetch(`/teacher/courses/${courseId}/students/${studentId}`, {
    method: 'DELETE',
  });
}

// GET /teacher/lessons/{id}/heatmap?student_id=&content_id=
export function fetchHeatmap(
  lessonId: string,
  _slideCount: number,
  scope: 'class' | string = 'class',
): Promise<SlideStat[]> {
  return apiFetch<SlideStat[]>(`/teacher/lessons/${lessonId}/heatmap`, {
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

// POST /teacher/courses
export function createCourse(input: CourseWriteInput): Promise<TeacherCourse> {
  return apiFetch<TeacherCourse>('/teacher/courses', { method: 'POST', body: input });
}

// PATCH /teacher/courses/{id}
export function updateCourse(
  courseId: string,
  patch: Partial<CourseWriteInput>,
): Promise<TeacherCourse> {
  return apiFetch<TeacherCourse>(`/teacher/courses/${courseId}`, {
    method: 'PATCH',
    body: patch,
  });
}

// DELETE /teacher/courses/{id}
export function deleteCourse(courseId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/teacher/courses/${courseId}`, { method: 'DELETE' });
}

// POST /teacher/courses/{id}/modules
export function createModule(courseId: string, title: string): Promise<{ id: string }> {
  return apiFetch(`/teacher/courses/${courseId}/modules`, {
    method: 'POST',
    body: { title },
  });
}

// PATCH /teacher/modules/{id}
export function updateModule(moduleId: string, title: string): Promise<{ id: string }> {
  return apiFetch(`/teacher/modules/${moduleId}`, {
    method: 'PATCH',
    body: { title },
  });
}

// DELETE /teacher/modules/{id}
export function deleteModule(moduleId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/teacher/modules/${moduleId}`, { method: 'DELETE' });
}

// POST /teacher/modules/{id}/lessons
export function createLesson(moduleId: string, title: string): Promise<{ id: string }> {
  return apiFetch(`/teacher/modules/${moduleId}/lessons`, {
    method: 'POST',
    body: { title },
  });
}

// PATCH /teacher/lessons/{id}
export function updateLesson(lessonId: string, title: string): Promise<{ ok: boolean }> {
  return apiFetch(`/teacher/lessons/${lessonId}`, {
    method: 'PATCH',
    body: { title },
  });
}

// DELETE /teacher/lessons/{id}
export function deleteLesson(lessonId: string): Promise<{ ok: boolean }> {
  return apiFetch(`/teacher/lessons/${lessonId}`, { method: 'DELETE' });
}

// POST /teacher/lessons/{id}/slides/upload — PDF → render slide ảnh
export function uploadLessonPdf(
  lessonId: string,
  pdf: Blob,
  filename: string,
): Promise<{ ok: boolean; slides: number }> {
  const form = new FormData();
  form.append('pdf', pdf, filename);
  return apiFetchMultipart(`/teacher/lessons/${lessonId}/slides/upload`, form, 'POST');
}
