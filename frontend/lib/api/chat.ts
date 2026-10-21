import { apiFetch } from "@/lib/api/client";
import { isDemoMode } from "@/lib/demo";

export interface ChatCitation {
  documentId: string;
  title: string;
  location: string;
}

export interface ChatReply {
  sessionId: string;
  answer: string;
  citations: ChatCitation[];
  intent?: string | null;
}

export interface ChatSessionSummary {
  id: string;
  courseId: string;
  lessonId: string | null;
  assignmentId: string | null;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageItem {
  id: string;
  role: "student" | "assistant";
  content: string;
  citations: ChatCitation[];
  intent?: string | null;
  createdAt: string;
}

export interface SendChatInput {
  courseId: string;
  message: string;
  /** Bỏ trống để tạo phiên mới. */
  sessionId?: string | null;
  /** Bài học đang học (ưu tiên truy hồi slide của bài này). */
  lessonId?: string | null;
  /** Chỉ gửi khi đang chữa một bài tập đã nộp. */
  assignmentId?: string | null;
}

async function demoStore() {
  return import("@/lib/chat-store");
}

export async function listChatSessions(courseId: string): Promise<ChatSessionSummary[]> {
  if (isDemoMode()) return (await demoStore()).listChatSessions(courseId);
  return apiFetch<ChatSessionSummary[]>(`/api/courses/${courseId}/chat/sessions`);
}

export async function listChatMessages(sessionId: string): Promise<ChatMessageItem[]> {
  if (isDemoMode()) return (await demoStore()).listChatMessages(sessionId);
  return apiFetch<ChatMessageItem[]>(`/api/chat/sessions/${sessionId}/messages`);
}

export async function sendChatMessage(input: SendChatInput): Promise<ChatReply> {
  if (isDemoMode()) return (await demoStore()).sendChatMessage(input);
  const { courseId, ...body } = input;
  return apiFetch<ChatReply>(`/api/courses/${courseId}/chat`, { method: "POST", body });
}

export async function renameChatSession(
  sessionId: string,
  title: string,
): Promise<ChatSessionSummary> {
  if (isDemoMode()) return (await demoStore()).renameChatSession(sessionId, title);
  return apiFetch<ChatSessionSummary>(`/api/chat/sessions/${sessionId}`, {
    method: "PATCH",
    body: { title },
  });
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  if (isDemoMode()) {
    await (await demoStore()).deleteChatSession(sessionId);
    return;
  }
  await apiFetch<{ status: string }>(`/api/chat/sessions/${sessionId}`, { method: "DELETE" });
}
