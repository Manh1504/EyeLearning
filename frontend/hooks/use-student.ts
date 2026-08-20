// hooks/use-student.ts — TanStack Query hooks cho khu vực học viên.
'use client';

import { useQuery } from '@tanstack/react-query';
import type { LessonItem } from '@/lib/types/domain';
import {
  fetchMyEnrollments, fetchMyLearningStats, fetchCourseOutline, fetchLessonSlides,
} from '@/lib/api/student';

export function useMyEnrollments() {
  return useQuery({ queryKey: ['student', 'enrollments'], queryFn: fetchMyEnrollments });
}

export function useMyLearningStats() {
  return useQuery({ queryKey: ['student', 'stats'], queryFn: fetchMyLearningStats });
}

export function useCourseOutline(courseId: string) {
  return useQuery({
    queryKey: ['student', 'course-outline', courseId],
    queryFn: () => fetchCourseOutline(courseId),
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function useLessonSlides(lessonId: string, _lesson?: LessonItem) {
  return useQuery({
    queryKey: ['student', 'lesson-slides', lessonId],
    queryFn: () => (lessonId ? fetchLessonSlides(lessonId) : Promise.resolve([])),
    enabled: Boolean(lessonId),
  });
}
