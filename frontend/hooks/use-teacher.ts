// hooks/use-teacher.ts — TanStack Query hooks cho khu vực giảng viên.
// Khi nối backend: chỉ đổi thân hàm trong lib/api/teacher.ts, hooks & UI giữ nguyên.
'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchTeacherCourses, fetchCourseTree, fetchCourseStudents, fetchHeatmap,
  type CourseListQuery,
} from '@/lib/api/teacher';

export function useTeacherCourses(query: CourseListQuery = {}) {
  return useQuery({
    queryKey: ['teacher', 'courses', query],
    queryFn: () => fetchTeacherCourses(query),
  });
}

export function useCourseTree(courseId: string) {
  return useQuery({
    queryKey: ['teacher', 'course-tree', courseId],
    queryFn: () => fetchCourseTree(courseId),
  });
}

export function useCourseStudents(courseId: string) {
  return useQuery({
    queryKey: ['teacher', 'course-students', courseId],
    queryFn: () => fetchCourseStudents(courseId),
  });
}

export function useHeatmap(lessonId: string, slideCount: number, scope: 'class' | string = 'class') {
  return useQuery({
    queryKey: ['teacher', 'heatmap', lessonId, scope],
    queryFn: () => fetchHeatmap(lessonId, slideCount, scope),
  });
}
