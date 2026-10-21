"use client";

import { isDemoMode } from "@/lib/demo";
import type { QuizAssignment, QuizAttempt } from "@/lib/types/domain";
import type { QuizAssignmentPatch } from "@/lib/api/quiz";

const ASSIGNMENTS_KEY = "eyelearning_quiz_assignments_v2";
const ATTEMPTS_KEY = "eyelearning_quiz_attempts_v2";

const DEMO_ASSIGNMENT: QuizAssignment = {
  id: "quiz-python-1",
  courseId: "course-1",
  courseTitle: "Lập trình Python cơ bản",
  lessonId: "lesson-quiz-1",
  lessonTitle: "Bài tập: Kiểm tra nhập môn",
  title: "Kiểm tra kiến thức Python nhập môn",
  instructions: "Chọn một hoặc nhiều đáp án đúng. Bạn xem lại và chữa bài ngay sau khi nộp.",
  dueAt: null,
  durationMinutes: 15,
  status: "published",
  createdAt: "2026-10-14T08:00:00.000Z",
  allowRetry: true,
  questions: [
    {
      id: "q-1",
      prompt: "Từ khóa nào dùng để khai báo một hàm trong Python?",
      options: [
        { id: "q-1-a", text: "func" },
        { id: "q-1-b", text: "def" },
        { id: "q-1-c", text: "function" },
        { id: "q-1-d", text: "method" },
      ],
      correctOptionIds: ["q-1-b"],
      allowMultiple: false,
      explanation: "Python sử dụng từ khóa def trước tên hàm để bắt đầu phần khai báo hàm.",
      points: 1,
    },
    {
      id: "q-2",
      prompt: "Những kiểu dữ liệu nào có thứ tự và có thể thay đổi phần tử?",
      options: [
        { id: "q-2-a", text: "tuple" },
        { id: "q-2-b", text: "set" },
        { id: "q-2-c", text: "list" },
        { id: "q-2-d", text: "dict" },
      ],
      correctOptionIds: ["q-2-c", "q-2-d"],
      allowMultiple: true,
      explanation: "list và dict có thứ tự và cho phép thêm, sửa hoặc xóa phần tử.",
      points: 1,
    },
    {
      id: "q-3",
      prompt: "Kết quả của biểu thức 3 ** 2 trong Python là gì?",
      options: [
        { id: "q-3-a", text: "6" },
        { id: "q-3-b", text: "9" },
        { id: "q-3-c", text: "32" },
        { id: "q-3-d", text: "Lỗi cú pháp" },
      ],
      correctOptionIds: ["q-3-b"],
      allowMultiple: false,
      explanation: "Toán tử ** là phép lũy thừa, vì vậy 3 ** 2 bằng 9.",
      points: 1,
    },
  ],
};

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function assignments(): QuizAssignment[] {
  const stored = readJson<QuizAssignment[] | null>(ASSIGNMENTS_KEY, null);
  if (stored) return stored;
  const initial = isDemoMode() ? [DEMO_ASSIGNMENT] : [];
  writeJson(ASSIGNMENTS_KEY, initial);
  return initial;
}

export async function getQuizAssignment(id: string): Promise<QuizAssignment | null> {
  return assignments().find((item) => item.id === id) ?? null;
}

export async function updateQuizAssignment(
  id: string,
  patch: QuizAssignmentPatch,
): Promise<QuizAssignment> {
  const current = assignments().find((item) => item.id === id);
  if (!current) throw new Error("Không tìm thấy bài tập");
  const next: QuizAssignment = { ...current, ...patch };
  writeJson(
    ASSIGNMENTS_KEY,
    assignments().map((item) => (item.id === id ? next : item)),
  );
  return next;
}

export async function getQuizAttempt(assignmentId: string): Promise<QuizAttempt | null> {
  return readJson<QuizAttempt[]>(ATTEMPTS_KEY, []).find((item) => item.assignmentId === assignmentId) ?? null;
}

/** Xoá lượt làm cũ để làm lại (demo: dữ liệu nằm trong localStorage). */
export async function retryQuizAttempt(assignmentId: string): Promise<QuizAssignment> {
  const assignment = assignments().find((item) => item.id === assignmentId);
  if (!assignment) throw new Error("Không tìm thấy bài tập");
  writeJson(
    ATTEMPTS_KEY,
    readJson<QuizAttempt[]>(ATTEMPTS_KEY, []).filter(
      (item) => item.assignmentId !== assignmentId,
    ),
  );
  return assignment;
}

export async function submitQuizAttempt(
  assignment: QuizAssignment,
  answers: Record<string, string[]>,
): Promise<QuizAttempt> {
  const maxScore = assignment.questions.reduce((sum, question) => sum + question.points, 0);
  const score = assignment.questions.reduce((sum, question) => {
    const selected = new Set(answers[question.id] ?? []);
    const correct = new Set(question.correctOptionIds);
    const exact =
      selected.size === correct.size && [...selected].every((id) => correct.has(id));
    return sum + (exact ? question.points : 0);
  }, 0);
  const attempt: QuizAttempt = {
    id: `attempt-${Date.now()}`,
    assignmentId: assignment.id,
    answers,
    submittedAt: new Date().toISOString(),
    score,
    maxScore,
  };
  const attempts = readJson<QuizAttempt[]>(ATTEMPTS_KEY, []).filter(
    (item) => item.assignmentId !== assignment.id,
  );
  writeJson(ATTEMPTS_KEY, [attempt, ...attempts]);
  return attempt;
}
