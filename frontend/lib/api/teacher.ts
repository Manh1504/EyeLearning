// lib/api/teacher.ts — Hàm API khu vực giảng viên (đã nối FastAPI).
//   GET   /teacher/courses?status=&q=            -> TeacherCourse[]
//   GET   /teacher/courses/{id}                   -> ModuleNode[]
//   GET   /teacher/courses/{id}/students          -> StudentRow[]
//   GET   /teacher/lessons/{id}/heatmap           -> SlideStat[]

import { apiFetch } from './client';
import type {
  TeacherCourse, CourseStatus, ModuleNode, StudentRow, SlideStat,
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
