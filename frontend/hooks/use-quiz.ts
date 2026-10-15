"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createQuizAssignment,
  getQuizAssignment,
  getQuizAttempt,
  listQuizAssignments,
  submitQuizAttempt,
} from "@/lib/quiz-store";
import type { QuizAssignment } from "@/lib/types/domain";

export function useQuizAssignments() {
  return useQuery({ queryKey: ["quiz", "assignments"], queryFn: listQuizAssignments });
}

export function useQuizAssignment(id: string) {
  return useQuery({
    queryKey: ["quiz", "assignment", id],
    queryFn: () => getQuizAssignment(id),
    enabled: Boolean(id),
  });
}

export function useQuizAttempt(assignmentId: string) {
  return useQuery({
    queryKey: ["quiz", "attempt", assignmentId],
    queryFn: () => getQuizAttempt(assignmentId),
    enabled: Boolean(assignmentId),
  });
}

export function useCreateQuizAssignment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: createQuizAssignment,
    onSuccess: () => client.invalidateQueries({ queryKey: ["quiz", "assignments"] }),
  });
}

export function useSubmitQuizAttempt() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ assignment, answers }: { assignment: QuizAssignment; answers: Record<string, string> }) =>
      submitQuizAttempt(assignment, answers),
    onSuccess: (attempt) =>
      client.invalidateQueries({ queryKey: ["quiz", "attempt", attempt.assignmentId] }),
  });
}
