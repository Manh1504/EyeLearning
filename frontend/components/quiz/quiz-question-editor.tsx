"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input, Textarea } from "@/components/ui/input";
import { questionIssues } from "@/lib/quiz-validation";
import { cn } from "@/lib/utils";
import type { QuizOption, QuizQuestion } from "@/lib/types/domain";

export function newOption(): QuizOption {
  return { id: `opt-${crypto.randomUUID()}`, text: "" };
}

export function newQuestion(): QuizQuestion {
  const first = newOption();
  return {
    id: `q-${crypto.randomUUID()}`,
    prompt: "",
    options: [first, newOption()],
    correctOptionIds: [first.id],
    allowMultiple: false,
    explanation: "",
    points: 1,
  };
}

/** Bản sao của một câu hỏi với id mới cho câu và từng lựa chọn. */
export function duplicateQuestion(question: QuizQuestion): QuizQuestion {
  const options = question.options.map((option) => ({ ...option, id: newOption().id }));
  const idMap = new Map(question.options.map((option, index) => [option.id, options[index].id]));
  return {
    ...question,
    id: `q-${crypto.randomUUID()}`,
    options,
    correctOptionIds: question.correctOptionIds.map((id) => idMap.get(id) ?? options[0].id),
  };
}

/**
 * Vùng soạn MỘT câu hỏi (khung bên phải của phần soạn trắc nghiệm).
 *
 * Ràng buộc lấy từ `questionIssues` (khớp schema backend) nên lỗi được báo ngay
 * tại trường tương ứng, không chỉ một dòng thông báo chung.
 */
export function QuizQuestionEditor({
  question,
  index,
  canRemove,
  canMoveUp,
  canMoveDown,
  onChange,
  onRemove,
  onDuplicate,
  onMoveUp,
  onMoveDown,
}: {
  question: QuizQuestion;
  index: number;
  canRemove: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (question: QuizQuestion) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  const issues = questionIssues(question);
  const promptInvalid = !question.prompt.trim();

  const updateOption = (optionId: string, text: string) =>
    onChange({
      ...question,
      options: question.options.map((option) =>
        option.id === optionId ? { ...option, text } : option,
      ),
    });

  const toggleCorrect = (optionId: string) => {
    if (!question.allowMultiple) {
      onChange({ ...question, correctOptionIds: [optionId] });
      return;
    }
    const isCorrect = question.correctOptionIds.includes(optionId);
    const next = isCorrect
      ? question.correctOptionIds.filter((id) => id !== optionId)
      : [...question.correctOptionIds, optionId];
    // Luôn giữ tối thiểu một đáp án đúng.
    onChange({ ...question, correctOptionIds: next.length ? next : [optionId] });
  };

  const setAllowMultiple = (allowMultiple: boolean) => {
    onChange({
      ...question,
      allowMultiple,
      correctOptionIds: allowMultiple
        ? question.correctOptionIds
        : question.correctOptionIds.slice(0, 1),
    });
  };

  const addOption = () => {
    if (question.options.length >= 12) return;
    onChange({ ...question, options: [...question.options, newOption()] });
  };

  const removeOption = (optionId: string) => {
    if (question.options.length <= 2) return;
    const options = question.options.filter((option) => option.id !== optionId);
    const correct = question.correctOptionIds.filter((id) => id !== optionId);
    onChange({
      ...question,
      options,
      correctOptionIds: correct.length ? correct : [options[0].id],
    });
  };

  return (
    <div className="rounded-[18px] border border-[#eeeee9] bg-[#fdfdfa] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-semibold text-black">
          <span className="flex size-6 items-center justify-center rounded-full bg-black text-[11px] font-semibold text-white tabular-nums">
            {index + 1}
          </span>
          Câu hỏi {index + 1}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!canMoveUp}
            onClick={onMoveUp}
            aria-label={`Chuyển câu hỏi ${index + 1} lên trên`}
            title="Đưa lên trên"
          >
            <Icon name="ri-arrow-up-s-line" className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!canMoveDown}
            onClick={onMoveDown}
            aria-label={`Chuyển câu hỏi ${index + 1} xuống dưới`}
            title="Đưa xuống dưới"
          >
            <Icon name="ri-arrow-down-s-line" className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onDuplicate}
            aria-label={`Nhân bản câu hỏi ${index + 1}`}
            title="Nhân bản câu hỏi"
          >
            <Icon name="ri-stack-line" className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!canRemove}
            onClick={onRemove}
            aria-label={`Xóa câu hỏi ${index + 1}`}
            title="Xóa câu hỏi"
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Icon name="ri-delete-bin-line" className="size-4" />
          </Button>
        </div>
      </div>

      {issues.length > 0 && (
        <ul className="mb-3 space-y-1 rounded-[14px] border border-warning/30 bg-warning/8 px-3 py-2 text-xs text-black/75">
          {issues.map((issue) => (
            <li key={issue} className="flex items-center gap-1.5">
              <Icon name="ri-error-warning-line" className="size-3.5 shrink-0 text-warning" />
              {issue}
            </li>
          ))}
        </ul>
      )}

      <Textarea
        value={question.prompt}
        onChange={(event) => onChange({ ...question, prompt: event.target.value })}
        placeholder="Nhập nội dung câu hỏi…"
        aria-label={`Nội dung câu hỏi ${index + 1}`}
        aria-invalid={promptInvalid}
        className="min-h-16"
      />

      <fieldset className="mt-4 space-y-2">
        <legend className="mb-1 flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-black">
            {question.allowMultiple ? "Tích vào các đáp án đúng" : "Chọn một đáp án đúng"}
          </span>
          <span className="flex rounded-full bg-black/5 p-0.5">
            <button
              type="button"
              onClick={() => setAllowMultiple(false)}
              aria-pressed={!question.allowMultiple}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                !question.allowMultiple
                  ? "bg-white text-black shadow-xs"
                  : "text-black/55 hover:text-black",
              )}
            >
              Một đáp án
            </button>
            <button
              type="button"
              onClick={() => setAllowMultiple(true)}
              aria-pressed={question.allowMultiple}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                question.allowMultiple
                  ? "bg-white text-black shadow-xs"
                  : "text-black/55 hover:text-black",
              )}
            >
              Nhiều đáp án
            </button>
          </span>
        </legend>

        {question.options.map((option, optionIndex) => {
          const correct = question.correctOptionIds.includes(option.id);
          const empty = !option.text.trim();
          return (
            <div
              key={option.id}
              className={cn(
                "flex items-center gap-2 rounded-2xl border p-2 transition",
                correct ? "border-[#6f8f69]/50 bg-[#e8f1e6]/60" : "border-black/10 bg-white",
                empty && "border-warning/40",
              )}
            >
              <label
                className="flex size-8 shrink-0 cursor-pointer items-center justify-center"
                aria-label={`Đáp án ${optionIndex + 1} ${correct ? "đang đúng" : "chưa đúng"}`}
              >
                <input
                  type={question.allowMultiple ? "checkbox" : "radio"}
                  name={question.allowMultiple ? undefined : `correct-${question.id}`}
                  checked={correct}
                  onChange={() => toggleCorrect(option.id)}
                  className="size-4 accent-[var(--primary)]"
                />
              </label>
              <Input
                value={option.text}
                onChange={(event) => updateOption(option.id, event.target.value)}
                placeholder={`Lựa chọn ${String.fromCharCode(65 + optionIndex)}`}
                aria-label={`Lựa chọn ${optionIndex + 1}`}
                aria-invalid={empty}
                className="h-9 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={question.options.length <= 2}
                onClick={() => removeOption(option.id)}
                aria-label={`Xóa lựa chọn ${optionIndex + 1}`}
                title="Xóa lựa chọn"
              >
                <Icon name="ri-close-line" />
              </Button>
            </div>
          );
        })}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="rounded-full"
          onClick={addOption}
          disabled={question.options.length >= 12}
        >
          <Icon name="ri-add-line" className="size-4" />
          Thêm lựa chọn
        </Button>
      </fieldset>

      <details className="mt-3 rounded-xl bg-black/5 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-black/65">
          Giải thích &amp; điểm (nâng cao)
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
          <Textarea
            value={question.explanation}
            onChange={(event) => onChange({ ...question, explanation: event.target.value })}
            placeholder="Giải thích vì sao đáp án đúng…"
            className="min-h-16"
            aria-label={`Giải thích câu hỏi ${index + 1}`}
          />
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor={`points-${question.id}`}>
              Điểm
            </label>
            <Input
              id={`points-${question.id}`}
              type="number"
              min={1}
              max={1000}
              step={1}
              value={question.points}
              onChange={(event) =>
                onChange({ ...question, points: Math.max(1, event.target.valueAsNumber || 1) })
              }
              className="h-9"
            />
          </div>
        </div>
      </details>
    </div>
  );
}
