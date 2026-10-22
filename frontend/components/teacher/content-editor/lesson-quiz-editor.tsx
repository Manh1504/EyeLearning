"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input, Textarea } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { useQuizAssignment, useUpdateQuizAssignment } from "@/hooks/use-quiz";
import { useUnsavedGuard } from "@/components/teacher/unsaved-guard";
import { draftPayload, isQuestionComplete, questionIssues, trimQuestion } from "@/lib/quiz-validation";
import { cn } from "@/lib/utils";
import type { QuizAssignmentStatus, QuizQuestion } from "@/lib/types/domain";
import {
  QuizQuestionEditor,
  duplicateQuestion,
  newQuestion,
} from "@/components/quiz/quiz-question-editor";

const STATUS_TONE: Record<QuizAssignmentStatus, string> = {
  draft: "border-black/10 bg-black/5 text-black/65",
  published: "border-[#cfe0ca] bg-[#e8f1e6] text-[#3f573c]",
  closed: "border-black/10 bg-black/5 text-black/65",
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

interface QuizForm {
  title: string;
  instructions: string;
  durationMinutes: number;
  dueAt: string;
  allowRetry: boolean;
  questions: QuizQuestion[];
}

const serialize = (form: QuizForm) => JSON.stringify(form);

/**
 * Trình soạn bài tập trắc nghiệm: tên bài + danh sách câu hỏi (trái) và vùng sửa
 * câu đang chọn (phải). Câu dở được đánh dấu ngay tại danh sách và tại trường.
 */
export function LessonQuizEditor({
  quizId,
  canManage,
  onChanged,
  focusTitleToken = 0,
}: {
  quizId: string;
  canManage: boolean;
  onChanged: () => void;
  focusTitleToken?: number;
}) {
  const { data: assignment, isLoading } = useQuizAssignment(quizId);
  const updateAssignment = useUpdateQuizAssignment();
  const guard = useUnsavedGuard();
  const titleInputRef = useRef<HTMLInputElement>(null);

  const [hydratedId, setHydratedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [dueAt, setDueAt] = useState("");
  const [status, setStatus] = useState<QuizAssignmentStatus>("draft");
  const [allowRetry, setAllowRetry] = useState(false);
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [baseline, setBaseline] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  // Render-phase hydrate một lần cho mỗi bài tập.
  if (assignment && hydratedId !== assignment.id) {
    const form: QuizForm = {
      title: assignment.title,
      instructions: assignment.instructions,
      durationMinutes: assignment.durationMinutes,
      dueAt: toLocalInput(assignment.dueAt),
      allowRetry: Boolean(assignment.allowRetry),
      questions: assignment.questions,
    };
    setHydratedId(assignment.id);
    setTitle(form.title);
    setInstructions(form.instructions);
    setDurationMinutes(form.durationMinutes);
    setDueAt(form.dueAt);
    setStatus(assignment.status);
    setAllowRetry(form.allowRetry);
    setQuestions(form.questions);
    setSelectedIndex(0);
    setBaseline(serialize(form));
  }

  const form = useMemo<QuizForm>(
    () => ({ title, instructions, durationMinutes, dueAt, allowRetry, questions }),
    [title, instructions, durationMinutes, dueAt, allowRetry, questions],
  );
  const snapshot = useMemo(() => serialize(form), [form]);
  const dirty = baseline !== "" && snapshot !== baseline;

  const incomplete = useMemo(
    () => questions.map((question, index) => ({ index, complete: isQuestionComplete(question) })),
    [questions],
  );
  const incompleteCount = incomplete.filter((entry) => !entry.complete).length;
  const totalPoints = questions.reduce((sum, question) => sum + (question.points || 0), 0);

  const flash = useCallback((tone: "ok" | "err", text: string) => {
    setMessage({ tone, text });
    if (tone === "ok") window.setTimeout(() => setMessage(null), 6000);
  }, []);

  const patchQuestion = (index: number, next: QuizQuestion) =>
    setQuestions((current) => current.map((item, i) => (i === index ? next : item)));

  const save = useCallback(
    async (target: QuizAssignmentStatus): Promise<boolean> => {
      if (!canManage) return false;

      if (target === "published") {
        if (questions.length === 0) {
          flash("err", "Cần ít nhất một câu hỏi trước khi giao bài.");
          return false;
        }
        if (incompleteCount > 0) {
          const firstBad = incomplete.find((entry) => !entry.complete);
          flash(
            "err",
            `Còn ${incompleteCount} câu chưa hoàn thiện. Sửa các câu được đánh dấu rồi giao bài.`,
          );
          if (firstBad) setSelectedIndex(firstBad.index);
          return false;
        }
      }

      const draft = draftPayload(questions);
      const payload = target === "published" ? questions.map(trimQuestion) : draft.questions;
      const dueIso = form.dueAt ? new Date(form.dueAt).toISOString() : null;

      setSaving(true);
      try {
        const saved = await updateAssignment.mutateAsync({
          id: quizId,
          patch: {
            title: form.title.trim() || "Bài tập mới",
            instructions: form.instructions.trim(),
            durationMinutes: Math.max(1, form.durationMinutes || 1),
            dueAt: dueIso,
            status: target,
            allowRetry: form.allowRetry,
            // Schema PATCH từ chối mảng rỗng → chỉ gửi khi có câu hợp lệ.
            ...(payload.length ? { questions: payload } : {}),
          },
        });
        setStatus(saved.status);
        setBaseline(snapshot);
        onChanged();
        if (target === "published") {
          flash("ok", "Đã giao bài cho học viên.");
        } else if (draft.unsavedCount > 0) {
          flash(
            "ok",
            `Đã lưu bản nháp. ${draft.unsavedCount} câu chưa hoàn thiện vẫn giữ trên màn hình nhưng chưa lưu được lên hệ thống.`,
          );
        } else {
          flash("ok", "Đã lưu bản nháp.");
        }
        return true;
      } catch (error) {
        flash(
          "err",
          `Không lưu được bài tập: ${error instanceof Error ? error.message : "lỗi không xác định"}`,
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [canManage, flash, form, incomplete, incompleteCount, onChanged, questions, quizId, snapshot, updateAssignment],
  );

  // Cảnh báo "còn thay đổi chưa lưu" khi giáo viên chuyển mục / chuyển tab / rời trang.
  useEffect(() => {
    if (!guard || !canManage) return;
    return guard.register({
      label: "bài tập",
      isDirty: () => dirty,
      save: () => save("draft"),
    });
  }, [guard, canManage, dirty, save]);

  // "Đổi tên" từ mục lục: bài tập đổi tên qua ô "Tên bài tập" này.
  useEffect(() => {
    if (focusTitleToken === 0 || !titleInputRef.current) return;
    titleInputRef.current.focus();
    titleInputRef.current.select();
  }, [focusTitleToken]);

  // Cho phép làm lại: bật/tắt là lưu ngay (không cần bấm Lưu nháp).
  const toggleAllowRetry = async (value: boolean) => {
    const previous = allowRetry;
    setAllowRetry(value);
    try {
      await updateAssignment.mutateAsync({ id: quizId, patch: { allowRetry: value } });
      setBaseline(
        serialize({ ...form, allowRetry: value, questions }),
      );
      onChanged();
      flash("ok", value ? "Đã cho phép học viên làm lại bài này." : "Đã tắt cho phép làm lại.");
    } catch {
      setAllowRetry(previous);
      flash("err", "Không đổi được thiết lập làm lại. Vui lòng thử lại.");
    }
  };

  const addQuestion = () => {
    const next = [...questions, newQuestion()];
    setQuestions(next);
    setSelectedIndex(next.length - 1);
  };

  const removeQuestion = (index: number) => {
    if (questions.length <= 1) return;
    const next = questions.filter((_, i) => i !== index);
    setQuestions(next);
    setSelectedIndex((selected) => Math.min(selected, next.length - 1));
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    setQuestions(next);
    setSelectedIndex(target);
  };

  const duplicateAt = (index: number) => {
    const copy = duplicateQuestion(questions[index]);
    const next = [...questions.slice(0, index + 1), copy, ...questions.slice(index + 1)];
    setQuestions(next);
    setSelectedIndex(index + 1);
  };

  if (isLoading) {
    return <p className="text-sm text-black/55">Đang tải bài tập…</p>;
  }
  if (!assignment) {
    return <p className="text-sm text-destructive">Không tải được bài tập.</p>;
  }

  const selected = questions[selectedIndex] ?? null;

  return (
    <div className="space-y-5">
      {/* Tên bài tập + trạng thái */}
      <section className="rounded-[20px] border border-[#eeeee9] bg-white p-4 shadow-xs sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-1.5">
            <label
              htmlFor={`quiz-title-${assignment.id}`}
              className="block text-sm font-medium text-black"
            >
              Tên bài tập
            </label>
            <Input
              id={`quiz-title-${assignment.id}`}
              ref={titleInputRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              readOnly={!canManage}
              placeholder="Ví dụ: Kiểm tra chương 1"
              className="h-11"
            />
          </div>
          <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
            <span
              className={cn(
                "rounded-full border px-3 py-1 text-[11px] font-semibold",
                STATUS_TONE[status],
              )}
            >
              {QUIZ_STATUS_LABEL[status]}
            </span>
            <span className="text-xs font-medium text-black/60">
              {questions.length} câu · {totalPoints} điểm
            </span>
          </div>
        </div>

        {status === "draft" && (
          <p className="mt-3 flex items-start gap-2 rounded-[14px] border border-warning/30 bg-warning/8 px-3 py-2 text-xs leading-5 text-black/75">
            <Icon name="ri-information-line" className="mt-0.5 size-3.5 shrink-0 text-warning" />
            Bài tập đang ở bản nháp nên học viên CHƯA thấy. Bấm “Giao bài cho học viên” để đưa vào
            khóa học.
          </p>
        )}

        {message && (
          <Alert
            variant={message.tone === "ok" ? "success" : "destructive"}
            className="mt-3"
            title={message.text}
          />
        )}

        {dirty && (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-black/60">
            <span className="size-1.5 rounded-full bg-warning" />
            Có thay đổi chưa lưu
          </p>
        )}
      </section>

      {/* Thiết lập ít dùng — gập 1 cấp; công tắc "làm lại" luôn hiện. */}
      <section className="space-y-3 rounded-[20px] border border-[#eeeee9] bg-white p-4 shadow-xs sm:p-6">
        <div className="flex flex-col gap-3 rounded-[16px] border border-[#dfe9dc] bg-[#e8f1e6]/45 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <h4 className="flex items-center gap-2 text-sm font-semibold text-black">
              <Icon name="ri-refresh-line" className="size-4 text-[#52704f]" />
              Cho phép học viên làm lại
            </h4>
            <p className="mt-1 text-xs leading-5 text-black/65">
              Bật để học viên được xoá kết quả cũ và làm lại từ đầu khi bài còn mở; đồng hồ làm bài
              chạy lại. Lưu ngay khi bật/tắt.
            </p>
          </div>
          <Switch
            checked={allowRetry}
            disabled={!canManage || updateAssignment.isPending}
            onCheckedChange={(value) => void toggleAllowRetry(value)}
            ariaLabel={`Cho phép học viên làm lại — ${assignment.title}`}
          />
        </div>

        <details className="rounded-[16px] border border-black/10 bg-[#fdfdfa] p-4">
          <summary className="cursor-pointer text-sm font-semibold text-black">
            Thời lượng, hạn nộp, hướng dẫn
          </summary>
          <p className="mt-2 text-xs leading-5 text-black/60">
            Các thay đổi trong mục này chỉ được áp dụng khi bấm “Lưu bài tập nháp” hoặc “Giao bài cho
            học viên”.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label
                htmlFor={`quiz-duration-${assignment.id}`}
                className="block text-sm font-medium text-black/75"
              >
                Thời lượng (phút) <span className="text-destructive">*</span>
              </label>
              <Input
                id={`quiz-duration-${assignment.id}`}
                type="number"
                min={1}
                max={1440}
                step={1}
                value={durationMinutes}
                readOnly={!canManage}
                onChange={(event) => setDurationMinutes(event.target.valueAsNumber || 1)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <label
                htmlFor={`quiz-due-${assignment.id}`}
                className="block text-sm font-medium text-black/75"
              >
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
              <label
                htmlFor={`quiz-instructions-${assignment.id}`}
                className="block text-sm font-medium text-black/75"
              >
                Hướng dẫn làm bài
              </label>
              <Textarea
                id={`quiz-instructions-${assignment.id}`}
                value={instructions}
                readOnly={!canManage}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="Nêu yêu cầu, quy tắc và điều học viên cần lưu ý…"
                className="min-h-16"
              />
            </div>
          </div>
        </details>
      </section>

      {/* Danh sách câu hỏi + vùng sửa câu đang chọn */}
      <section className="rounded-[20px] border border-[#eeeee9] bg-white p-4 shadow-xs sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold text-black">Câu hỏi</h3>
          {incompleteCount > 0 && (
            <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              <Icon name="ri-error-warning-line" className="size-3.5" />
              {incompleteCount} câu chưa hoàn thiện
            </span>
          )}
        </div>

        <div className="mt-3 grid gap-4 lg:grid-cols-[minmax(0,270px)_minmax(0,1fr)] lg:items-start">
          <div className="space-y-2">
            {canManage && (
              <Button
                type="button"
                className="w-full justify-center rounded-full"
                onClick={addQuestion}
              >
                <Icon name="ri-add-line" className="size-4" />
                Thêm câu hỏi
              </Button>
            )}
            <ul className="space-y-1.5">
              {questions.map((question, index) => {
                const complete = isQuestionComplete(question);
                const active = index === selectedIndex;
                return (
                  <li key={question.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedIndex(index)}
                      aria-current={active ? "true" : undefined}
                      aria-label={`Câu hỏi ${index + 1}`}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-[14px] border px-2.5 py-2 text-left transition",
                        active
                          ? "border-[#6f8f69] bg-[#e8f1e6]/60"
                          : "border-[#eeeee9] bg-[#fdfdfa] hover:border-black/15",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums",
                          active ? "bg-black text-white" : "bg-black/5 text-black/60",
                        )}
                      >
                        {index + 1}
                      </span>
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-xs",
                          question.prompt.trim() ? "text-black" : "italic text-black/45",
                        )}
                      >
                        {question.prompt.trim() || "Chưa có nội dung"}
                      </span>
                      {!complete && (
                        <span
                          className="size-2 shrink-0 rounded-full bg-warning"
                          title={questionIssues(question).join(" · ")}
                          aria-label={questionIssues(question).join(" · ")}
                        />
                      )}
                      <span className="shrink-0 text-[11px] font-medium text-black/50 tabular-nums">
                        {question.points}đ
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {questions.length === 0 && (
              <p className="rounded-[14px] border border-dashed border-black/10 bg-[#fdfdfa] px-3 py-4 text-center text-xs text-black/55">
                Chưa có câu hỏi. Bấm “Thêm câu hỏi” để bắt đầu.
              </p>
            )}
          </div>

          <div>
            {selected ? (
              <QuizQuestionEditor
                question={selected}
                index={selectedIndex}
                canRemove={canManage && questions.length > 1}
                canMoveUp={canManage && selectedIndex > 0}
                canMoveDown={canManage && selectedIndex < questions.length - 1}
                onChange={(next) => patchQuestion(selectedIndex, next)}
                onRemove={() => removeQuestion(selectedIndex)}
                onDuplicate={() => duplicateAt(selectedIndex)}
                onMoveUp={() => moveQuestion(selectedIndex, -1)}
                onMoveDown={() => moveQuestion(selectedIndex, 1)}
              />
            ) : (
              <p className="rounded-[18px] border border-dashed border-black/10 bg-[#fdfdfa] px-4 py-10 text-center text-sm text-black/55">
                Chọn một câu hỏi ở danh sách bên trái, hoặc bấm “Thêm câu hỏi”.
              </p>
            )}
          </div>
        </div>
      </section>

      {canManage && (
        <div className="sticky bottom-3 z-10 flex flex-col gap-2 rounded-[20px] border border-[#eeeee9] bg-white/95 p-3 shadow-[0_10px_30px_rgba(30,35,25,0.08)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
          <p className="px-1 text-xs text-black/60">
            {dirty
              ? "Chưa lưu: thay đổi sẽ mất nếu rời mục này."
              : "Mọi thay đổi đã được lưu."}
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className="rounded-full border-black/10 bg-white"
              disabled={saving}
              onClick={() => void save("draft")}
            >
              {saving ? "Đang lưu…" : "Lưu bài tập nháp"}
            </Button>
            <Button
              type="button"
              className="rounded-full"
              disabled={saving || status === "published"}
              onClick={() => void save("published")}
            >
              {status === "published" ? "Đã giao bài" : saving ? "Đang lưu…" : "Giao bài cho học viên"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
