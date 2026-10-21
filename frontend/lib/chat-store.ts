"use client";

import type {
  ChatCitation,
  ChatMessageItem,
  ChatReply,
  ChatSessionSummary,
  SendChatInput,
} from "@/lib/api/chat";

// Chế độ demo (NEXT_PUBLIC_DEMO=1): lưu phiên chat trong localStorage thay vì
// gọi backend, để xem được luồng UI đầy đủ (danh sách phiên, lịch sử, xoá...).
const SESSIONS_KEY = "eyelearning_chat_sessions_v1";
const MESSAGES_KEY = "eyelearning_chat_messages_v1";

const DEMO_CITATION: ChatCitation = {
  documentId: "demo-slide-1",
  title: "Chương 1: Nhập môn - Bài 1: Giới thiệu",
  location: "",
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

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function newId(prefix: string): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return `${prefix}-${crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function demoAnswer(message: string): { answer: string; citations: ChatCitation[] } {
  return {
    answer:
      `**Chế độ demo** — mình chưa kết nối trợ lý thật.\n\n` +
      `Bạn vừa hỏi: “${message}”.\n\n` +
      `Ví dụ một câu trả lời có định dạng:\n\n` +
      `- Nêu khái niệm chính trước [1]\n` +
      `- Rồi đưa ví dụ minh hoạ\n\n` +
      `| Thuật ngữ | Ý nghĩa |\n| --- | --- |\n| Hàm | Khối mã dùng lại được |\n\n` +
      `Hãy bật backend thật để nhận câu trả lời dựa trên slide bài giảng.`,
    citations: [DEMO_CITATION],
  };
}

export async function listChatSessions(courseId: string): Promise<ChatSessionSummary[]> {
  return readJson<ChatSessionSummary[]>(SESSIONS_KEY, [])
    .filter((session) => session.courseId === courseId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listChatMessages(sessionId: string): Promise<ChatMessageItem[]> {
  const all = readJson<Record<string, ChatMessageItem[]>>(MESSAGES_KEY, {});
  return all[sessionId] ?? [];
}

export async function sendChatMessage(input: SendChatInput): Promise<ChatReply> {
  const now = new Date().toISOString();
  const sessions = readJson<ChatSessionSummary[]>(SESSIONS_KEY, []);
  let session = input.sessionId
    ? sessions.find((item) => item.id === input.sessionId)
    : undefined;

  if (!session) {
    session = {
      id: newId("session"),
      courseId: input.courseId,
      lessonId: input.lessonId ?? null,
      assignmentId: input.assignmentId ?? null,
      title: input.message.trim().slice(0, 60) || "Phiên mới",
      messageCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    sessions.push(session);
  }

  const allMessages = readJson<Record<string, ChatMessageItem[]>>(MESSAGES_KEY, {});
  const history = allMessages[session.id] ?? [];
  const reply = demoAnswer(input.message);

  history.push({
    id: newId("msg"),
    role: "student",
    content: input.message,
    citations: [],
    createdAt: now,
  });
  history.push({
    id: newId("msg"),
    role: "assistant",
    content: reply.answer,
    citations: reply.citations,
    intent: "qa",
    createdAt: new Date().toISOString(),
  });
  allMessages[session.id] = history;

  session.messageCount = history.length;
  session.updatedAt = new Date().toISOString();

  writeJson(MESSAGES_KEY, allMessages);
  writeJson(
    SESSIONS_KEY,
    sessions.filter((item) => item.id !== session!.id).concat(session),
  );
  return { sessionId: session.id, answer: reply.answer, citations: reply.citations, intent: "qa" };
}

export async function renameChatSession(
  sessionId: string,
  title: string,
): Promise<ChatSessionSummary> {
  const sessions = readJson<ChatSessionSummary[]>(SESSIONS_KEY, []);
  const session = sessions.find((item) => item.id === sessionId);
  if (!session) throw new Error("Không tìm thấy phiên chat");
  session.title = title;
  session.updatedAt = new Date().toISOString();
  writeJson(SESSIONS_KEY, sessions);
  return session;
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  writeJson(
    SESSIONS_KEY,
    readJson<ChatSessionSummary[]>(SESSIONS_KEY, []).filter((item) => item.id !== sessionId),
  );
  const all = readJson<Record<string, ChatMessageItem[]>>(MESSAGES_KEY, {});
  delete all[sessionId];
  writeJson(MESSAGES_KEY, all);
}
