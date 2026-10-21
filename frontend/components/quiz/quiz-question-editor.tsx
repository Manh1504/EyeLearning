"use client";

import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
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

export function QuizQuestionEditor({
  question,
  index,
  canRemove,
  onChange,
  onRemove,
}: {
  question: QuizQuestion;
  index: number;
  canRemove: boolean;
  onChange: (question: QuizQuestion) => void;
  onRemove: () => void;
}) {
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
    const option = newOption();
    onChange({ ...question, options: [...question.options, option] });
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
    <div className="rounded-[18px] border border-border/80 bg-white p-4 shadow-xs">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
            {index + 1}
          </span>
          Câu hỏi
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={!canRemove}
          onClick={onRemove}
          aria-label={`Xóa câu hỏi ${index + 1}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Icon name="ri-delete-bin-line" className="size-4" />
        </Button>
      </div>

      <Textarea
        value={question.prompt}
        onChange={(event) => onChange({ ...question, prompt: event.target.value })}
        placeholder="Nhập nội dung câu hỏi..."
        className="min-h-16"
        aria-label={`Nội dung câu hỏi ${index + 1}`}
      />

      <fieldset className="mt-3 space-y-2">
        <legend className="mb-1 flex w-full flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{question.allowMultiple ? "Tích vào các đáp án đúng" : "Chọn một đáp án đúng"}</span>
          <span className="flex rounded-full bg-muted p-0.5">
            <button
              type="button"
              onClick={() => setAllowMultiple(false)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                !question.allowMultiple ? "bg-white text-foreground shadow-xs" : "text-muted-foreground",
              )}
            >
              Một đáp án
            </button>
            <button
              type="button"
              onClick={() => setAllowMultiple(true)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold transition",
                question.allowMultiple ? "bg-white text-foreground shadow-xs" : "text-muted-foreground",
              )}
            >
              Nhiều đáp án
            </button>
          </span>
        </legend>
        {question.options.map((option, optionIndex) => {
          const correct = question.correctOptionIds.includes(option.id);
          return (
            <div
              key={option.id}
              className={cn(
                "flex items-center gap-2 rounded-2xl border p-2 transition",
                correct ? "border-primary/35 bg-[#f2f7ef]" : "border-border/80 bg-white",
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
                className="h-9 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0"
                aria-label={`Lựa chọn ${optionIndex + 1}`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                disabled={question.options.length <= 2}
                onClick={() => removeOption(option.id)}
                aria-label={`Xóa lựa chọn ${optionIndex + 1}`}
              >
                <Icon name="ri-close-line" />
              </Button>
            </div>
          );
        })}
        <Button type="button" variant="ghost" size="sm" onClick={addOption}>
          <Icon name="ri-add-line" className="size-4" />
          Thêm lựa chọn
        </Button>
      </fieldset>

      <details className="mt-3 rounded-xl bg-muted/40 px-3 py-2">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Giải thích &amp; điểm (nâng cao)
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px]">
          <Textarea
            value={question.explanation}
            onChange={(event) => onChange({ ...question, explanation: event.target.value })}
            placeholder="Giải thích vì sao đáp án đúng..."
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
