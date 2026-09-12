// hooks/use-teacher.ts — TanStack Query hooks cho khu vực giảng viên.
// Khi nối backend: chỉ đổi thân hàm trong lib/api/teacher.ts, hooks & UI giữ nguyên.
'use client';

import { useQuery } from '@tanstack/react-query';
import {
  fetchTeacherCourses, fetchCourseTree, fetchCourseStudents, fetchHeatmap,
  fetchLessonSlidesAdmin, fetchLessonMastery,
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
    enabled: Boolean(courseId),
  });
}

export function useCourseStudents(courseId: string) {
  return useQuery({
    queryKey: ['teacher', 'course-students', courseId],
    queryFn: () => fetchCourseStudents(courseId),
    enabled: Boolean(courseId),
  });
}

export function useHeatmap(lessonId: string, slideCount: number, scope: 'class' | string = 'class') {
  return useQuery({
    queryKey: ['teacher', 'heatmap', lessonId, scope],
    queryFn: () => fetchHeatmap(lessonId, slideCount, scope),
    enabled: Boolean(lessonId),
    staleTime: 30_000,
  });
}

export function useLessonSlidesAdmin(lessonId: string) {
  return useQuery({
    queryKey: ['teacher', 'lesson-slides', lessonId],
    queryFn: () => fetchLessonSlidesAdmin(lessonId),
    enabled: Boolean(lessonId),
  });
}

export function useLessonMastery(lessonId: string, studentId: string | null) {
  return useQuery({
    queryKey: ['teacher', 'lesson-mastery', lessonId, studentId],
    queryFn: () => fetchLessonMastery(lessonId, studentId as string),
    enabled: Boolean(lessonId) && Boolean(studentId),
  });
}
