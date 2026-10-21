"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  RiAddLine,
  RiArrowDownSLine,
  RiChatHistoryLine,
  RiDeleteBinLine,
  RiEditLine,
  RiQuestionAnswerLine,
  RiSendPlane2Line,
  RiSparkling2Line,
} from "@remixicon/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ChatCitation, ChatMessageItem } from "@/lib/api/chat";
import {
  useChatMessages,
  useChatSessions,
  useDeleteChatSession,
  useRenameChatSession,
  useSendChatMessage,
} from "@/hooks/use-chat";

type UiMessage = Pick<ChatMessageItem, "id" | "role" | "content" | "citations">;

const MARKDOWN_CLASS = cn(
  "text-sm leading-6 break-words",
  "[&_p]:my-1.5 [&_strong]:font-semibold [&_em]:italic",
  "[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
  "[&_h1]:mt-3 [&_h1]:text-base [&_h1]:font-semibold [&_h2]:mt-3 [&_h2]:text-sm [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold",
  "[&_code]:rounded [&_code]:bg-black/5 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-neutral-900 [&_pre]:p-3 [&_pre]:text-xs [&_pre]:text-white",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-inherit",
  "[&_table]:my-2 [&_table]:w-full [&_table]:border-collapse [&_table]:text-xs",
  "[&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:px-2 [&_th]:py-1 [&_th]:text-left",
  "[&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_hr]:my-3 [&_img]:max-w-full [&_img]:rounded-lg",
  "[&_a]:font-medium [&_a]:text-[#36533a] [&_a]:underline [&_a]:underline-offset-2",
);

const CITE_RE = /\[(\d+)\](?!\()/g;

function newLocalId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Biến `[1]` trong câu trả lời thành liên kết nhảy tới chip trích dẫn tương ứng. */
function withCitationLinks(text: string, messageId: string): string {
  return text.replace(CITE_RE, `[$1](#chat-cite-${messageId}-$1)`);
}

function CitationChip({
  index,
  citation,
  messageId,
}: {
  index: number;
  citation: ChatCitation;
  messageId: string;
}) {
  const label = `[${index}] ${citation.title}`;
  const className =
    "inline-flex max-w-full items-center truncate rounded-full border border-border bg-white px-2.5 py-1 text-[11px] font-medium text-muted-foreground";
  const isLink = /^https?:\/\//.test(citation.location);
  return (
    <span id={`chat-cite-${messageId}-${index}`} className="max-w-full">
      {isLink ? (
        <a
          href={citation.location}
          target="_blank"
          rel="noreferrer"
          className={cn(className, "transition hover:bg-muted hover:text-foreground")}
        >
          {label}
        </a>
      ) : (
        <span className={className}>{label}</span>
      )}
    </span>
  );
}

function Markdown({ text, messageId }: { text: string; messageId: string }) {
  return (
    <div className={MARKDOWN_CLASS}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith("#chat-cite-")) {
              return (
                <button
                  type="button"
                  className="mx-0.5 inline-flex min-w-4 items-center justify-center rounded border border-current px-1 text-[10px] align-super font-semibold"
                  onClick={() =>
                    document
                      .getElementById(href.slice(1))
                      ?.scrollIntoView({ behavior: "smooth", block: "center" })
                  }
                  aria-label="Xem nguồn trích dẫn"
                >
                  {children}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {withCitationLinks(text, messageId)}
      </ReactMarkdown>
    </div>
  );
}

export function StudyAssistantChat({
  courseId,
  lessonId = null,
  assignmentId = null,
}: {
  courseId: string;
  lessonId?: string | null;
  assignmentId?: string | null;
}) {
  const [open, setOpen] = useState(false);
  // undefined = chưa chọn (sẽ tự mở phiên gần nhất), null = phiên mới chưa lưu, string = phiên đang mở.
  const [selectedSessionId, setSelectedSessionId] = useState<string | null | undefined>(undefined);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const loadedSessionRef = useRef<string | null>(null);

  const sessionsQuery = useChatSessions(open ? courseId : null);
  const sessions = sessionsQuery.data ?? [];
  // Chưa chọn gì -> tự mở phiên gần nhất; danh sách trống -> phiên mới.
  const activeSessionId: string | null | undefined =
    selectedSessionId === undefined
      ? sessionsQuery.data
        ? (sessionsQuery.data[0]?.id ?? null)
        : undefined
      : selectedSessionId;
  const activeSession = sessions.find((session) => session.id === activeSessionId);
  const messagesQuery = useChatMessages(
    open && typeof activeSessionId === "string" ? activeSessionId : null,
  );
  const send = useSendChatMessage();
  const rename = useRenameChatSession();
  const remove = useDeleteChatSession();

  // Nạp lịch sử khi đổi phiên (không đè lên tin nhắn vừa gửi cục bộ).
  useEffect(() => {
    if (typeof activeSessionId !== "string") return;
    if (!messagesQuery.data || loadedSessionRef.current === activeSessionId) return;
    loadedSessionRef.current = activeSessionId;
    setMessages(messagesQuery.data);
  }, [activeSessionId, messagesQuery.data]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pendingMessage, open, send.isPending, activeSessionId]);

  const suggestions = assignmentId
    ? [
        "Giải thích các câu mình làm sai",
        "Tóm tắt kiến thức cần nhớ",
        "Gợi ý hướng làm, đừng cho đáp án",
      ]
    : ["Tóm tắt bài này", "Giải thích khái niệm chính", "Cho ví dụ minh hoạ"];

  function startNewChat() {
    setMessages([]);
    setSelectedSessionId(null);
    loadedSessionRef.current = null;
    setError("");
  }

  async function sendMessage(text: string) {
    const message = text.trim();
    if (!message || send.isPending) return;
    setInput("");
    setError("");
    setPendingMessage(message);
    try {
      const reply = await send.mutateAsync({
        courseId,
        message,
        sessionId: typeof activeSessionId === "string" ? activeSessionId : null,
        lessonId: lessonId ?? null,
        assignmentId: assignmentId ?? null,
      });
      setMessages((current) => [
        ...current,
        {
          id: newLocalId(),
          role: "student",
          content: message,
          citations: [],
        },
        {
          id: newLocalId(),
          role: "assistant",
          content: reply.answer,
          citations: reply.citations,
        },
      ]);
      loadedSessionRef.current = reply.sessionId;
      // Ghim phiên đang mở để danh sách refetch không đổi phiên giữa chừng.
      setSelectedSessionId(reply.sessionId);
    } catch {
      setError("Trợ lý chưa thể trả lời. Vui lòng thử lại.");
      setInput(message);
    } finally {
      setPendingMessage(null);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-3 right-3 z-50 h-12 rounded-full px-4 shadow-lg sm:bottom-5 sm:right-5"
        aria-label="Mở trợ lý học tập"
      >
        <RiSparkling2Line />
        Trợ lý học tập
      </Button>
    );
  }

  return (
    <>
      <aside
        className="fixed bottom-3 right-3 z-50 flex h-[min(560px,72dvh)] w-[min(420px,calc(100vw-1rem))] flex-col overflow-hidden rounded-[24px] border border-border/80 bg-white shadow-[0_20px_60px_rgba(22,28,20,0.2)] sm:bottom-5 sm:right-5 sm:h-[min(640px,calc(100dvh-2.5rem))]"
        aria-label="Trợ lý học tập"
      >
        <div className="shrink-0 border-b border-border bg-[#f2f7f0] p-3.5">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-white text-[#36533a] shadow-xs">
              <RiSparkling2Line className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">Trợ lý học tập</h2>
              <p className="truncate text-xs font-medium text-[#567052]">
                {activeSession ? activeSession.title : "Hỏi về nội dung đang học"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Lịch sử trò chuyện"
                  >
                    <RiChatHistoryLine />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-72">
                  <DropdownMenuLabel>Phiên gần đây</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={startNewChat} className="gap-2 font-medium">
                    <RiAddLine className="size-4" />
                    Chat mới
                  </DropdownMenuItem>
                  {sessions.length > 0 && <DropdownMenuSeparator />}
                  {sessions.slice(0, 8).map((session) => (
                    <DropdownMenuItem
                      key={session.id}
                      onSelect={() => setSelectedSessionId(session.id)}
                      className={cn(
                        "flex-col items-start gap-0.5",
                        session.id === activeSessionId && "bg-muted",
                      )}
                    >
                      <span className="w-full truncate text-sm">{session.title}</span>
                      <span className="text-[11px] text-muted-foreground">
                        {session.messageCount} tin nhắn ·{" "}
                        {new Date(session.updatedAt).toLocaleDateString("vi-VN")}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              {activeSession && (
                <>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Đổi tên phiên"
                    onClick={() => {
                      setRenameValue(activeSession.title);
                      setRenameOpen(true);
                    }}
                  >
                    <RiEditLine />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Xoá phiên"
                    onClick={() => setDeleteOpen(true)}
                  >
                    <RiDeleteBinLine />
                  </Button>
                </>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
                aria-label="Thu gọn trợ lý học tập"
              >
                <RiArrowDownSLine />
              </Button>
            </div>
          </div>
        </div>

        <div
          ref={scrollRef}
          className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4"
          aria-live="polite"
        >
          {messages.length === 0 && !pendingMessage && (
            <div className="rounded-2xl bg-muted/60 p-3.5 text-sm leading-6 text-foreground/80">
              {assignmentId
                ? "Mình có thể giúp bạn xem lại các câu chưa đúng dựa trên phần giải thích của bài."
                : "Mình là trợ lý học tập của môn này. Hỏi mình về nội dung bài đang học, mình sẽ trả lời kèm nguồn slide."}
            </div>
          )}

          {messages.map((message) => (
            <div
              key={message.id}
              className={cn("flex", message.role === "student" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[90%] rounded-2xl px-4 py-3",
                  message.role === "student"
                    ? "rounded-br-md bg-foreground text-white"
                    : "rounded-bl-md bg-muted text-foreground",
                )}
              >
                {message.role === "student" ? (
                  <p className="whitespace-pre-line text-sm leading-6">{message.content}</p>
                ) : (
                  <Markdown text={message.content} messageId={message.id} />
                )}
                {message.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-foreground/10 pt-2">
                    {message.citations.map((citation, index) => (
                      <CitationChip
                        key={`${citation.documentId}-${index}`}
                        index={index + 1}
                        citation={citation}
                        messageId={message.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}

          {pendingMessage && (
            <div className="flex justify-end">
              <div className="max-w-[90%] whitespace-pre-line rounded-2xl rounded-br-md bg-foreground px-4 py-3 text-sm leading-6 text-white">
                {pendingMessage}
              </div>
            </div>
          )}

          {send.isPending && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-muted px-4 py-3.5">
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.3s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground [animation-delay:-0.15s]" />
                <span className="size-1.5 animate-bounce rounded-full bg-muted-foreground" />
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 border-t border-border bg-white p-3">
          <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
            {suggestions.map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={send.isPending}
                onClick={() => void sendMessage(prompt)}
                className="shrink-0 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
              >
                {prompt}
              </button>
            ))}
          </div>
          {error && (
            <p role="alert" className="mb-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 rounded-2xl border border-input bg-white p-2 focus-within:ring-2 focus-within:ring-ring"
          >
            <RiQuestionAnswerLine className="mb-2 ml-1 size-4 shrink-0 text-muted-foreground" />
            <label htmlFor="study-chat" className="sr-only">
              Hỏi trợ lý học tập
            </label>
            <textarea
              id="study-chat"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage(input);
                }
              }}
              rows={1}
              placeholder="Nhập câu hỏi..."
              className="max-h-24 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground"
            />
            <Button
              type="submit"
              size="icon-sm"
              aria-label="Gửi câu hỏi"
              disabled={!input.trim() || send.isPending}
            >
              <RiSendPlane2Line />
            </Button>
          </form>
          <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">
            Enter để gửi · Shift+Enter xuống dòng ·{" "}
            <Link href={`/student/courses/${courseId}`} className="underline underline-offset-2">
              Học tiếp
            </Link>
          </p>
        </div>
      </aside>

      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Đổi tên phiên</DialogTitle>
          </DialogHeader>
          <Input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            maxLength={255}
            aria-label="Tên phiên"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameOpen(false)}>
              Hủy
            </Button>
            <Button
              disabled={!renameValue.trim() || rename.isPending}
              onClick={() => {
                if (!activeSession) return;
                rename.mutate(
                  { sessionId: activeSession.id, title: renameValue.trim() },
                  { onSuccess: () => setRenameOpen(false) },
                );
              }}
            >
              Lưu
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Xoá phiên chat?"
        description="Toàn bộ nội dung trò chuyện trong phiên này sẽ bị xoá."
        confirmLabel="Xoá phiên"
        destructive
        loading={remove.isPending}
        onConfirm={() => {
          if (!activeSession) return;
          remove.mutate(activeSession.id, {
            onSuccess: () => {
              setDeleteOpen(false);
              startNewChat();
            },
          });
        }}
      />
    </>
  );
}
