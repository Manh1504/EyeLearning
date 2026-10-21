"use client";

import { useEffect, useState } from "react";
import {
  RiArrowRightLine,
  RiCheckLine,
  RiCloseLine,
  RiRefreshLine,
  RiTimeLine,
} from "@remixicon/react";
import {
  useQuizAssignment,
  useQuizAttempt,
  useRetryQuizAttempt,
  useSubmitQuizAttempt,
} from "@/hooks/use-quiz";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StudyAssistantChat } from "@/components/assistant/study-assistant-chat";
import { ApiError } from "@/lib/api/client";
import type { QuizAssignment, QuizAttempt } from "@/lib/types/domain";

function NextButton({ onNext, hasNext }: { onNext?: () => void; hasNext?: boolean }) {
  if (!onNext) return null;
  if (!hasNext) {
    return <span className="text-xs font-medium text-muted-foreground">Đã hết nội dung khóa học</span>;
  }
  return (
    <Button size="sm" onClick={onNext}>
      Bài tiếp theo
      <RiArrowRightLine className="size-4" />
    </Button>
  );
}

function ReviewView({
  assignment,
  attempt,
  onNext,
  hasNext,
  canRetry,
  retrying,
  retryError,
  onRetry,
}: {
  assignment: QuizAssignment;
  attempt: QuizAttempt;
  onNext?: () => void;
  hasNext?: boolean;
  canRetry: boolean;
  retrying: boolean;
  retryError?: string;
  onRetry: () => void;
}) {
  const [confirmRetry, setConfirmRetry] = useState(false);
  const percentage = attempt.maxScore ? Math.round((attempt.score / attempt.maxScore) * 100) : 0;
  const correctCount = assignment.questions.filter((question) => {
    const selected = new Set(attempt.answers[question.id] ?? []);
    const correct = new Set(question.correctOptionIds);
    return selected.size === correct.size && [...selected].every((id) => correct.has(id));
  }).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-white p-5 shadow-xs sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Badge variant={percentage >= 70 ? "success" : "warning"}>
            {percentage >= 70 ? "Hoàn thành tốt" : "Cần ôn tập thêm"}
          </Badge>
          <h2 className="mt-3 text-lg font-semibold text-foreground">{assignment.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {attempt.score}/{attempt.maxScore} điểm · {correctCount}/{assignment.questions.length} câu đúng
          </p>
          <Progress value={percentage} className="mt-3 max-w-sm" indicatorClassName="bg-[#789472]" />
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <NextButton onNext={onNext} hasNext={hasNext} />
          {canRetry && (
            <Button
              variant="outline"
              size="sm"
              disabled={retrying}
              onClick={() => setConfirmRetry(true)}
            >
              <RiRefreshLine className="size-4" />
              {retrying ? "Đang làm lại…" : "Làm lại"}
            </Button>
          )}
        </div>
      </div>

      {retryError && (
        <p role="alert" className="text-sm text-destructive">
          {retryError}
        </p>
      )}

      <div className="space-y-3">
        {assignment.questions.map((question, questionIndex) => {
          const selected = attempt.answers[question.id] ?? [];
          const correct = new Set(question.correctOptionIds);
          const isCorrect =
            selected.length === correct.size && selected.every((id) => correct.has(id));
          return (
            <article key={question.id} className="rounded-2xl border border-border/80 bg-white p-4 shadow-xs sm:p-5">
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full",
                    isCorrect ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive",
                  )}
                >
                  {isCorrect ? <RiCheckLine className="size-4" /> : <RiCloseLine className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-muted-foreground">Câu {questionIndex + 1}</p>
                  <h3 className="mt-1 text-sm font-semibold leading-6 sm:text-base">{question.prompt}</h3>
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {question.options.map((option, optionIndex) => {
                  const chosen = selected.includes(option.id);
                  const isAnswer = correct.has(option.id);
                  return (
                    <div
                      key={option.id}
                      className={cn(
                        "flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm",
                        isAnswer && "border-success/25 bg-success/6 text-success",
                        chosen && !isAnswer && "border-destructive/25 bg-destructive/6 text-destructive",
                        !isAnswer && !chosen && "border-transparent bg-muted/50 text-muted-foreground",
                      )}
                    >
                      <span className="font-semibold">{String.fromCharCode(65 + optionIndex)}.</span>
                      <span className="flex-1">{option.text}</span>
                      {chosen && <span className="text-xs font-semibold">Bạn chọn</span>}
                      {isAnswer && <span className="text-xs font-semibold">Đáp án đúng</span>}
                    </div>
                  );
                })}
                {selected.length === 0 && (
                  <p className="text-xs font-medium text-destructive">Bạn chưa trả lời câu này.</p>
                )}
              </div>

              {question.explanation && (
                <div className="mt-3 rounded-xl bg-[#f7f7f4] p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[#36533a]">Giải thích</p>
                  <p className="mt-1.5 text-sm leading-6 text-foreground/80">{question.explanation}</p>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <Dialog open={confirmRetry} onOpenChange={setConfirmRetry}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Làm lại bài tập?</DialogTitle>
            <DialogDescription>
              Kết quả hiện tại ({attempt.score}/{attempt.maxScore} điểm) sẽ bị xoá và bạn làm lại từ
              đầu. Đồng hồ làm bài cũng chạy lại từ đầu.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRetry(false)}>
              Giữ kết quả
            </Button>
            <Button
              onClick={() => {
                setConfirmRetry(false);
                onRetry();
              }}
            >
              <RiRefreshLine className="size-4" />
              Làm lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <StudyAssistantChat
        courseId={assignment.courseId}
        lessonId={assignment.lessonId ?? null}
        assignmentId={assignment.id}
      />
    </div>
  );
}

export function InlineQuiz({
  quizId,
  onNext,
  hasNext,
}: {
  quizId: string;
  onNext?: () => void;
  hasNext?: boolean;
}) {
  const assignmentQuery = useQuizAssignment(quizId);
  const attemptQuery = useQuizAttempt(quizId);
  const submitAttempt = useSubmitQuizAttempt();
  const retryAttempt = useRetryQuizAttempt();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [expired, setExpired] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const expiresAt = assignmentQuery.data?.expiresAt;

  useEffect(() => {
    if (!expiresAt) return;
    const delay = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    const timeout = window.setTimeout(() => setExpired(true), delay);
    return () => window.clearTimeout(timeout);
  }, [expiresAt]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 15000);
    return () => window.clearInterval(id);
  }, []);

  if (assignmentQuery.isLoading || attemptQuery.isLoading) {
    return <Skeleton className="h-72 w-full rounded-2xl" />;
  }
  const assignment = assignmentQuery.data;
  if (assignmentQuery.isError || attemptQuery.isError || !assignment) {
    return (
      <p className="p-8 text-center text-sm text-muted-foreground">Bài tập hiện không khả dụng.</p>
    );
  }

  if (attemptQuery.data) {
    return (
      <ReviewView
        assignment={assignment}
        attempt={attemptQuery.data}
        onNext={onNext}
        hasNext={hasNext}
        // Chỉ làm lại được khi giáo viên bật cờ và bài vẫn đang mở.
        canRetry={Boolean(assignment.allowRetry) && assignment.status === "published" && !expired}
        retrying={retryAttempt.isPending}
        retryError={
          retryAttempt.isError
            ? retryAttempt.error instanceof ApiError
              ? retryAttempt.error.message
              : "Chưa thể làm lại bài. Vui lòng thử lại."
            : undefined
        }
        onRetry={() =>
          retryAttempt.mutate(quizId, {
            onSuccess: () => {
              // Lượt làm cũ đã bị xoá: dựng lại bài từ đầu (state cục bộ không
              // tự reset vì component không unmount).
              setCurrentIndex(0);
              setAnswers({});
              setExpired(false);
            },
          })
        }
      />
    );
  }

  if (assignment.status === "closed" || expired) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-border/80 bg-white p-10 text-center shadow-xs">
        <p className="text-sm font-semibold text-foreground">Bài tập đã đóng</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          Hạn nộp hoặc thời gian làm bài đã kết thúc.
        </p>
        <NextButton onNext={onNext} hasNext={hasNext} />
      </div>
    );
  }

  if (!assignment.questions.length) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Bài tập chưa có câu hỏi.</p>;
  }

  const total = assignment.questions.length;
  const question = assignment.questions[currentIndex];
  const selected = answers[question.id] ?? [];
  const answeredCount = Object.values(answers).filter((value) => value.length > 0).length;
  const unanswered = total - answeredCount;
  const remainingMin =
    expiresAt != null ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60000)) : null;

  const setSelected = (next: string[]) =>
    setAnswers((current) => ({ ...current, [question.id]: next }));

  const toggle = (optionId: string) => {
    if (question.allowMultiple) {
      const has = selected.includes(optionId);
      setSelected(has ? selected.filter((id) => id !== optionId) : [...selected, optionId]);
    } else {
      setSelected([optionId]);
    }
  };

  const submit = () => submitAttempt.mutate({ assignment, answers });

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/80 bg-white p-5 shadow-xs sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="rounded-full bg-[#e8f1e6] px-3 py-1 text-xs font-semibold text-[#36533a]">
            Câu {currentIndex + 1} / {total}
          </span>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            {remainingMin != null && (
              <span className="flex items-center gap-1.5">
                <RiTimeLine className="size-3.5" />
                Còn ~{remainingMin} phút
              </span>
            )}
            <span>{question.points} điểm</span>
          </div>
        </div>
        <Progress value={(answeredCount / total) * 100} className="mt-4 h-1 bg-muted" />

        <h2 className="mt-6 text-lg font-semibold leading-7 text-foreground sm:text-xl">
          {question.prompt}
        </h2>
        {question.allowMultiple && (
          <p className="mt-1 text-xs text-muted-foreground">Chọn tất cả đáp án đúng.</p>
        )}

        <fieldset className="mt-5 space-y-2.5">
          <legend className="sr-only">Chọn đáp án</legend>
          {question.options.map((option, index) => {
            const isSelected = selected.includes(option.id);
            return (
              <label
                key={option.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-2xl border p-3.5 transition sm:p-4",
                  isSelected
                    ? "border-[#789472] bg-[#f2f7f0] shadow-[0_0_0_1px_#789472]"
                    : "border-border bg-white hover:border-foreground/20 hover:bg-muted/40",
                )}
              >
                <input
                  type={question.allowMultiple ? "checkbox" : "radio"}
                  name={question.id}
                  checked={isSelected}
                  onChange={() => toggle(option.id)}
                  className="sr-only"
                />
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold",
                    isSelected
                      ? "border-[#789472] bg-[#789472] text-white"
                      : "border-border text-muted-foreground",
                  )}
                >
                  {isSelected ? <RiCheckLine className="size-4" /> : String.fromCharCode(65 + index)}
                </span>
                <span className="text-sm font-medium leading-6">{option.text}</span>
              </label>
            );
          })}
        </fieldset>

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-border pt-4">
          <Button
            variant="outline"
            size="sm"
            disabled={currentIndex === 0}
            onClick={() => setCurrentIndex((index) => index - 1)}
          >
            Trước
          </Button>
          {currentIndex < total - 1 ? (
            <Button size="sm" onClick={() => setCurrentIndex((index) => index + 1)}>
              Tiếp<RiArrowRightLine className="size-4" />
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={submitAttempt.isPending}
              onClick={() => (unanswered > 0 ? setConfirmOpen(true) : submit())}
            >
              {submitAttempt.isPending ? "Đang nộp…" : "Nộp bài"}
            </Button>
          )}
        </div>
        {submitAttempt.isError && (
          <p role="alert" className="mt-3 text-center text-sm text-destructive">
            {submitAttempt.error instanceof ApiError
              ? submitAttempt.error.message
              : "Chưa thể lưu bài làm. Vui lòng thử lại."}
          </p>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bạn còn {unanswered} câu chưa trả lời</DialogTitle>
            <DialogDescription>
              Những câu bỏ trống sẽ không được tính điểm. Bạn có thể quay lại hoàn thành hoặc nộp ngay.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Tiếp tục làm bài
            </Button>
            <Button
              disabled={submitAttempt.isPending}
              onClick={() => {
                setConfirmOpen(false);
                submit();
              }}
            >
              Vẫn nộp bài
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
