"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteChatSession,
  listChatMessages,
  listChatSessions,
  renameChatSession,
  sendChatMessage,
  type SendChatInput,
} from "@/lib/api/chat";

export function useChatSessions(courseId: string | null) {
  return useQuery({
    queryKey: ["chat", "sessions", courseId],
    queryFn: () => listChatSessions(courseId as string),
    enabled: Boolean(courseId),
  });
}

export function useChatMessages(sessionId: string | null) {
  return useQuery({
    queryKey: ["chat", "messages", sessionId],
    queryFn: () => listChatMessages(sessionId as string),
    enabled: Boolean(sessionId),
  });
}

export function useSendChatMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: SendChatInput) => sendChatMessage(input),
    onSuccess: (_reply, input) => {
      client.invalidateQueries({ queryKey: ["chat", "sessions", input.courseId] });
    },
  });
}

export function useRenameChatSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, title }: { sessionId: string; title: string }) =>
      renameChatSession(sessionId, title),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["chat", "sessions"] });
    },
  });
}

export function useDeleteChatSession() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => deleteChatSession(sessionId),
    onSuccess: (_data, sessionId) => {
      client.removeQueries({ queryKey: ["chat", "messages", sessionId] });
      client.invalidateQueries({ queryKey: ["chat", "sessions"] });
    },
  });
}
