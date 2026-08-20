from datetime import datetime

from pydantic import Field

from app.schemas.common import CamelModel


class CourseCreateIn(CamelModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    level: str | None = Field(default="beginner", pattern="^(beginner|intermediate|advanced)$")
    thumbnail_url: str | None = None
    status: str = Field(default="draft", pattern="^(draft|published|archived)$")


class CourseUpdateIn(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    level: str | None = Field(default=None, pattern="^(beginner|intermediate|advanced)$")
    thumbnail_url: str | None = None
    status: str | None = Field(default=None, pattern="^(draft|published|archived)$")


class ModuleCreateIn(CamelModel):
    title: str = Field(min_length=1, max_length=255)


class LessonCreateIn(CamelModel):
    title: str = Field(min_length=1, max_length=255)
    content_url: str | None = None


class SlideCreateIn(CamelModel):
    image_url: str
    title: str | None = None


class StudentsAddIn(CamelModel):
    student_ids: list[str]


class TeacherAssignIn(CamelModel):
    teacher_ids: list[str]


class TeacherDirectoryOut(CamelModel):
    id: str
    name: str
    code: str
    email: str | None = None
    department: str | None = None


class CourseTeacherOut(CamelModel):
    teacher_id: str
    name: str
    code: str
    email: str | None = None
    is_owner: bool = False


class StudentDirectoryOut(CamelModel):
    id: str
    name: str
    code: str
    email: str | None = None
    color: str


class LessonNodeOut(CamelModel):
    id: str
    title: str
    slides: int
    completion: float
    attention: float | None = None


class ModuleNodeOut(CamelModel):
    id: str
    title: str
    lessons: list[LessonNodeOut]


class TeacherCourseOut(CamelModel):
    id: str
    title: str
    description: str
    level: str
    gradient: str
    status: str
    students: int
    completion: float
    attention: float | None = None
    sessions: int
    updated_at: datetime
    is_owner: bool = True


class LessonItemOut(CamelModel):
    id: str
    title: str
    slide_count: int
    completed: bool


class ModuleItemOut(CamelModel):
    id: str
    order_index: int
    title: str
    lessons: list[LessonItemOut]


class CourseOutlineOut(CamelModel):
    id: str
    title: str
    modules: list[ModuleItemOut]


class CourseSummaryOut(CamelModel):
    id: str
    title: str
    level: str | None
    thumbnail_url: str | None
    teacher_name: str
    module_count: int
    lesson_count: int
    gradient: str


class EnrolledCourseOut(CamelModel):
    enrollment_id: str
    enrolled_at: datetime
    status: str
    progress: float
    course: CourseSummaryOut


class SlideOut(CamelModel):
    id: str
    title: str
    image_url: str | None = None


class StudentLessonOut(CamelModel):
    lesson_id: str
    viewed: int
    total: int
    attention: float | None = None


class StudentRowOut(CamelModel):
    id: str
    name: str
    code: str
    color: str
    progress: float
    attention: float | None = None
    last_active: str | None = None
    status: str
    lessons: list[StudentLessonOut]


class LearningStatsOut(CamelModel):
    streak_days: int
    week_study_minutes: int
