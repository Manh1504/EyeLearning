"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RiArrowLeftLine,
  RiCheckLine,
  RiCloseLine,
} from "@remixicon/react";
import { useQuizAssignment, useQuizAttempt } from "@/hooks/use-quiz";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { Progress } from "@/components/ui/progress";
import { FullPageSpinner } from "@/components/ui/spinner";
import { FloatingQuizChat } from "@/components/quiz/floating-quiz-chat";

export function QuizReview({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const assignmentQuery = useQuizAssignment(assignmentId);
  const attemptQuery = useQuizAttempt(assignmentId);

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
               Xem lại đáp án và phần giải thích bên dưới. Trợ lý học tập có thể giúp bạn tập trung vào những câu chưa đúng.
            </p>
            <Progress value={percentage} className="mt-6 max-w-xl" indicatorClassName="bg-[#789472]" />
          </div>
        </div>
      </section>

      <div className="grid items-start gap-6">
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

      </div>
      <FloatingQuizChat assignmentId={assignment.id} questions={assignment.questions} attempt={attempt} />
    </div>
  );
}
