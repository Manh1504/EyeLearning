"use client";

import { type FormEvent, useRef, useState } from "react";
import { RiArrowDownSLine, RiQuestionAnswerLine, RiSendPlane2Line, RiSparkling2Line } from "@remixicon/react";
import type { QuizAttempt, QuizQuestion } from "@/lib/types/domain";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { sendQuizChat, type QuizCitation } from "@/lib/api/quiz";
import { isDemoMode } from "@/lib/demo";

type ChatMessage = { id: number; role: "student" | "assistant"; text: string; citations?: QuizCitation[] };

function localReply(prompt: string, questions: QuizQuestion[]) {
  if (!questions.length) return "Bạn đã hoàn thành tốt bài này. Hãy xem lại phần giải thích để củng cố kiến thức.";

  const normalized = prompt.toLocaleLowerCase("vi");
  const match = normalized.match(/câu\s*(\d+)/);
  const numberedQuestion = match ? questions[Number(match[1]) - 1] : undefined;
  const matchedQuestion = numberedQuestion ?? questions.find((question) =>
    question.prompt.toLocaleLowerCase("vi").split(/\s+/).some((word) => word.length > 5 && normalized.includes(word)),
  );

  if (matchedQuestion) return `Với câu “${matchedQuestion.prompt}”: ${matchedQuestion.explanation}`;
  return questions
    .map((question, index) => `${index + 1}. ${question.prompt}\n${question.explanation}`)
    .join("\n\n");
}

export function FloatingQuizChat({
  assignmentId,
  questions,
  attempt,
}: {
  assignmentId: string;
  questions: QuizQuestion[];
  attempt?: QuizAttempt;
}) {
  const reviewQuestions = attempt
    ? questions.filter((question) => attempt.answers[question.id] !== question.correctOptionId)
    : questions;
  const [input, setInput] = useState("");
  const nextMessageId = useRef(2);
  const [threadId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(true);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      text: attempt
        ? "Mình có thể giúp bạn xem lại các câu chưa đúng dựa trên phần giải thích của bài."
        : "Mình luôn ở đây để hỗ trợ bạn trong lúc làm bài. Bạn có thể hỏi về kiến thức hoặc cách hiểu câu hỏi.",
    },
  ]);
  const prompts = attempt
    ? reviewQuestions.length
      ? ["Giải thích các câu mình làm sai", "Tóm tắt kiến thức cần nhớ", "Giải thích câu 1 dễ hiểu hơn"]
      : ["Mình nên ôn lại gì?", "Tóm tắt kiến thức cần nhớ"]
    : ["Gợi ý cách làm", "Tóm tắt kiến thức", "Giải thích câu 1"];

  async function sendMessage(text: string) {
    const prompt = text.trim();
    if (!prompt || pending) return;
    const messageId = nextMessageId.current++;
    setMessages((current) => [...current, { id: messageId, role: "student", text: prompt }]);
    setInput("");
    setError("");
    setPending(true);
    try {
      const response = isDemoMode()
        ? { answer: localReply(prompt, reviewQuestions), citations: [] }
        : await sendQuizChat(assignmentId, prompt, threadId);
      setMessages((current) => [
        ...current,
        { id: nextMessageId.current++, role: "assistant", text: response.answer, citations: response.citations },
      ]);
    } catch {
      setError("Trợ lý chưa thể trả lời. Vui lòng thử lại.");
      setInput(prompt);
    } finally {
      setPending(false);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage(input);
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="fixed bottom-3 right-3 z-50 h-12 rounded-full px-4 shadow-lg sm:bottom-5 sm:right-5" aria-label="Mở trợ lý học tập">
        <RiSparkling2Line />Trợ lý học tập
      </Button>
    );
  }

  return (
    <aside className="fixed bottom-3 right-3 z-50 flex h-[min(520px,65dvh)] w-[min(390px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[24px] border border-border/80 bg-white shadow-[0_20px_60px_rgba(22,28,20,0.2)] sm:bottom-5 sm:right-5 sm:h-[min(560px,calc(100dvh-2.5rem))]" aria-label="Trợ lý học tập">
      <div className="shrink-0 border-b border-border bg-[#f2f7f0] p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-white text-[#36533a] shadow-xs">
            <RiSparkling2Line className="size-5" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Trợ lý học tập</h2>
            <p className="mt-0.5 text-xs font-medium text-[#567052]">Luôn sẵn sàng hỗ trợ</p>
          </div>
          <Button type="button" variant="ghost" size="icon-sm" className="ml-auto" onClick={() => setOpen(false)} aria-label="Thu gọn trợ lý học tập">
            <RiArrowDownSLine />
          </Button>
        </div>
      </div>

      <div className="scrollbar-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
        {messages.map((message) => (
          <div key={message.id} className={cn("flex", message.role === "student" ? "justify-end" : "justify-start")}>
            <div className={cn(
              "max-w-[88%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-6",
              message.role === "student" ? "rounded-br-md bg-foreground text-white" : "rounded-bl-md bg-muted text-foreground",
            )}>
              {message.text}
              {message.citations?.length ? (
                <div className="mt-2 border-t border-foreground/10 pt-2 text-xs">
                  {message.citations.map((citation, index) => (
                    <a key={citation.documentId} href={citation.location} target="_blank" rel="noreferrer" className="block underline underline-offset-2">
                      [{index + 1}] {citation.title}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="shrink-0 border-t border-border bg-white p-3">
        <div className="mb-2 flex gap-2 overflow-x-auto pb-1">
          {prompts.map((prompt) => (
            <button key={prompt} type="button" disabled={pending} onClick={() => void sendMessage(prompt)} className="shrink-0 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50">
              {prompt}
            </button>
          ))}
        </div>
        {error && <p role="alert" className="mb-2 text-xs text-destructive">{error}</p>}
        <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-2xl border border-input bg-white p-2 focus-within:ring-2 focus-within:ring-ring">
          <RiQuestionAnswerLine className="mb-2 ml-1 size-4 shrink-0 text-muted-foreground" />
          <label htmlFor="quiz-chat" className="sr-only">Hỏi trợ lý học tập</label>
          <textarea id="quiz-chat" value={input} onChange={(event) => setInput(event.target.value)} rows={1} placeholder="Nhập câu hỏi..." className="max-h-24 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground" />
          <Button type="submit" size="icon-sm" aria-label="Gửi câu hỏi" disabled={!input.trim() || pending}><RiSendPlane2Line /></Button>
        </form>
      </div>
    </aside>
  );
}
