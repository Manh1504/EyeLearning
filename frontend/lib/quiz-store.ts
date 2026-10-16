"use client";

import { isDemoMode } from "@/lib/demo";
import type { QuizAssignment, QuizAssignmentInput, QuizAttempt } from "@/lib/types/domain";

const ASSIGNMENTS_KEY = "eyelearning_quiz_assignments_v1";
const ATTEMPTS_KEY = "eyelearning_quiz_attempts_v1";

const DEMO_ASSIGNMENT: QuizAssignment = {
  id: "quiz-python-1",
  courseId: "course-1",
  courseTitle: "Lập trình Python cơ bản",
  lessonId: "lesson-1",
  lessonTitle: "Bài 1: Giới thiệu",
  title: "Kiểm tra kiến thức Python nhập môn",
  instructions: "Chọn một đáp án đúng cho mỗi câu. Bạn có thể xem lại và chữa bài ngay sau khi nộp.",
  dueAt: "2026-10-20T16:00:00.000Z",
  durationMinutes: 15,
  status: "published",
  createdAt: "2026-10-14T08:00:00.000Z",
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
      correctOptionId: "q-1-b",
      explanation: "Python sử dụng từ khóa def trước tên hàm để bắt đầu phần khai báo hàm.",
      points: 1,
    },
    {
      id: "q-2",
      prompt: "Kiểu dữ liệu nào lưu một dãy phần tử có thứ tự và có thể thay đổi?",
      options: [
        { id: "q-2-a", text: "tuple" },
        { id: "q-2-b", text: "set" },
        { id: "q-2-c", text: "list" },
        { id: "q-2-d", text: "str" },
      ],
      correctOptionId: "q-2-c",
      explanation: "list có thứ tự, cho phép phần tử trùng nhau và có thể thêm, sửa hoặc xóa phần tử.",
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
      correctOptionId: "q-3-b",
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

export async function listQuizAssignments(): Promise<QuizAssignment[]> {
  return assignments().sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
}

export async function getQuizAssignment(id: string): Promise<QuizAssignment | null> {
  return assignments().find((item) => item.id === id) ?? null;
}

export async function createQuizAssignment(input: QuizAssignmentInput): Promise<QuizAssignment> {
  const item: QuizAssignment = {
    ...input,
    id: `quiz-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  writeJson(ASSIGNMENTS_KEY, [item, ...assignments()]);
  return item;
}

export async function getQuizAttempt(assignmentId: string): Promise<QuizAttempt | null> {
  return readJson<QuizAttempt[]>(ATTEMPTS_KEY, []).find((item) => item.assignmentId === assignmentId) ?? null;
}

export async function submitQuizAttempt(
  assignment: QuizAssignment,
  answers: Record<string, string>,
): Promise<QuizAttempt> {
  const maxScore = assignment.questions.reduce((sum, question) => sum + question.points, 0);
  const score = assignment.questions.reduce(
    (sum, question) => sum + (answers[question.id] === question.correctOptionId ? question.points : 0),
    0,
  );
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
