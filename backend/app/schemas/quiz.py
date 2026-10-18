from datetime import datetime
from uuid import UUID

from pydantic import Field, model_validator

from app.schemas.common import CamelModel


class QuizOption(CamelModel):
    id: str = Field(min_length=1, max_length=100)
    text: str = Field(min_length=1, max_length=1000)


class QuizQuestion(CamelModel):
    id: str = Field(min_length=1, max_length=100)
    prompt: str = Field(min_length=1, max_length=4000)
    options: list[QuizOption] = Field(min_length=2, max_length=12)
    correct_option_id: str = Field(min_length=1, max_length=100)
    explanation: str = Field(min_length=1, max_length=8000)
    points: int = Field(ge=1, le=1000)

    @model_validator(mode="after")
    def validate_options(self):
        option_ids = [option.id for option in self.options]
        if len(option_ids) != len(set(option_ids)):
            raise ValueError("ID lựa chọn trong một câu phải duy nhất")
        if self.correct_option_id not in option_ids:
            raise ValueError("Đáp án đúng phải thuộc danh sách lựa chọn")
        return self


class QuizAssignmentCreate(CamelModel):
    course_id: UUID
    lesson_id: UUID | None = None
    title: str = Field(min_length=1, max_length=255)
    instructions: str = Field(default="", max_length=8000)
    due_at: datetime
    duration_minutes: int = Field(ge=1, le=1440)
    status: str = Field(default="draft", pattern="^(draft|published)$")
    questions: list[QuizQuestion] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def validate_question_ids(self):
        ids = [question.id for question in self.questions]
        if len(ids) != len(set(ids)):
            raise ValueError("ID câu hỏi phải duy nhất")
        return self


class QuizAssignmentOut(CamelModel):
    id: str
    course_id: str
    course_title: str
    lesson_id: str | None = None
    lesson_title: str | None = None
    title: str
    instructions: str
    due_at: datetime
    duration_minutes: int
    status: str
    created_at: datetime
    expires_at: datetime | None = None
    questions: list[dict]


class QuizAttemptCreate(CamelModel):
    answers: dict[str, str] = Field(default_factory=dict)


class QuizAttemptOut(CamelModel):
    id: str
    assignment_id: str
    answers: dict[str, str]
    submitted_at: datetime
    score: int
    max_score: int


class QuizChatIn(CamelModel):
    message: str = Field(min_length=1, max_length=4000)
    thread_id: str = Field(min_length=1, max_length=100)


class QuizCitationOut(CamelModel):
    document_id: str
    title: str
    location: str


class QuizChatOut(CamelModel):
    answer: str
    citations: list[QuizCitationOut] = Field(default_factory=list)
    intent: str | None = None
