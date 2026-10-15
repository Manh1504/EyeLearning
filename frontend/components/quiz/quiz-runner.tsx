"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  RiArrowLeftLine,
  RiArrowRightLine,
  RiCheckLine,
  RiCloseLine,
  RiFileList3Line,
  RiTimeLine,
} from "@remixicon/react";
import { useQuizAssignment, useQuizAttempt, useSubmitQuizAttempt } from "@/hooks/use-quiz";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ErrorState } from "@/components/ui/error-state";
import { Progress } from "@/components/ui/progress";
import { FullPageSpinner, Spinner } from "@/components/ui/spinner";

export function QuizRunner({ assignmentId }: { assignmentId: string }) {
  const router = useRouter();
  const assignmentQuery = useQuizAssignment(assignmentId);
  const attemptQuery = useQuizAttempt(assignmentId);
  const submitAttempt = useSubmitQuizAttempt();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (assignmentQuery.isLoading || attemptQuery.isLoading) {
    return <FullPageSpinner label="Đang chuẩn bị bài làm..." />;
  }
  if (assignmentQuery.isError || !assignmentQuery.data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <ErrorState
          title="Không tìm thấy bài tập"
          description="Bài tập không tồn tại hoặc hiện không còn khả dụng."
          onRetry={() => router.push("/student/assignments")}
          retryLabel="Về danh sách"
        />
      </div>
    );
  }

  const assignment = assignmentQuery.data;
  const existingAttempt = attemptQuery.data;
  const total = assignment.questions.length;
  const answeredCount = Object.keys(answers).filter((id) => answers[id]).length;
  const unansweredCount = total - answeredCount;
  const question = assignment.questions[currentIndex];

  if (existingAttempt) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f5f6f2] px-4">
        <div className="w-full max-w-lg rounded-[28px] border border-border bg-white p-8 text-center shadow-sm">
          <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-full bg-success/10 text-success">
            <RiCheckLine className="size-7" />
          </div>
          <h1 className="font-display text-2xl">Bài tập đã được nộp</h1>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Kết quả và phần chữa chi tiết của bạn đã sẵn sàng.
          </p>
          <Button asChild className="mt-6 w-full">
            <Link href={`/student/assignments/${assignmentId}/result`}>Xem kết quả</Link>
          </Button>
        </div>
      </main>
    );
  }

  if (!question) {
    return (
      <div className="mx-auto max-w-xl px-4 py-20">
        <ErrorState
          title="Bài tập chưa có câu hỏi"
          description="Bạn chưa thể làm bài tập này."
          onRetry={() => router.push("/student/assignments")}
          retryLabel="Về danh sách"
        />
      </div>
    );
  }

  function submit() {
    submitAttempt.mutate(
      { assignment, answers },
      { onSuccess: () => router.push(`/student/assignments/${assignment.id}/result`) },
    );
  }

  function requestSubmit() {
    if (unansweredCount > 0) setConfirmOpen(true);
    else submit();
  }

  return (
    <main className="min-h-screen bg-[#f5f6f2]">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Button asChild variant="ghost" size="icon-sm" aria-label="Về danh sách bài tập">
            <Link href="/student/assignments"><RiCloseLine /></Link>
          </Button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{assignment.title}</p>
            <p className="truncate text-xs text-muted-foreground">{assignment.courseTitle}</p>
          </div>
          <div className="hidden items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-xs font-medium text-foreground sm:flex">
            <RiTimeLine className="size-4" />
            {assignment.durationMinutes} phút
          </div>
          <Button size="sm" onClick={requestSubmit} disabled={submitAttempt.isPending}>
            {submitAttempt.isPending && <Spinner />}
            Nộp bài
          </Button>
        </div>
        <Progress value={(answeredCount / total) * 100} className="h-1 rounded-none bg-muted" />
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:px-8 lg:py-10">
        <section className="rounded-[28px] border border-border/80 bg-white p-5 shadow-xs sm:p-8 lg:p-10">
          <div className="mb-8 flex items-center justify-between gap-3">
            <span className="rounded-full bg-[#e8f1e6] px-3 py-1 text-xs font-semibold text-[#36533a]">
              Câu {currentIndex + 1} / {total}
            </span>
            <span className="text-xs text-muted-foreground">{question.points} điểm</span>
          </div>

          <h1 className="max-w-3xl font-display text-2xl leading-snug text-balance sm:text-3xl">
            {question.prompt}
          </h1>

          <fieldset className="mt-8 space-y-3">
            <legend className="sr-only">Chọn một đáp án</legend>
            {question.options.map((option, index) => {
              const selected = answers[question.id] === option.id;
              return (
                <label
                  key={option.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-4 rounded-2xl border p-4 transition sm:p-5",
                    selected
                      ? "border-[#789472] bg-[#f2f7f0] shadow-[0_0_0_1px_#789472]"
                      : "border-border bg-white hover:border-foreground/20 hover:bg-muted/40",
                  )}
                >
                  <input
                    type="radio"
                    name={question.id}
                    value={option.id}
                    checked={selected}
                    onChange={() => setAnswers((current) => ({ ...current, [question.id]: option.id }))}
                    className="sr-only"
                  />
                  <span className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                    selected ? "border-[#789472] bg-[#789472] text-white" : "border-border text-muted-foreground",
                  )}>
                    {selected ? <RiCheckLine className="size-5" /> : String.fromCharCode(65 + index)}
                  </span>
                  <span className="text-sm font-medium leading-6 sm:text-base">{option.text}</span>
                </label>
              );
            })}
          </fieldset>

          <div className="mt-10 flex items-center justify-between border-t border-border pt-5">
            <Button
              variant="outline"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((index) => index - 1)}
            >
              <RiArrowLeftLine />Trước
            </Button>
            {currentIndex < total - 1 ? (
              <Button onClick={() => setCurrentIndex((index) => index + 1)}>
                Tiếp theo<RiArrowRightLine />
              </Button>
            ) : (
              <Button onClick={requestSubmit} disabled={submitAttempt.isPending}>
                {submitAttempt.isPending && <Spinner />}Nộp bài
              </Button>
            )}
          </div>
          {submitAttempt.isError && (
            <p role="alert" className="mt-4 text-center text-sm text-destructive">
              Chưa thể lưu bài làm. Vui lòng thử nộp lại.
            </p>
          )}
        </section>

        <aside className="order-first rounded-[24px] border border-border/80 bg-white p-5 shadow-xs lg:order-none lg:self-start lg:sticky lg:top-24">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Tiến độ bài làm</h2>
              <p className="mt-1 text-xs text-muted-foreground">{answeredCount}/{total} câu đã trả lời</p>
            </div>
            <RiFileList3Line className="size-5 text-muted-foreground" />
          </div>
          <div className="mt-5 grid grid-cols-5 gap-2 sm:grid-cols-10 lg:grid-cols-5">
            {assignment.questions.map((item, index) => {
              const active = index === currentIndex;
              const answered = Boolean(answers[item.id]);
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setCurrentIndex(index)}
                  aria-label={`Đến câu ${index + 1}${answered ? ", đã trả lời" : ", chưa trả lời"}`}
                  className={cn(
                    "aspect-square rounded-xl border text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    active && "border-foreground bg-foreground text-white",
                    !active && answered && "border-[#b8cbb4] bg-[#e8f1e6] text-[#36533a]",
                    !active && !answered && "border-border bg-white text-muted-foreground hover:bg-muted",
                  )}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-5 flex gap-4 border-t border-border pt-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full bg-[#789472]" />Đã trả lời</span>
            <span className="flex items-center gap-1.5"><i className="size-2 rounded-full border border-border bg-white" />Chưa trả lời</span>
          </div>
        </aside>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bạn vẫn còn {unansweredCount} câu chưa trả lời</DialogTitle>
            <DialogDescription>
              Những câu bỏ trống sẽ không được tính điểm. Bạn có thể quay lại hoàn thành hoặc vẫn nộp bài ngay.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Tiếp tục làm bài</Button>
            <Button
              onClick={() => {
                setConfirmOpen(false);
                submit();
              }}
              disabled={submitAttempt.isPending}
            >
              Vẫn nộp bài
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
