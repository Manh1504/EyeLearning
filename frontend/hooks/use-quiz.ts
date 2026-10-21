"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getQuizAssignment,
  getQuizAttempt,
  retryQuizAttempt,
  submitQuizAttempt,
  updateQuizAssignment,
  type QuizAssignmentPatch,
} from "@/lib/api/quiz";
import type { QuizAssignment } from "@/lib/types/domain";

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

export function useSubmitQuizAttempt() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      assignment,
      answers,
    }: {
      assignment: QuizAssignment;
      answers: Record<string, string[]>;
    }) => submitQuizAttempt(assignment, answers),
    onSuccess: async (attempt) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["quiz", "attempt", attempt.assignmentId] }),
        client.invalidateQueries({ queryKey: ["quiz", "assignment", attempt.assignmentId] }),
      ]);
    },
  });
}

export function useUpdateQuizAssignment() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: QuizAssignmentPatch }) =>
      updateQuizAssignment(id, patch),
    onSuccess: (assignment) => {
      client.invalidateQueries({ queryKey: ["quiz", "assignment", assignment.id] });
    },
  });
}

/** Xoá lượt làm cũ để học viên làm lại (giáo viên phải bật "cho phép làm lại"). */
export function useRetryQuizAttempt() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: string) => retryQuizAttempt(assignmentId),
    onSuccess: async (assignment) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["quiz", "attempt", assignment.id] }),
        client.invalidateQueries({ queryKey: ["quiz", "assignment", assignment.id] }),
      ]);
    },
  });
}
