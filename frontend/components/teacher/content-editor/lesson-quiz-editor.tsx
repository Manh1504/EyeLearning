"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { useQuizAssignment, useUpdateQuizAssignment } from "@/hooks/use-quiz";
import type { QuizAssignmentStatus, QuizQuestion } from "@/lib/types/domain";
import { QuizQuestionEditor, newQuestion } from "@/components/quiz/quiz-question-editor";

const STATUS_TONE: Record<QuizAssignmentStatus, string> = {
  draft: "bg-muted text-muted-foreground",
  published: "bg-[#e8f1e6] text-[#52704f]",
  closed: "bg-muted text-muted-foreground",
};

const QUIZ_STATUS_LABEL: Record<QuizAssignmentStatus, string> = {
  draft: "Bản nháp",
  published: "Đã giao",
  closed: "Đã đóng",
};

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function LessonQuizEditor({
  quizId,
  canManage,
  onChanged,
}: {
  quizId: string;
  canManage: boolean;
  onChanged: () => void;
}) {
  const { data: assignment, isLoading } = useQuizAssignment(quizId);
  const updateAssignment = useUpdateQuizAssignment();

  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [dueAt, setDueAt] = useState("");
  const [status, setStatus] = useState<QuizAssignmentStatus>("draft");
  const [allowRetry, setAllowRetry] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  // Render-phase hydrate một lần cho mỗi bài tập.
  if (assignment && hydratedId !== assignment.id) {
    setHydratedId(assignment.id);
    setTitle(assignment.title);
    setInstructions(assignment.instructions);
    setDurationMinutes(assignment.durationMinutes);
    setDueAt(toLocalInput(assignment.dueAt));
    setStatus(assignment.status);
    setAllowRetry(Boolean(assignment.allowRetry));
    setQuestions(assignment.questions);
  }

  const flash = (tone: "ok" | "err", text: string) => {
    setMessage({ tone, text });
    window.setTimeout(() => setMessage(null), 5000);
  };

  const patchQuestion = (index: number, next: QuizQuestion) =>
    setQuestions((current) => current.map((item, i) => (i === index ? next : item)));

  const removeQuestion = (index: number) =>
    setQuestions((current) => current.filter((_, i) => i !== index));

  const save = async (target: QuizAssignmentStatus) => {
    if (!canManage) return;
    const cleaned = questions.map((question) => ({
      ...question,
      prompt: question.prompt.trim(),
      explanation: question.explanation.trim(),
      options: question.options.map((option) => ({ ...option, text: option.text.trim() })),
    }));
    const invalid = cleaned.some(
      (question) =>
        !question.prompt ||
        question.options.some((option) => !option.text) ||
        question.correctOptionIds.length === 0,
    );
    if (invalid) {
      flash("err", "Còn câu hỏi hoặc lựa chọn để trống. Vui lòng kiểm tra lại.");
      return;
    }
    if (target === "published" && cleaned.length === 0) {
      flash("err", "Cần ít nhất một câu hỏi trước khi giao bài.");
      return;
    }
    const dueIso = dueAt ? new Date(dueAt).toISOString() : null;
    try {
      await updateAssignment.mutateAsync({
        id: quizId,
        patch: {
          title: title.trim() || "Bài tập mới",
          instructions: instructions.trim(),
          durationMinutes: Math.max(1, durationMinutes || 1),
          dueAt: dueIso,
          status: target,
          allowRetry,
          ...(cleaned.length ? { questions: cleaned } : {}),
        },
      });
      setStatus(target);
      onChanged();
      flash("ok", target === "published" ? "Đã giao bài cho học viên." : "Đã lưu bản nháp.");
    } catch {
      flash("err", "Không lưu được bài tập. Vui lòng thử lại.");
    }
  };

  // Cho phép làm lại: bật/tắt là lưu ngay (không cần bấm Lưu), giống công tắc
  // "Hiển thị điểm nhìn cho sinh viên" của bài giảng.
  const toggleAllowRetry = async (value: boolean) => {
    const previous = allowRetry;
    setAllowRetry(value);
    try {
      await updateAssignment.mutateAsync({ id: quizId, patch: { allowRetry: value } });
      onChanged();
      flash("ok", value ? "Đã cho phép học viên làm lại bài này." : "Đã tắt cho phép làm lại.");
    } catch {
      setAllowRetry(previous);
      flash("err", "Không đổi được thiết lập làm lại. Vui lòng thử lại.");
    }
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Đang tải bài tập…</p>;
  }
  if (!assignment) {
    return <p className="text-sm text-destructive">Không tải được bài tập.</p>;
  }

  const totalPoints = questions.reduce((sum, question) => sum + (question.points || 0), 0);

  return (
    <div className="space-y-4 rounded-[20px] border border-[#eeeee9] bg-white px-4 py-5 shadow-xs sm:px-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <label htmlFor={`quiz-title-${assignment.id}`} className="block text-xs font-medium text-black/55">
            Tên bài tập
          </label>
          <Input
            id={`quiz-title-${assignment.id}`}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            readOnly={!canManage}
            className="h-10"
          />
        </div>
        <span className={`mt-5 shrink-0 self-start rounded-full px-3 py-1 text-[11px] font-semibold ${STATUS_TONE[status]}`}>
          {QUIZ_STATUS_LABEL[status]}
        </span>
      </div>

      {message && (
        <Alert variant={message.tone === "ok" ? "success" : "destructive"} title={message.text} />
      )}

      {canManage && (
        <div className="flex flex-col gap-3 rounded-[16px] border border-[#dfe9dc] bg-[#e8f1e6]/45 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-black">
              <Icon name="ri-refresh-line" className="size-4 text-[#52704f]" />
              Cho phép học viên làm lại
            </h4>
            <p className="mt-1 text-xs leading-5 text-black/50">
              Bật để học viên được xoá kết quả cũ và làm lại từ đầu khi bài còn mở; đồng hồ làm bài
              chạy lại. Mặc định tắt.
            </p>
          </div>
          <Switch
            checked={allowRetry}
            disabled={updateAssignment.isPending}
            onCheckedChange={(value) => void toggleAllowRetry(value)}
            ariaLabel={`Cho phép học viên làm lại — ${assignment.title}`}
          />
        </div>
      )}

      <details className="rounded-xl bg-[#fdfdfa] px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-black/55">
          Thiết lập bài tập (thời lượng, hạn nộp, hướng dẫn)
        </summary>
        <p className="mt-1 text-xs leading-5 text-black/40">
          Các thay đổi trong mục này chỉ được áp dụng khi bấm “Lưu nháp” hoặc “Xuất bản”.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label htmlFor={`quiz-duration-${assignment.id}`} className="block text-xs font-medium text-black/55">
              Thời lượng (phút) <span className="text-destructive">*</span>
            </label>
            <Input
              id={`quiz-duration-${assignment.id}`}
              type="number"
              min={1}
              step={1}
              value={durationMinutes}
              readOnly={!canManage}
              onChange={(event) => setDurationMinutes(event.target.valueAsNumber || 1)}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`quiz-due-${assignment.id}`} className="block text-xs font-medium text-black/55">
              Hạn nộp (tùy chọn)
            </label>
            <Input
              id={`quiz-due-${assignment.id}`}
              type="datetime-local"
              value={dueAt}
              readOnly={!canManage}
              onChange={(event) => setDueAt(event.target.value)}
              className="h-10"
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <label htmlFor={`quiz-instructions-${assignment.id}`} className="block text-xs font-medium text-black/55">
              Hướng dẫn làm bài
            </label>
            <Textarea
              id={`quiz-instructions-${assignment.id}`}
              value={instructions}
              readOnly={!canManage}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder="Nêu yêu cầu, quy tắc và điều học viên cần lưu ý..."
              className="min-h-16"
            />
          </div>
        </div>
      </details>

      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-black">Câu hỏi</h4>
        <span className="text-xs text-muted-foreground">
          {questions.length} câu · {totalPoints} điểm
        </span>
      </div>

      <div className="space-y-3">
        {questions.map((question, index) => (
          <QuizQuestionEditor
            key={question.id}
            question={question}
            index={index}
            canRemove={canManage && questions.length > 1}
            onChange={(next) => patchQuestion(index, next)}
            onRemove={() => removeQuestion(index)}
          />
        ))}
      </div>

      {canManage && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="justify-start rounded-full"
            onClick={() => setQuestions((current) => [...current, newQuestion()])}
          >
            <Icon name="ri-add-line" className="size-4" />
            Thêm câu hỏi
          </Button>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-full"
              disabled={updateAssignment.isPending}
              onClick={() => save("draft")}
            >
              Lưu nháp
            </Button>
            <Button
              type="button"
              size="sm"
              className="rounded-full bg-black text-white hover:bg-black/80"
              disabled={updateAssignment.isPending}
              onClick={() => save("published")}
            >
              {updateAssignment.isPending ? "Đang lưu…" : "Xuất bản"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
