from datetime import datetime
from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.schemas.common import CamelModel


class QuizOption(CamelModel):
    id: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=1000)


class QuizQuestion(CamelModel):
    id: str = Field(min_length=1, max_length=100)
    prompt: str = Field(min_length=1, max_length=4000)
    options: list[QuizOption] = Field(min_length=2, max_length=12)
    # Một hoặc nhiều đáp án đúng. Chấm theo kiểu "tất cả hoặc không".
    correct_option_ids: list[str] = Field(min_length=1, max_length=12)
    allow_multiple: bool = False
    explanation: str = Field(default="", max_length=8000)
    points: int = Field(ge=1, le=1000)

    @model_validator(mode="after")
    def validate_options(self):
        option_ids = [option.id for option in self.options]
        if len(option_ids) != len(set(option_ids)):
            raise ValueError("ID lựa chọn trong một câu phải duy nhất")
        if len(self.correct_option_ids) != len(set(self.correct_option_ids)):
            raise ValueError("Đáp án đúng trong một câu phải duy nhất")
        if any(cid not in option_ids for cid in self.correct_option_ids):
            raise ValueError("Đáp án đúng phải thuộc danh sách lựa chọn")
        if not self.allow_multiple and len(self.correct_option_ids) > 1:
            raise ValueError("Câu một đáp án chỉ được có một đáp án đúng")
        return self


def _validate_unique_question_ids(questions: list[QuizQuestion]) -> None:
    ids = [question.id for question in questions]
    if len(ids) != len(set(ids)):
        raise ValueError("ID câu hỏi phải duy nhất")


class QuizAssignmentCreate(CamelModel):
    course_id: UUID
    lesson_id: UUID | None = None
    title: str = Field(min_length=1, max_length=255)
    instructions: str = Field(default="", max_length=8000)
    due_at: datetime | None = None
    duration_minutes: int = Field(ge=1, le=1440)
    status: str = Field(default="draft", pattern="^(draft|published)$")
    allow_retry: bool = False
    questions: list[QuizQuestion] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def validate_question_ids(self):
        _validate_unique_question_ids(self.questions)
        return self


class QuizItemCreate(CamelModel):
    """Tạo nhanh một item bài tập trong chương (nháp, chưa có câu hỏi).

    Câu hỏi được soạn sau qua PATCH /api/assignments/{id}.
    """

    title: str = Field(default="Bài tập mới", min_length=1, max_length=255)
    duration_minutes: int = Field(default=30, ge=1, le=1440)
    due_at: datetime | None = None
    after_id: UUID | None = None

    @model_validator(mode="after")
    def validate_title(self):
        self.title = self.title.strip() or "Bài tập mới"
        return self


class QuizAssignmentOut(CamelModel):
    id: str
    course_id: str
    course_title: str
    lesson_id: str | None = None
    lesson_title: str | None = None
    title: str
    instructions: str
    due_at: datetime | None = None
    duration_minutes: int
    status: str
    created_at: datetime
    expires_at: datetime | None = None
    allow_retry: bool = False
    questions: list[dict]


class QuizAssignmentUpdate(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    instructions: str | None = Field(default=None, max_length=8000)
    due_at: datetime | None = None
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)
    status: str | None = Field(default=None, pattern="^(draft|published|closed)$")
    allow_retry: bool | None = None
    questions: list[QuizQuestion] | None = Field(default=None, min_length=1, max_length=200)

    @model_validator(mode="after")
    def validate_question_ids(self):
        if self.questions is None:
            return self
        _validate_unique_question_ids(self.questions)
        return self


def _coerce_answers(value: object) -> object:
    """Chuẩn hóa đáp án về dict[str, list[str]] (hỗ trợ dữ liệu cũ dạng chuỗi)."""
    if not isinstance(value, dict):
        return value
    return {
        key: ([item] if isinstance(item, str) else list(item))
        for key, item in value.items()
    }


class QuizAttemptCreate(CamelModel):
    # Mỗi câu: danh sách id lựa chọn đã chọn (câu một đáp án → list 1 phần tử).
    answers: dict[str, list[str]] = Field(default_factory=dict)

    @field_validator("answers", mode="before")
    @classmethod
    def normalize_answers(cls, value: object) -> object:
        return _coerce_answers(value)


class QuizAttemptOut(CamelModel):
    id: str
    assignment_id: str
    answers: dict[str, list[str]]
    submitted_at: datetime
    score: int
    max_score: int

    @field_validator("answers", mode="before")
    @classmethod
    def normalize_answers(cls, value: object) -> object:
        return _coerce_answers(value)

