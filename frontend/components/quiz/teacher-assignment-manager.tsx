"use client";

import { type FormEvent, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Icon } from "@/components/ui/icon";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useCreateQuizAssignment, useQuizAssignments } from "@/hooks/use-quiz";
import { useTeacherCourses } from "@/hooks/use-teacher";
import type {
  QuizAssignment,
  QuizAssignmentStatus,
  QuizQuestion,
} from "@/lib/types/domain";
import { cn } from "@/lib/utils";

type FormErrors = Record<string, string>;

const INITIAL_QUESTION: QuizQuestion = {
  id: "question-initial",
  prompt: "",
  options: [
    { id: "option-initial-a", text: "" },
    { id: "option-initial-b", text: "" },
  ],
  correctOptionId: "option-initial-a",
  explanation: "",
  points: 1,
};

const STATUS_LABEL: Record<QuizAssignmentStatus, string> = {
  draft: "Bản nháp",
  published: "Đã giao",
  closed: "Đã đóng",
};

function newId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function newQuestion(): QuizQuestion {
  const firstOptionId = newId("option");
  return {
    id: newId("question"),
    prompt: "",
    options: [
      { id: firstOptionId, text: "" },
      { id: newId("option"), text: "" },
    ],
    correctOptionId: firstOptionId,
    explanation: "",
    points: 1,
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function AssignmentRow({ assignment }: { assignment: QuizAssignment }) {
  const totalPoints = assignment.questions.reduce((sum, question) => sum + question.points, 0);
  const statusVariant = assignment.status === "published" ? "success" : assignment.status === "closed" ? "secondary" : "warning";

  return (
    <article className="group border-t border-border/80 py-4 first:border-t-0 first:pt-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">
            {assignment.title}
          </h3>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">{assignment.courseTitle}</p>
        </div>
        <Badge variant={statusVariant} className="shrink-0 text-[10px]">
          {STATUS_LABEL[assignment.status]}
        </Badge>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-muted/55 px-3 py-2.5 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Icon name="ri-calendar-line" className="size-3.5" />
          {formatDate(assignment.dueAt)}
        </span>
        <span className="text-right font-medium text-foreground">
          {assignment.questions.length} câu · {totalPoints} điểm
        </span>
      </div>
    </article>
  );
}

export function TeacherAssignmentManager() {
  const assignmentsQuery = useQuizAssignments();
  const coursesQuery = useTeacherCourses();
  const createAssignment = useCreateQuizAssignment();
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [instructions, setInstructions] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(30);
  const [status, setStatus] = useState<Extract<QuizAssignmentStatus, "draft" | "published">>("draft");
  const [questions, setQuestions] = useState<QuizQuestion[]>([{ ...INITIAL_QUESTION, options: INITIAL_QUESTION.options.map((option) => ({ ...option })) }]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [successMessage, setSuccessMessage] = useState("");

  const updateQuestion = (questionIndex: number, update: Partial<QuizQuestion>) => {
    setQuestions((current) => current.map((question, index) => index === questionIndex ? { ...question, ...update } : question));
  };

  const updateOption = (questionIndex: number, optionIndex: number, text: string) => {
    setQuestions((current) => current.map((question, index) => index === questionIndex ? {
      ...question,
      options: question.options.map((option, currentOptionIndex) => currentOptionIndex === optionIndex ? { ...option, text } : option),
    } : question));
  };

  const addOption = (questionIndex: number) => {
    setQuestions((current) => current.map((question, index) => index === questionIndex ? {
      ...question,
      options: [...question.options, { id: newId("option"), text: "" }],
    } : question));
  };

  const removeOption = (questionIndex: number, optionIndex: number) => {
    setQuestions((current) => current.map((question, index) => {
      if (index !== questionIndex || question.options.length <= 2) return question;
      const removed = question.options[optionIndex];
      const options = question.options.filter((_, currentOptionIndex) => currentOptionIndex !== optionIndex);
      return {
        ...question,
        options,
        correctOptionId: removed.id === question.correctOptionId ? options[0].id : question.correctOptionId,
      };
    }));
  };

  const validate = () => {
    const nextErrors: FormErrors = {};
    if (!title.trim()) nextErrors.title = "Nhập tiêu đề bài kiểm tra.";
    if (!courseId) nextErrors.courseId = "Chọn khóa học nhận bài.";
    if (!instructions.trim()) nextErrors.instructions = "Thêm hướng dẫn làm bài.";
    if (!dueAt || Number.isNaN(new Date(dueAt).getTime())) nextErrors.dueAt = "Chọn hạn nộp hợp lệ.";
    if (!Number.isFinite(durationMinutes) || durationMinutes < 1) nextErrors.durationMinutes = "Thời lượng phải từ 1 phút.";
    if (!questions.length) nextErrors.questions = "Thêm ít nhất một câu hỏi.";

    questions.forEach((question, questionIndex) => {
      if (!question.prompt.trim()) nextErrors[`question-${questionIndex}`] = "Nhập nội dung câu hỏi.";
      if (question.options.length < 2) nextErrors[`options-${questionIndex}`] = "Mỗi câu cần ít nhất 2 lựa chọn.";
      if (question.options.some((option) => !option.text.trim())) nextErrors[`options-${questionIndex}`] = "Điền đầy đủ các lựa chọn.";
      if (!question.options.some((option) => option.id === question.correctOptionId)) nextErrors[`correct-${questionIndex}`] = "Chọn một đáp án đúng.";
      if (!question.explanation.trim()) nextErrors[`explanation-${questionIndex}`] = "Thêm giải thích cho đáp án.";
      if (!Number.isFinite(question.points) || question.points < 1) nextErrors[`points-${questionIndex}`] = "Điểm phải từ 1.";
    });

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const resetForm = () => {
    const question = newQuestion();
    setTitle("");
    setCourseId("");
    setInstructions("");
    setDueAt("");
    setDurationMinutes(30);
    setStatus("draft");
    setQuestions([question]);
    setErrors({});
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessMessage("");
    if (!validate()) return;

    const course = coursesQuery.data?.find((item) => item.id === courseId);
    if (!course) {
      setErrors((current) => ({ ...current, courseId: "Khóa học không còn khả dụng." }));
      return;
    }

    try {
      const created = await createAssignment.mutateAsync({
        title: title.trim(),
        courseId,
        courseTitle: course.title,
        instructions: instructions.trim(),
        dueAt: new Date(dueAt).toISOString(),
        durationMinutes,
        status,
        questions: questions.map((question) => ({
          ...question,
          prompt: question.prompt.trim(),
          explanation: question.explanation.trim(),
          options: question.options.map((option) => ({ ...option, text: option.text.trim() })),
        })),
      });
      resetForm();
      setSuccessMessage(`Đã tạo “${created.title}” ${created.status === "published" ? "và giao cho học viên" : "dưới dạng bản nháp"}.`);
    } catch {
      // Mutation state renders the adapter error below the form header.
    }
  };

  const publishedCount = assignmentsQuery.data?.filter((assignment) => assignment.status === "published").length ?? 0;
  const totalQuestions = questions.length;
  const totalPoints = questions.reduce((sum, question) => sum + (Number.isFinite(question.points) ? question.points : 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-[18px] border border-border/80 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tổng bài giao</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{assignmentsQuery.data?.length ?? 0}</p>
        </div>
        <div className="rounded-[18px] border border-border/80 bg-[#e8f1e6] p-4 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Đang mở</p>
          <p className="mt-2 text-3xl font-semibold tracking-[-0.05em]">{publishedCount}</p>
        </div>
        <div className="rounded-[18px] border border-border/80 bg-white p-4 shadow-xs">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Đang soạn</p>
          <p className="mt-2 text-sm font-semibold">{totalQuestions} câu · {totalPoints} điểm</p>
        </div>
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card className="p-5 xl:sticky xl:top-5">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Bài đã tạo</h2>
              <p className="mt-1 text-xs text-muted-foreground">Theo dõi nhanh trạng thái và hạn nộp.</p>
            </div>
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
              <Icon name="ri-list-check-3" className="size-4 text-muted-foreground" />
            </span>
          </div>

          {assignmentsQuery.isLoading ? (
            <div className="space-y-3"><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /><Skeleton className="h-24 rounded-xl" /></div>
          ) : assignmentsQuery.isError ? (
            <ErrorState title="Không tải được bài đã giao" description="Vui lòng thử tải lại danh sách." onRetry={() => assignmentsQuery.refetch()} />
          ) : assignmentsQuery.data?.length ? (
            <div className="max-h-[680px] overflow-y-auto pr-1">
              {assignmentsQuery.data.map((assignment) => <AssignmentRow key={assignment.id} assignment={assignment} />)}
            </div>
          ) : (
            <EmptyState className="border-0 bg-muted/45 px-4 py-10 shadow-none" icon="ri-file-text-line" title="Chưa có bài kiểm tra" description="Bài bạn tạo sẽ xuất hiện tại đây." />
          )}
        </Card>

        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <Card className="overflow-hidden">
            <div className="border-b border-border/80 bg-[#fbfbf8] px-5 py-5 sm:px-7">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-primary">
                    <span className="h-px w-6 bg-primary/50" /> Trình tạo bài kiểm tra
                  </div>
                  <h2 className="font-display text-2xl text-foreground">Thiết lập bài giao mới</h2>
                  <p className="mt-1.5 max-w-xl text-xs leading-5 text-muted-foreground">Soạn câu hỏi, đáp án và phản hồi để học viên hiểu ngay sau khi hoàn thành.</p>
                </div>
                <div className="flex rounded-full bg-muted p-1" aria-label="Trạng thái bài giao">
                  {(["draft", "published"] as const).map((item) => (
                    <button key={item} type="button" onClick={() => setStatus(item)} className={cn("rounded-full px-3 py-1.5 text-[11px] font-semibold transition", status === item ? "bg-white text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground")}>
                      {item === "draft" ? "Bản nháp" : "Giao ngay"}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-5 p-5 sm:p-7">
              {successMessage && <Alert variant="success" title="Tạo bài thành công">{successMessage}</Alert>}
              {createAssignment.isError && <Alert variant="destructive" title="Chưa thể tạo bài">Đã có lỗi khi lưu bài kiểm tra. Vui lòng thử lại.</Alert>}
              {Object.keys(errors).length > 0 && <Alert variant="warning" title="Cần bổ sung thông tin">Kiểm tra các trường được đánh dấu bên dưới trước khi lưu.</Alert>}

              <div className="grid gap-5 md:grid-cols-2">
                <Field label="Tiêu đề" htmlFor="assignment-title" error={errors.title} className="md:col-span-2">
                  <Input id="assignment-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Kiểm tra cuối chương 2" aria-invalid={Boolean(errors.title)} />
                </Field>
                <Field label="Khóa học" error={errors.courseId}>
                  <Select value={courseId} onValueChange={setCourseId} disabled={coursesQuery.isLoading || coursesQuery.isError}>
                    <SelectTrigger aria-invalid={Boolean(errors.courseId)}><SelectValue placeholder={coursesQuery.isLoading ? "Đang tải khóa học..." : "Chọn khóa học"} /></SelectTrigger>
                    <SelectContent>{coursesQuery.data?.map((course) => <SelectItem key={course.id} value={course.id}>{course.title}</SelectItem>)}</SelectContent>
                  </Select>
                  {coursesQuery.isError && <button type="button" onClick={() => coursesQuery.refetch()} className="text-left text-xs font-medium text-destructive underline underline-offset-2">Không tải được khóa học. Thử lại</button>}
                </Field>
                <Field label="Hạn nộp" htmlFor="assignment-due" error={errors.dueAt}>
                  <Input id="assignment-due" type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} aria-invalid={Boolean(errors.dueAt)} />
                </Field>
                <Field label="Thời lượng (phút)" htmlFor="assignment-duration" error={errors.durationMinutes}>
                  <Input id="assignment-duration" type="number" min={1} step={1} value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.valueAsNumber)} aria-invalid={Boolean(errors.durationMinutes)} />
                </Field>
                <Field label="Hướng dẫn làm bài" htmlFor="assignment-instructions" error={errors.instructions} className="md:col-span-2">
                  <Textarea id="assignment-instructions" value={instructions} onChange={(event) => setInstructions(event.target.value)} placeholder="Nêu yêu cầu, quy tắc và những điều học viên cần lưu ý..." className="min-h-24" aria-invalid={Boolean(errors.instructions)} />
                </Field>
              </div>
            </div>
          </Card>

          <div className="flex items-end justify-between gap-4 px-1">
            <div><h2 className="text-lg font-semibold">Bộ câu hỏi</h2><p className="mt-1 text-xs text-muted-foreground">Chọn một đáp án đúng cho mỗi câu.</p></div>
            <Badge variant="outline">{totalQuestions} câu · {totalPoints} điểm</Badge>
          </div>
          {errors.questions && <p className="text-xs text-destructive">{errors.questions}</p>}

          {questions.map((question, questionIndex) => (
            <Card key={question.id} className="overflow-hidden">
              <div className="flex items-center justify-between border-b border-border/80 bg-muted/30 px-5 py-3 sm:px-7">
                <div className="flex items-center gap-3"><span className="flex size-7 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{questionIndex + 1}</span><span className="text-xs font-semibold">Câu hỏi {String(questionIndex + 1).padStart(2, "0")}</span></div>
                <Button type="button" variant="ghost" size="icon-xs" disabled={questions.length === 1} onClick={() => setQuestions((current) => current.filter((_, index) => index !== questionIndex))} aria-label={`Xóa câu hỏi ${questionIndex + 1}`}><Icon name="ri-delete-bin-line" /></Button>
              </div>
              <div className="space-y-6 p-5 sm:p-7">
                <Field label="Nội dung câu hỏi" htmlFor={`question-${question.id}`} error={errors[`question-${questionIndex}`]}>
                  <Textarea id={`question-${question.id}`} value={question.prompt} onChange={(event) => updateQuestion(questionIndex, { prompt: event.target.value })} placeholder="Nhập câu hỏi rõ ràng, chỉ có một đáp án đúng..." aria-invalid={Boolean(errors[`question-${questionIndex}`])} />
                </Field>

                <fieldset className="space-y-3">
                  <div className="flex items-center justify-between"><legend className="text-sm font-medium">Các lựa chọn</legend><span className="text-[10px] text-muted-foreground">Chọn vòng tròn cho đáp án đúng</span></div>
                  {question.options.map((option, optionIndex) => (
                    <div key={option.id} className={cn("flex items-center gap-2 rounded-2xl border p-2 transition", question.correctOptionId === option.id ? "border-primary/35 bg-[#f2f7ef]" : "border-border/80 bg-white")}>
                      <label className="flex size-8 shrink-0 cursor-pointer items-center justify-center" aria-label={`Chọn đáp án ${optionIndex + 1} là đáp án đúng`}>
                        <input type="radio" name={`correct-${question.id}`} checked={question.correctOptionId === option.id} onChange={() => updateQuestion(questionIndex, { correctOptionId: option.id })} className="size-4 accent-[var(--primary)]" />
                      </label>
                      <Input value={option.text} onChange={(event) => updateOption(questionIndex, optionIndex, event.target.value)} placeholder={`Lựa chọn ${String.fromCharCode(65 + optionIndex)}`} className="h-9 flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0" aria-invalid={Boolean(errors[`options-${questionIndex}`])} />
                      <Button type="button" variant="ghost" size="icon-xs" disabled={question.options.length <= 2} onClick={() => removeOption(questionIndex, optionIndex)} aria-label={`Xóa lựa chọn ${optionIndex + 1}`}><Icon name="ri-close-line" /></Button>
                    </div>
                  ))}
                  {errors[`options-${questionIndex}`] && <p className="text-xs text-destructive">{errors[`options-${questionIndex}`]}</p>}
                  {errors[`correct-${questionIndex}`] && <p className="text-xs text-destructive">{errors[`correct-${questionIndex}`]}</p>}
                  <Button type="button" variant="ghost" size="sm" onClick={() => addOption(questionIndex)}><Icon name="ri-add-line" />Thêm lựa chọn</Button>
                </fieldset>

                <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_120px]">
                  <Field label="Giải thích đáp án" htmlFor={`explanation-${question.id}`} error={errors[`explanation-${questionIndex}`]}>
                    <Textarea id={`explanation-${question.id}`} value={question.explanation} onChange={(event) => updateQuestion(questionIndex, { explanation: event.target.value })} placeholder="Giải thích ngắn gọn vì sao đáp án này đúng..." aria-invalid={Boolean(errors[`explanation-${questionIndex}`])} />
                  </Field>
                  <Field label="Điểm" htmlFor={`points-${question.id}`} error={errors[`points-${questionIndex}`]}>
                    <Input id={`points-${question.id}`} type="number" min={1} step={1} value={question.points} onChange={(event) => updateQuestion(questionIndex, { points: event.target.valueAsNumber })} aria-invalid={Boolean(errors[`points-${questionIndex}`])} />
                  </Field>
                </div>
              </div>
            </Card>
          ))}

          <Button type="button" variant="outline" className="w-full border-dashed bg-transparent" onClick={() => setQuestions((current) => [...current, newQuestion()])}><Icon name="ri-add-line" />Thêm câu hỏi</Button>

          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div><p className="text-sm font-semibold">Sẵn sàng lưu bài?</p><p className="mt-1 text-xs text-muted-foreground">{status === "published" ? "Học viên sẽ thấy bài ngay sau khi tạo." : "Bạn có thể tiếp tục hoàn thiện bản nháp sau."}</p></div>
            <Button type="submit" size="lg" disabled={createAssignment.isPending || coursesQuery.isLoading} className="w-full sm:w-auto">{createAssignment.isPending ? <><Icon name="ri-loader-4-line" className="animate-spin" />Đang tạo...</> : <><Icon name={status === "published" ? "ri-rocket-2-line" : "ri-file-text-line"} />{status === "published" ? "Tạo và giao bài" : "Lưu bản nháp"}</>}</Button>
          </Card>
        </form>
      </div>
    </div>
  );
}

function Field({ label, htmlFor, error, className, children }: { label: string; htmlFor?: string; error?: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("space-y-2", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
