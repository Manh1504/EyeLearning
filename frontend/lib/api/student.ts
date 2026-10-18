import { apiFetch } from "./client";
import type { EnrolledCourse, CourseOutline, Slide } from "@/lib/types/domain";

export interface LearningStats {
  streakDays: number;
  weekStudyMinutes: number;
}

export interface LearningSession {
  id: string;
  enrollmentId: string;
  lessonId: string;
  deviceId: string;
  calibrated: boolean;
  status: string;
  trackingConsent: boolean;
  // first: lần đầu (tracking), continue: học tiếp phiên cũ (tracking),
  // review: học lại bài đã xong (không tracking).
  mode: "first" | "continue" | "review";
}

export interface CreateLearningSessionInput {
  enrollmentId: string;
  lessonId: string;
  deviceFingerprint: string;
  screenWidthPx?: number;
  screenHeightPx?: number;
  trackingConsent?: boolean;
}

const DEVICE_KEY = "gaze_device_fingerprint";

function randomFingerprint(): string {
  return `web-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDeviceFingerprint(): string {
  const existing = globalThis.localStorage?.getItem(DEVICE_KEY);
  if (existing) return existing;
  const fingerprint = randomFingerprint();
  globalThis.localStorage?.setItem(DEVICE_KEY, fingerprint);
  return fingerprint;
}

export interface GazeSample {
  lessonContentId: string;
  x: number;
  y: number;
  ts: number;
}

export function fetchMyEnrollments(): Promise<EnrolledCourse[]> {
  return apiFetch<EnrolledCourse[]>("/api/me/enrollments");
}

export function fetchMyLearningStats(): Promise<LearningStats> {
  return apiFetch<LearningStats>("/api/me/stats");
}

export function fetchCourseOutline(courseId: string): Promise<CourseOutline> {
  return apiFetch<CourseOutline>(`/api/courses/${courseId}`);
}

export function fetchLessonSlides(lessonId: string): Promise<Slide[]> {
  return apiFetch<Slide[]>(`/api/lessons/${lessonId}/contents`);
}

export function createLearningSession(input: CreateLearningSessionInput): Promise<LearningSession> {
  return apiFetch<LearningSession>("/api/learning-sessions", {
    method: "POST",
    body: input,
  });
}

// PATCH /api/learning-sessions/:id — đóng phiên khi đổi bài hoặc rời trang.
export function endLearningSession(
  sessionId: string,
  status: "completed" | "aborted" = "completed",
  keepalive = false,
): Promise<LearningSession> {
  return apiFetch<LearningSession>(`/api/learning-sessions/${sessionId}`, {
    method: "PATCH",
    body: { status },
    keepalive,
  });
}

export function postGazeSamples(
  lessonId: string,
  samples: GazeSample[],
  learningSessionId?: string,
  source: "real" | "simulated" = "real",
  keepalive = false,
): Promise<{ ok: boolean; inserted?: number }> {
  return apiFetch<{ ok: boolean; inserted?: number }>(`/api/lessons/${lessonId}/gaze-samples`, {
    method: "POST",
    body: { learningSessionId, samples, source },
    keepalive,
  });
}

export function fetchLessonProgress(
  lessonId: string,
): Promise<{ lastSlide: number; viewed: number[]; completed: boolean; updatedAt: string | null }> {
  return apiFetch<{
    lastSlide: number;
    viewed: number[];
    completed: boolean;
    updatedAt: string | null;
  }>(`/api/lessons/${lessonId}/progress`);
}

export function patchLessonProgress(
  lessonId: string,
  lastSlide: number,
  completed?: boolean,
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/api/lessons/${lessonId}/progress`, {
    method: "PATCH",
    body: { lastSlide, ...(completed !== undefined ? { completed } : {}) },
  });
}
