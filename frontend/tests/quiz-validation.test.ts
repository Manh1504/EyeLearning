import { describe, expect, it } from "vitest";
import {
  draftPayload,
  isQuestionBlank,
  isQuestionComplete,
  questionIssues,
  trimQuestion,
} from "@/lib/quiz-validation";
import type { QuizQuestion } from "@/lib/types/domain";

function makeQuestion(overrides: Partial<QuizQuestion> = {}): QuizQuestion {
  return {
    id: "q-1",
    prompt: "Câu hỏi mẫu?",
    options: [
      { id: "o-1", text: "Đáp án A" },
      { id: "o-2", text: "Đáp án B" },
    ],
    correctOptionIds: ["o-1"],
    allowMultiple: false,
    explanation: "",
    points: 1,
    ...overrides,
  };
}

describe("questionIssues", () => {
  it("không báo lỗi với câu hợp lệ", () => {
    expect(questionIssues(makeQuestion())).toEqual([]);
    expect(isQuestionComplete(makeQuestion())).toBe(true);
  });

  it("bắt từng trường còn thiếu", () => {
    expect(questionIssues(makeQuestion({ prompt: "   " }))).toContain("Chưa có nội dung câu hỏi");
    expect(
      questionIssues(makeQuestion({ options: [{ id: "o-1", text: "" }, { id: "o-2", text: "B" }] })),
    ).toContain("Có lựa chọn để trống");
    expect(questionIssues(makeQuestion({ correctOptionIds: [] }))).toContain(
      "Chưa chọn đáp án đúng",
    );
  });

  it("chặn nhiều đáp án đúng khi câu chỉ cho một đáp án", () => {
    const issues = questionIssues(makeQuestion({ correctOptionIds: ["o-1", "o-2"] }));
    expect(issues).toContain("Câu một đáp án chỉ được có một đáp án đúng");
    expect(
      isQuestionComplete(makeQuestion({ correctOptionIds: ["o-1", "o-2"], allowMultiple: true })),
    ).toBe(true);
  });
});

describe("draftPayload", () => {
  it("chỉ gửi câu hợp lệ và đếm số câu chưa lưu được", () => {
    const good = makeQuestion();
    const unfinished = makeQuestion({
      id: "q-2",
      prompt: "Câu đang soạn",
      options: [
        { id: "o-3", text: "" },
        { id: "o-4", text: "" },
      ],
    });
    const payload = draftPayload([good, unfinished]);
    expect(payload.questions).toHaveLength(1);
    expect(payload.questions[0].id).toBe("q-1");
    expect(payload.unsavedCount).toBe(1);
  });

  it("bỏ hẳn câu hoàn toàn trống (không làm hỏng bản nháp)", () => {
    const blank = makeQuestion({
      id: "q-3",
      prompt: "",
      options: [
        { id: "o-5", text: "" },
        { id: "o-6", text: "" },
      ],
    });
    expect(isQuestionBlank(blank)).toBe(true);
    const payload = draftPayload([makeQuestion(), blank]);
    expect(payload.questions).toHaveLength(1);
    expect(payload.unsavedCount).toBe(1);
  });
});

describe("trimQuestion", () => {
  it("cắt khoảng trắng trước khi gửi API", () => {
    const trimmed = trimQuestion(
      makeQuestion({
        prompt: "  Câu hỏi  ",
        explanation: "  vì  ",
        options: [
          { id: "o-1", text: " A " },
          { id: "o-2", text: "B " },
        ],
      }),
    );
    expect(trimmed.prompt).toBe("Câu hỏi");
    expect(trimmed.explanation).toBe("vì");
    expect(trimmed.options.map((option) => option.text)).toEqual(["A", "B"]);
  });
});
