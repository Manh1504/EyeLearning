"use client";

import { useQuery } from "@tanstack/react-query";
import {
  fetchMyEnrollments,
  fetchMyLearningStats,
  fetchCourseOutline,
  fetchLessonSlides,
} from "@/lib/api/student";

export function useMyEnrollments() {
  return useQuery({ queryKey: ["student", "enrollments"], queryFn: fetchMyEnrollments });
}

export function useMyLearningStats() {
  return useQuery({ queryKey: ["student", "stats"], queryFn: fetchMyLearningStats });
}

export function useCourseOutline(courseId: string) {
  return useQuery({
    queryKey: ["student", "course-outline", courseId],
    queryFn: () => fetchCourseOutline(courseId),
    enabled: Boolean(courseId),
  });
}

export function useLessonSlides(lessonId: string) {
  return useQuery({
    queryKey: ["student", "lesson-slides", lessonId],
    queryFn: () => (lessonId ? fetchLessonSlides(lessonId) : Promise.resolve([])),
    enabled: Boolean(lessonId),
  });
}
