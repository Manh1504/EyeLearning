from datetime import datetime

from pydantic import Field

from app.schemas.common import CamelModel


class CourseCreateIn(CamelModel):
    title: str = Field(min_length=1, max_length=255)
    description: str | None = None
    thumbnail_url: str | None = None
    status: str = Field(default="draft", pattern="^(draft|published|archived)$")
    # Hiển thị chấm điểm nhìn cho sinh viên (áp cho mọi bài giảng + bài tập).
    show_gaze_dot: bool = False


class CourseUpdateIn(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = None
    thumbnail_url: str | None = None
    status: str | None = Field(default=None, pattern="^(draft|published|archived)$")
    show_gaze_dot: bool | None = None


class ModuleCreateIn(CamelModel):
    title: str = Field(min_length=1, max_length=255)


class ModuleItemRef(CamelModel):
    kind: str = Field(pattern="^(lesson|quiz)$")
    id: str


class ModuleItemsReorderIn(CamelModel):
    items: list[ModuleItemRef] = Field(min_length=1)


class LessonCreateIn(CamelModel):
    title: str = Field(min_length=1, max_length=255)
    content_url: str | None = None


class LessonUpdateIn(CamelModel):
    title: str | None = Field(default=None, min_length=1, max_length=255)
    content_url: str | None = None


class CourseGazeDotIn(CamelModel):
    show_gaze_dot: bool


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
    kind: str = "lesson"  # 'lesson' | 'quiz'
    slides: int
    attention: float | None = None
    mastery: float | None = None
    quiz_id: str | None = None
    quiz_status: str | None = None
    question_count: int = 0
    duration_minutes: int | None = None
    due_at: datetime | None = None


class ModuleNodeOut(CamelModel):
    id: str
    title: str
    lessons: list[LessonNodeOut]


class TeacherCourseOut(CamelModel):
    id: str
    title: str
    description: str
    gradient: str
    status: str
    students: int
    attention: float | None = None
    sessions: int
    updated_at: datetime
    is_owner: bool = True
    lesson_count: int = 0
    show_gaze_dot: bool = False  # cờ cấp khóa: cho SV thấy chấm điểm nhìn


class LessonItemOut(CamelModel):
    id: str
    title: str
    kind: str = "lesson"  # 'lesson' | 'quiz'
    slide_count: int
    quiz_id: str | None = None
    quiz_status: str | None = None
    question_count: int = 0
    duration_minutes: int | None = None
    due_at: datetime | None = None


class ModuleItemOut(CamelModel):
    id: str
    order_index: int
    title: str
    lessons: list[LessonItemOut]


class CourseOutlineOut(CamelModel):
    id: str
    title: str
    modules: list[ModuleItemOut]
    # Cờ cấp khóa: SV thấy chấm điểm nhìn ở MỌI bài giảng và bài tập của khóa.
    show_gaze_dot: bool = False


class CourseSummaryOut(CamelModel):
    id: str
    title: str
    thumbnail_url: str | None
    teacher_name: str
    module_count: int
    lesson_count: int
    gradient: str


class EnrolledCourseOut(CamelModel):
    enrollment_id: str
    enrolled_at: datetime
    status: str
    course: CourseSummaryOut


class SlideOut(CamelModel):
    id: str
    title: str
    image_url: str | None = None


class SlideAdminOut(CamelModel):
    id: str
    order_index: int
    title: str
    image_url: str | None = None
    is_key: bool = False
    aoi_count: int = 0
    aoi_source: str = "none"
    embedding_status: str = "none"


class EmbeddingSyncOut(CamelModel):
    ready: int = 0
    failed: int = 0


class SlideKeyUpdateIn(CamelModel):
    is_key: bool


class SlideKeySetIn(CamelModel):
    order_indexes: list[int]


class StudentLessonOut(CamelModel):
    lesson_id: str
    attention: float | None = None
    mastery: float | None = None
    key_done: int = 0
    key_total: int = 0


class StudentRowOut(CamelModel):
    id: str
    name: str
    code: str
    color: str
    avatar_url: str | None = None
    attention: float | None = None
    last_active: str | None = None
    status: str
    lessons: list[StudentLessonOut]


class LearningStatsOut(CamelModel):
    streak_days: int
    week_study_minutes: int
