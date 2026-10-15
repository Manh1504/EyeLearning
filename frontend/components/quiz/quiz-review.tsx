"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RiArrowLeftLine,
  RiCheckLine,
  RiCloseLine,
  RiQuestionAnswerLine,
  RiSendPlane2Line,
  RiSparkling2Line,
} from "@remixicon/react";
import { useQuizAssignment, useQuizAttempt } from "@/hooks/use-quiz";
import type { QuizQuestion } from "@/lib/types/domain";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Progress } from "@/components/ui/progress";
import { FullPageSpinner } from "@/components/ui/spinner";

type ChatMessage = { id: number; role: "student" | "assistant"; text: string };

function localReply(prompt: string, missed: QuizQuestion[]) {
  if (!missed.length) {
    return "Bạn đã trả lời đúng tất cả câu hỏi. Hãy xem lại từng phần giải thích bên cạnh để củng cố kiến thức.";
  }

  const normalized = prompt.toLocaleLowerCase("vi");
  const numberedQuestion = missed.find((question) => {
    const match = normalized.match(/câu\s*(\d+)/);
    return match && missed.indexOf(question) + 1 === Number(match[1]);
  });
  const matchedQuestion = numberedQuestion ?? missed.find((question) =>
    question.prompt.toLocaleLowerCase("vi").split(/\s+/).some((word) => word.length > 5 && normalized.includes(word)),
  );

  if (matchedQuestion) {
    return `Với câu “${matchedQuestion.prompt}”: ${matchedQuestion.explanation}`;
  }
  return missed
    .map((question, index) => `${index + 1}. ${question.prompt}\n${question.explanation}`)
    .join("\n\n");
}

export function QuizReview({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const assignmentQuery = useQuizAssignment(assignmentId);
  const attemptQuery = useQuizAttempt(assignmentId);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 1,
      role: "assistant",
      text: "Mình có thể giúp bạn xem lại các câu trả lời chưa đúng dựa trên phần giải thích của bài.",
    },
  ]);

  if (assignmentQuery.isLoading || attemptQuery.isLoading) {
    return <FullPageSpinner label="Đang tổng hợp kết quả..." />;
  }
  if (assignmentQuery.isError || attemptQuery.isError || !assignmentQuery.data || !attemptQuery.data) {
    return (
      <ErrorState
        title="Chưa có kết quả"
        description="Hãy hoàn thành và nộp bài trước khi xem phần chữa bài."
        onRetry={() => router.push(`/student/assignments/${assignmentId}`)}
        retryLabel="Đến bài làm"
      />
    );
  }

  const assignment = assignmentQuery.data;
  const attempt = attemptQuery.data;
  const percentage = attempt.maxScore ? Math.round((attempt.score / attempt.maxScore) * 100) : 0;
  const correctCount = assignment.questions.filter(
    (question) => attempt.answers[question.id] === question.correctOptionId,
  ).length;
  const missed = assignment.questions.filter(
    (question) => attempt.answers[question.id] !== question.correctOptionId,
  );
  const prompts = missed.length
    ? ["Giải thích các câu mình làm sai", "Tóm tắt kiến thức cần nhớ", "Giải thích câu 1 dễ hiểu hơn"]
    : ["Mình nên ôn lại gì?", "Tóm tắt kiến thức cần nhớ"];

  function sendMessage(text: string) {
    const prompt = text.trim();
    if (!prompt) return;
    setMessages((current) => [
      ...current,
      { id: current.length + 1, role: "student", text: prompt },
      { id: current.length + 2, role: "assistant", text: localReply(prompt, missed) },
    ]);
    setInput("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    sendMessage(input);
  }

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" className="-ml-3">
        <Link href="/student/assignments"><RiArrowLeftLine />Danh sách bài tập</Link>
      </Button>

      <section className="overflow-hidden rounded-[28px] border border-border/80 bg-white shadow-xs">
        <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[220px_1fr] lg:items-center lg:p-10">
          <div className="flex items-center gap-5 lg:block lg:text-center">
            <div className="relative flex size-28 shrink-0 items-center justify-center rounded-full bg-[#f2f7f0] lg:mx-auto lg:size-36">
              <svg viewBox="0 0 100 100" className="absolute inset-2 -rotate-90" aria-hidden>
                <circle cx="50" cy="50" r="43" fill="none" stroke="#e8ede6" strokeWidth="7" />
                <circle cx="50" cy="50" r="43" fill="none" stroke="#789472" strokeWidth="7" strokeLinecap="round" pathLength="100" strokeDasharray={`${percentage} 100`} />
              </svg>
              <div className="relative">
                <strong className="font-display text-3xl sm:text-4xl">{percentage}%</strong>
                <span className="block text-xs text-muted-foreground">Điểm số</span>
              </div>
            </div>
            <div className="lg:mt-4">
              <p className="text-sm font-semibold">{attempt.score}/{attempt.maxScore} điểm</p>
              <p className="mt-1 text-xs text-muted-foreground">{correctCount}/{assignment.questions.length} câu đúng</p>
            </div>
          </div>

          <div>
            <Badge variant={percentage >= 70 ? "success" : "warning"}>
              {percentage >= 70 ? "Hoàn thành tốt" : "Cần ôn tập thêm"}
            </Badge>
            <h1 className="mt-4 font-display text-3xl leading-tight text-balance sm:text-4xl">{assignment.title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Xem lại đáp án và phần giải thích bên dưới. Trợ lý local có thể giúp bạn tập trung vào những câu chưa đúng.
            </p>
            <Progress value={percentage} className="mt-6 max-w-xl" indicatorClassName="bg-[#789472]" />
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-4" aria-labelledby="review-heading">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Chi tiết bài làm</p>
            <h2 id="review-heading" className="mt-1 font-display text-2xl">Đáp án và giải thích</h2>
          </div>
          {assignment.questions.map((question, questionIndex) => {
            const selectedId = attempt.answers[question.id];
            const correct = selectedId === question.correctOptionId;
            return (
              <article key={question.id} className="rounded-[24px] border border-border/80 bg-white p-5 shadow-xs sm:p-6">
                <div className="flex items-start gap-4">
                  <span className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full",
                    correct ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                  )}>
                    {correct ? <RiCheckLine className="size-5" /> : <RiCloseLine className="size-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-muted-foreground">Câu {questionIndex + 1}</p>
                      <Badge variant={correct ? "success" : "destructive"}>{correct ? "Chính xác" : "Chưa đúng"}</Badge>
                    </div>
                    <h3 className="mt-2 text-base font-semibold leading-7 sm:text-lg">{question.prompt}</h3>
                  </div>
                </div>

                <div className="mt-5 space-y-2 pl-0 sm:pl-13">
                  {question.options.map((option, optionIndex) => {
                    const isSelected = option.id === selectedId;
                    const isCorrect = option.id === question.correctOptionId;
                    return (
                      <div key={option.id} className={cn(
                        "flex items-center gap-3 rounded-xl border px-4 py-3 text-sm",
                        isCorrect && "border-success/25 bg-success/6 text-success",
                        isSelected && !isCorrect && "border-destructive/25 bg-destructive/6 text-destructive",
                        !isCorrect && !isSelected && "border-transparent bg-muted/50 text-muted-foreground",
                      )}>
                        <span className="font-semibold">{String.fromCharCode(65 + optionIndex)}.</span>
                        <span className="flex-1">{option.text}</span>
                        {isSelected && <span className="text-xs font-semibold">Bạn chọn</span>}
                        {isCorrect && <span className="text-xs font-semibold">Đáp án đúng</span>}
                      </div>
                    );
                  })}
                  {!selectedId && <p className="text-xs font-medium text-destructive">Bạn chưa trả lời câu này.</p>}
                </div>

                <div className="mt-5 rounded-2xl bg-[#f7f7f4] p-4 sm:ml-13">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#36533a]">Giải thích</p>
                  <p className="mt-2 text-sm leading-6 text-foreground/80">{question.explanation}</p>
                </div>
              </article>
            );
          })}
        </section>

        <aside className="overflow-hidden rounded-[24px] border border-border/80 bg-white shadow-sm xl:sticky xl:top-5" aria-label="Trợ lý ôn tập local">
          <div className="border-b border-border bg-[#f2f7f0] p-5">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-full bg-white text-[#36533a] shadow-xs">
                <RiSparkling2Line className="size-5" />
              </span>
              <div>
                <h2 className="text-sm font-semibold">Trợ lý chữa bài</h2>
                <p className="mt-0.5 text-xs font-medium text-[#567052]">Chế độ local - chờ AI backend</p>
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              Phản hồi chỉ dựa trên giải thích của các câu bạn chưa làm đúng.
            </p>
          </div>

          <div className="scrollbar-thin flex max-h-[430px] min-h-72 flex-col gap-3 overflow-y-auto p-4" aria-live="polite">
            {messages.map((message) => (
              <div key={message.id} className={cn("flex", message.role === "student" ? "justify-end" : "justify-start")}>
                <div className={cn(
                  "max-w-[88%] whitespace-pre-line rounded-2xl px-4 py-3 text-sm leading-6",
                  message.role === "student"
                    ? "rounded-br-md bg-foreground text-white"
                    : "rounded-bl-md bg-muted text-foreground",
                )}>
                  {message.text}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-border p-4">
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {prompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => sendMessage(prompt)}
                  className="shrink-0 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
            <form onSubmit={handleSubmit} className="flex items-end gap-2 rounded-2xl border border-input bg-white p-2 focus-within:ring-2 focus-within:ring-ring">
              <RiQuestionAnswerLine className="mb-2 ml-1 size-4 shrink-0 text-muted-foreground" />
              <label htmlFor="review-chat" className="sr-only">Hỏi về bài chữa</label>
              <textarea
                id="review-chat"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={1}
                placeholder="Hỏi về câu bạn làm sai..."
                className="max-h-24 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <Button type="submit" size="icon-sm" aria-label="Gửi câu hỏi" disabled={!input.trim()}>
                <RiSendPlane2Line />
              </Button>
            </form>
          </div>
        </aside>
      </div>
    </div>
  );
}
