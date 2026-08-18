// lib/api/student.ts — Hàm API khu vực học viên (đã nối FastAPI).
//   GET   /api/me/enrollments                    -> EnrolledCourse[]
//   GET   /api/me/stats                          -> LearningStats
//   GET   /api/courses/:id                       -> CourseOutline
//   GET   /api/lessons/:lessonId/contents        -> Slide[]
//   POST  /api/learning-sessions                 -> LearningSession
//   POST  /api/lessons/:lessonId/gaze-samples    -> { ok, inserted }
//   PATCH /api/lessons/:lessonId/progress        -> { ok }

import { apiFetch } from './client';
import type { EnrolledCourse, CourseOutline, Slide } from '@/lib/types/domain';

export interface LearningStats {
  streakDays: number;
  weekStudyMinutes: number;
}

export interface LearningSession {
  id: string;
  enrollmentId: string;
  lessonId: string;
  deviceId: string;
  calibrationParams: number[] | null;
  status: string;
  trackingConsent: boolean;
}

export interface CreateLearningSessionInput {
  enrollmentId: string;
  lessonId: string;
  deviceFingerprint: string;
  screenWidthPx?: number;
  screenHeightPx?: number;
  trackingConsent?: boolean;
}

const DEVICE_KEY = 'gaze_device_fingerprint';

function randomFingerprint(): string {
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Mã định danh thiết bị ổn định giữa các phiên (lưu localStorage).
export function getDeviceFingerprint(): string {
  const existing = globalThis.localStorage?.getItem(DEVICE_KEY);
  if (existing) return existing;
  const fingerprint = randomFingerprint();
  globalThis.localStorage?.setItem(DEVICE_KEY, fingerprint);
  return fingerprint;
}

export interface GazeSample {
  lessonContentId: string;
  x: number; // chuẩn hóa [0,1]
  y: number;
  ts: number;
}

// GET /api/me/enrollments
export function fetchMyEnrollments(): Promise<EnrolledCourse[]> {
  return apiFetch<EnrolledCourse[]>('/api/me/enrollments');
}

// GET /api/me/stats (streak + thời gian học tuần)
export function fetchMyLearningStats(): Promise<LearningStats> {
  return apiFetch<LearningStats>('/api/me/stats');
}

// GET /api/courses/:id (kèm modules.lessons)
export function fetchCourseOutline(courseId: string): Promise<CourseOutline> {
  return apiFetch<CourseOutline>(`/api/courses/${courseId}`);
}

// GET /api/lessons/:lessonId/contents
export function fetchLessonSlides(lessonId: string): Promise<Slide[]> {
  return apiFetch<Slide[]>(`/api/lessons/${lessonId}/contents`);
}

// POST /api/learning-sessions
export function createLearningSession(input: CreateLearningSessionInput): Promise<LearningSession> {
  return apiFetch<LearningSession>('/api/learning-sessions', {
    method: 'POST',
    body: input,
  });
}

// POST /api/lessons/:lessonId/gaze-samples { learningSessionId, samples }
export function postGazeSamples(
  lessonId: string,
  samples: GazeSample[],
  learningSessionId?: string,
): Promise<{ ok: boolean; inserted?: number }> {
  return apiFetch<{ ok: boolean; inserted?: number }>(`/api/lessons/${lessonId}/gaze-samples`, {
    method: 'POST',
    body: { learningSessionId, samples },
  });
}

// PATCH /api/lessons/:lessonId/progress { last_slide }
export function patchLessonProgress(
  lessonId: string,
  lastSlide: number,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/lessons/${lessonId}/progress`, {
    method: 'PATCH',
    body: { lastSlide },
  });
}
