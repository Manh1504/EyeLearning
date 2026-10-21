import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo";
import type {
  QuizAssignment,
  QuizAssignmentStatus,
  QuizAttempt,
  QuizQuestion,
} from "@/lib/types/domain";

export interface QuizAssignmentPatch {
  title?: string;
  instructions?: string;
  dueAt?: string | null;
  durationMinutes?: number;
  status?: QuizAssignmentStatus;
  allowRetry?: boolean;
  questions?: QuizQuestion[];
}

async function demoStore() {
  return import("@/lib/quiz-store");
}

export async function getQuizAssignment(id: string): Promise<QuizAssignment | null> {
  if (isDemoMode()) return (await demoStore()).getQuizAssignment(id);
  return apiFetch<QuizAssignment>(`/api/assignments/${id}`);
}

export async function getQuizAttempt(assignmentId: string): Promise<QuizAttempt | null> {
  if (isDemoMode()) return (await demoStore()).getQuizAttempt(assignmentId);
  return apiFetch<QuizAttempt | null>(`/api/assignments/${assignmentId}/attempt`);
}

export async function submitQuizAttempt(
  assignment: QuizAssignment,
  answers: Record<string, string[]>,
): Promise<QuizAttempt> {
  if (isDemoMode()) return (await demoStore()).submitQuizAttempt(assignment, answers);
  return apiFetch<QuizAttempt>(`/api/assignments/${assignment.id}/attempts`, {
    method: "POST",
    body: { answers },
  });
}

export async function updateQuizAssignment(
  id: string,
  patch: QuizAssignmentPatch,
): Promise<QuizAssignment> {
  if (isDemoMode()) return (await demoStore()).updateQuizAssignment(id, patch);
  return apiFetch<QuizAssignment>(`/api/assignments/${id}`, {
    method: "PATCH",
    body: patch,
  });
}

/** Xoá lượt làm cũ để làm lại (chỉ khi giáo viên cho phép). Trả bài tập kèm hạn mới. */
export async function retryQuizAttempt(assignmentId: string): Promise<QuizAssignment> {
  if (isDemoMode()) return (await demoStore()).retryQuizAttempt(assignmentId);
  return apiFetch<QuizAssignment>(`/api/assignments/${assignmentId}/retry`, {
    method: "POST",
  });
}
