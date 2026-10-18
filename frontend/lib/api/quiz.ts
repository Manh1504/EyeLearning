import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo";
import type { QuizAssignment, QuizAssignmentInput, QuizAttempt } from "@/lib/types/domain";

export interface QuizCitation {
  documentId: string;
  title: string;
  location: string;
}

export interface QuizChatResponse {
  answer: string;
  citations: QuizCitation[];
  intent?: string;
}

async function demoStore() {
  return import("@/lib/quiz-store");
}

export async function listQuizAssignments(): Promise<QuizAssignment[]> {
  if (isDemoMode()) return (await demoStore()).listQuizAssignments();
  return apiFetch<QuizAssignment[]>("/api/assignments");
}

export async function getQuizAssignment(id: string): Promise<QuizAssignment | null> {
  if (isDemoMode()) return (await demoStore()).getQuizAssignment(id);
  return apiFetch<QuizAssignment>(`/api/assignments/${id}`);
}

export async function createQuizAssignment(input: QuizAssignmentInput): Promise<QuizAssignment> {
  if (isDemoMode()) return (await demoStore()).createQuizAssignment(input);
  return apiFetch<QuizAssignment>("/api/assignments", {
    method: "POST",
    body: {
      courseId: input.courseId,
      lessonId: input.lessonId || null,
      title: input.title,
      instructions: input.instructions,
      dueAt: input.dueAt,
      durationMinutes: input.durationMinutes,
      status: input.status,
      questions: input.questions,
    },
  });
}

export async function getQuizAttempt(assignmentId: string): Promise<QuizAttempt | null> {
  if (isDemoMode()) return (await demoStore()).getQuizAttempt(assignmentId);
  return apiFetch<QuizAttempt | null>(`/api/assignments/${assignmentId}/attempt`);
}

export async function submitQuizAttempt(
  assignment: QuizAssignment,
  answers: Record<string, string>,
): Promise<QuizAttempt> {
  if (isDemoMode()) return (await demoStore()).submitQuizAttempt(assignment, answers);
  return apiFetch<QuizAttempt>(`/api/assignments/${assignment.id}/attempts`, {
    method: "POST",
    body: { answers },
  });
}

export function sendQuizChat(
  assignmentId: string,
  message: string,
  threadId: string,
): Promise<QuizChatResponse> {
  return apiFetch<QuizChatResponse>(`/api/assignments/${assignmentId}/chat`, {
    method: "POST",
    body: { message, threadId },
  });
}

export async function updateQuizAssignment(
  id: string,
  input: { status?: "draft" | "published" | "closed" },
): Promise<QuizAssignment> {
  if (isDemoMode()) {
    const existing = await (await demoStore()).getQuizAssignment(id);
    if (!existing) throw new Error("Không tìm thấy bài tập");
    return { ...existing, status: input.status ?? existing.status };
  }
  return apiFetch<QuizAssignment>(`/api/assignments/${id}`, {
    method: "PATCH",
    body: input,
  });
}
