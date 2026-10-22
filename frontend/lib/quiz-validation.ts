// lib/quiz-validation.ts — ràng buộc của một câu hỏi trắc nghiệm, khớp đúng
// schema backend (backend/app/schemas/quiz.py):
//   prompt 1..4000 ký tự · 2..12 lựa chọn, mỗi lựa chọn 1..1000 ký tự ·
//   1..12 đáp án đúng (câu một đáp án chỉ được 1) · điểm 1..1000.
//
// Tách riêng để UI (báo lỗi tại chỗ) và luồng "lưu nháp" dùng chung một nguồn.

import type { QuizQuestion } from "@/lib/types/domain";

/** Vấn đề khiến câu hỏi KHÔNG thể lưu lên server. Rỗng = hợp lệ. */
export function questionIssues(question: QuizQuestion): string[] {
  const issues: string[] = [];
  if (!question.prompt.trim()) issues.push("Chưa có nội dung câu hỏi");
  if (question.options.length < 2) issues.push("Cần ít nhất 2 lựa chọn");
  if (question.options.some((option) => !option.text.trim())) issues.push("Có lựa chọn để trống");
  if (question.correctOptionIds.length === 0) issues.push("Chưa chọn đáp án đúng");
  if (!question.allowMultiple && question.correctOptionIds.length > 1)
    issues.push("Câu một đáp án chỉ được có một đáp án đúng");
  return issues;
}

export function isQuestionComplete(question: QuizQuestion): boolean {
  return questionIssues(question).length === 0;
}

/** Câu hoàn toàn trống (giáo viên vừa bấm "Thêm câu hỏi", chưa nhập gì). */
export function isQuestionBlank(question: QuizQuestion): boolean {
  return (
    !question.prompt.trim() &&
    !question.explanation.trim() &&
    question.options.every((option) => !option.text.trim())
  );
}

/** Cắt khoảng trắng thừa — dùng trước khi gửi API (backend cũng cắt lại). */
export function trimQuestion(question: QuizQuestion): QuizQuestion {
  return {
    ...question,
    prompt: question.prompt.trim(),
    explanation: question.explanation.trim(),
    options: question.options.map((option) => ({ ...option, text: option.text.trim() })),
  };
}

export interface DraftPayload {
  /** Chỉ các câu ĐÃ hợp lệ — đây là những gì được gửi lên server. */
  questions: QuizQuestion[];
  /** Số câu chưa lưu được (đang soạn dở, hoặc còn trống). */
  unsavedCount: number;
}

/**
 * Payload cho "Lưu bài tập nháp": bỏ qua câu còn dở thay vì chặn giáo viên.
 *
 * Lưu ý thật của schema: `PATCH /api/assignments/{id}` từ chối câu có lựa chọn
 * rỗng, nên câu dở KHÔNG thể lưu lên server — nó vẫn nằm trên màn hình và được
 * đếm vào `unsavedCount` để báo lại cho giáo viên.
 */
export function draftPayload(questions: QuizQuestion[]): DraftPayload {
  const valid = questions.map(trimQuestion).filter(isQuestionComplete);
  return { questions: valid, unsavedCount: questions.length - valid.length };
}
