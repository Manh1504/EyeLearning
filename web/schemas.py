from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator


class LessonOut(BaseModel):
    lesson_id: str
    lesson_title: str
    teacher_id: Optional[str]
    lesson_description: Optional[str]
    video_url: Optional[str]
    content_url: Optional[str]
    layout_version: str
    created_at: Optional[datetime]

    class Config:
        from_attributes = True


class SessionOut(BaseModel):
    session_id: str
    user_id: str
    lesson_id: Optional[str] = None
    course_id: Optional[str] = None
    course_item_id: Optional[str] = None
    pdf_lesson_id: Optional[str] = None
    pdf_document_version: Optional[str] = None
    test_id: Optional[str] = None
    module_id: Optional[str] = None
    activity_id: Optional[str] = None
    content_version_id: Optional[str] = None
    calibration_group_id: Optional[str]
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    last_heartbeat_at: Optional[datetime] = None
    is_fullscreen: Optional[bool]
    viewport_w: Optional[int]
    viewport_h: Optional[int]
    status: str
    session_type: Optional[str] = "student_learning"
    created_by_role: Optional[str] = None

    class Config:
        from_attributes = True


class AOIDefinitionOut(BaseModel):
    aoi_id: str
    lesson_id: str
    layout_version: str
    aoi_key: str
    aoi_name: str
    css_selector: str
    aoi_type: str
    is_learning_area: bool
    is_active: bool

    class Config:
        from_attributes = True


class TrackingPointCreate(BaseModel):
    session_id: str
    user_id: Optional[str] = None
    lesson_id: Optional[str] = None
    course_id: Optional[str] = None
    course_item_id: Optional[str] = None
    pdf_lesson_id: Optional[str] = None
    pdf_document_version: Optional[str] = None
    test_id: Optional[str] = None
    module_id: Optional[str] = None
    activity_id: Optional[str] = None
    content_version_id: Optional[str] = None
    stimulus_id: Optional[str] = None
    t: Optional[int] = None
    timestamp_ms: Optional[int] = None
    viewport_x: Optional[float] = None
    viewport_y: Optional[float] = None
    x: Optional[float] = None
    y: Optional[float] = None
    scroll_x: float = 0
    scroll_y: float = 0
    stimulus_x_norm: Optional[float] = None
    stimulus_y_norm: Optional[float] = None
    stimulus_left: Optional[float] = None
    stimulus_top: Optional[float] = None
    stimulus_width: Optional[float] = None
    stimulus_height: Optional[float] = None
    tracking_quality: Optional[str] = None
    screen_x: Optional[float] = None
    screen_y: Optional[float] = None
    viewport_width: Optional[int] = None
    viewport_height: Optional[int] = None
    page_number: Optional[int] = None
    page_x_normalized: Optional[float] = None
    page_y_normalized: Optional[float] = None
    page_display_width: Optional[float] = None
    page_display_height: Optional[float] = None
    device_pixel_ratio: Optional[float] = None
    zoom: Optional[float] = None
    fullscreen: Optional[bool] = None
    target_zone: Optional[str] = None
    conf: Optional[float] = None
    confidence: Optional[float] = None
    gaze_status: Optional[str] = None
    metadata_json: Optional[dict[str, Any]] = None

    @model_validator(mode="after")
    def validate_coordinates(self):
        if self.timestamp_ms is None:
            self.timestamp_ms = self.t
        if self.timestamp_ms is None:
            raise ValueError("timestamp_ms or fallback t is required")
        if self.confidence is None:
            self.confidence = self.conf
        if self.viewport_x is None and self.x is None:
            raise ValueError("viewport_x or fallback x is required")
        if self.viewport_y is None and self.y is None:
            raise ValueError("viewport_y or fallback y is required")
        return self


class TrackingPointBatchRequest(BaseModel):
    points: list[TrackingPointCreate] = Field(default_factory=list)


class TrackingPointOut(BaseModel):
    point_id: str
    session_id: str
    aoi_id: Optional[str]
    user_id: Optional[str] = None
    course_id: Optional[str] = None
    course_item_id: Optional[str] = None
    pdf_lesson_id: Optional[str] = None
    pdf_document_version: Optional[str] = None
    test_id: Optional[str] = None
    module_id: Optional[str] = None
    activity_id: Optional[str] = None
    content_version_id: Optional[str] = None
    stimulus_id: Optional[str] = None
    timestamp_ms: int
    viewport_x: float
    viewport_y: float
    scroll_x: float
    scroll_y: float
    page_number: Optional[int] = None
    page_x_normalized: Optional[float] = None
    page_y_normalized: Optional[float] = None
    page_display_width: Optional[float] = None
    page_display_height: Optional[float] = None
    confidence: Optional[float]
    gaze_status: Optional[str]
    metadata_json: Optional[dict[str, Any]]

    class Config:
        from_attributes = True


class TrackingPointBatchOut(BaseModel):
    inserted: int
    points: list[TrackingPointOut]


class AOIMetricOut(BaseModel):
    metric_id: str
    session_id: str
    aoi_id: str
    dwell_time_ms: int
    dwell_time_pct: float
    point_count: int
    first_hit_ms: Optional[int]
    revisit_count: int
    calculated_at: Optional[datetime]
    algorithm_version: str

    class Config:
        from_attributes = True


class AOIMetricWithAOIOut(BaseModel):
    aoi_id: str
    aoi_key: str
    aoi_name: str
    aoi_type: str
    is_learning_area: bool
    dwell_time_ms: int
    dwell_time_pct: float
    point_count: int
    first_hit_ms: Optional[int]
    revisit_count: int
    calculated_at: Optional[datetime]
    algorithm_version: str


class HeatmapCreate(BaseModel):
    session_id: str
    aoi_key: Optional[str] = None


class HeatmapResponse(BaseModel):
    heatmap_id: str
    session_id: str
    aoi_key: Optional[str]
    background_image_url: Optional[str]
    status: str
    error_message: Optional[str]
    cloudinary_public_id: Optional[str]
    image_url: Optional[str]
    image_url_thumbnail: Optional[str]
    point_count: int
    generated_at: Optional[datetime]
    metadata_json: Optional[dict[str, Any]]

    class Config:
        from_attributes = True


class HeatmapGenerateResponse(HeatmapResponse):
    pass


class PDFLessonSummaryOut(BaseModel):
    pdf_lesson_id: str
    storage_key: str
    pdf_url: str
    original_filename: str
    file_size: Optional[int] = None
    page_count: Optional[int] = None
    processing_status: str


class CourseItemOut(BaseModel):
    course_item_id: str
    course_id: str
    item_type: str
    title: str
    description: Optional[str] = None
    display_order: int
    is_enabled: bool
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    availability_label: str
    access_state: str
    pdf_lesson: Optional[PDFLessonSummaryOut] = None
    test: Optional[dict[str, Any]] = None
    progress_ratio: float = 0
    last_page_number: Optional[int] = None
    completed: bool = False
    action_label: str = "Mở"


class CourseOverviewOut(BaseModel):
    course_id: str
    course_title: str
    course_description: Optional[str] = None
    status: str
    progress_ratio: float = 0
    item_count: int = 0
    available_item_count: int = 0
    next_course_item_id: Optional[str] = None
    next_action_label: str = "Bắt đầu"
    items: list[CourseItemOut] = Field(default_factory=list)


class PDFLessonCreateOut(BaseModel):
    course_item: CourseItemOut


class PDFLessonProgressOut(BaseModel):
    pdf_lesson_id: str
    user_id: str
    last_page_number: int
    max_page_number_seen: int
    completed_at: Optional[datetime] = None
    progress_ratio: float = 0


class TeacherAttentionOut(BaseModel):
    key: str
    title: str
    detail: str
    severity: str = "info"


class TeacherRecentSessionOut(BaseModel):
    session_id: str
    user_id: str
    student_name: Optional[str] = None
    student_code: Optional[str] = None
    course_id: Optional[str] = None
    course_title: Optional[str] = None
    course_item_id: Optional[str] = None
    pdf_lesson_id: Optional[str] = None
    item_title: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    tracking_points_count: int = 0
    has_tracking_data: bool = False


class TeacherCourseCardOut(BaseModel):
    course_id: str
    course_title: str
    course_description: Optional[str] = None
    lesson_count: int = 0
    class_count: int = 0
    student_count: int = 0
    active_student_count: int = 0
    session_count: int = 0
    valid_tracking_session_rate: float = 0
    recent_activity_at: Optional[datetime] = None


class TeacherDashboardOut(BaseModel):
    course_count: int = 0
    class_count: int = 0
    student_count: int = 0
    session_count: int = 0
    valid_tracking_session_rate: float = 0
    courses: list[TeacherCourseCardOut] = Field(default_factory=list)
    classes: list[dict[str, Any]] = Field(default_factory=list)
    recent_sessions: list[TeacherRecentSessionOut] = Field(default_factory=list)
    attention_items: list[TeacherAttentionOut] = Field(default_factory=list)


class TeacherCourseSummaryOut(BaseModel):
    course_id: str
    course_title: str
    course_description: Optional[str] = None
    lesson_count: int = 0
    class_count: int = 0
    student_count: int = 0
    active_student_count: int = 0
    session_count: int = 0
    valid_tracking_session_rate: float = 0
    completed_lesson_count: int = 0
    recent_activity_at: Optional[datetime] = None
    recent_sessions: list[TeacherRecentSessionOut] = Field(default_factory=list)
    attention_items: list[TeacherAttentionOut] = Field(default_factory=list)


class TeacherPdfLessonAnalyticsRowOut(BaseModel):
    lesson_id: str
    lesson_title: str
    page_count: Optional[int] = None
    document_version: Optional[str] = None
    enrolled_student_count: Optional[int] = None
    students_started: int = 0
    students_completed: Optional[int] = None
    session_count: int = 0
    valid_session_count: int = 0
    valid_tracking_rate: Optional[float] = None
    average_session_duration_seconds: Optional[float] = None
    average_valid_gaze_time_seconds: Optional[float] = None
    total_valid_gaze_samples: int = 0
    pages_with_data: int = 0
    last_activity_at: Optional[datetime] = None


class TeacherCourseAnalyticsOut(BaseModel):
    course_id: str
    course_title: str
    total_sessions: int = 0
    students_with_activity: int = 0
    valid_tracking_rate: Optional[float] = None
    average_session_duration_seconds: Optional[float] = None
    lessons: list[TeacherPdfLessonAnalyticsRowOut] = Field(default_factory=list)
    recent_sessions: list[TeacherRecentSessionOut] = Field(default_factory=list)


class TeacherPdfLessonPageOut(BaseModel):
    page_number: int
    students_viewed: int = 0
    sessions_viewed: int = 0
    valid_gaze_samples: int = 0
    valid_gaze_time_seconds: Optional[float] = None
    average_valid_gaze_time_seconds: Optional[float] = None
    page_entry_count: int = 0
    revisit_count: int = 0
    tracking_quality: Optional[float] = None
    last_activity_at: Optional[datetime] = None


class TeacherPdfLessonAnalyticsOut(BaseModel):
    lesson_id: str
    course_id: str
    lesson_title: str
    document_version: Optional[str] = None
    page_count: Optional[int] = None
    students_started: int = 0
    session_count: int = 0
    valid_session_count: int = 0
    valid_tracking_rate: Optional[float] = None
    average_session_duration_seconds: Optional[float] = None
    total_valid_gaze_samples: int = 0
    pages_with_data: int = 0
    first_activity_at: Optional[datetime] = None
    last_activity_at: Optional[datetime] = None
    pages: list[TeacherPdfLessonPageOut] = Field(default_factory=list)
    sessions: list[dict[str, Any]] = Field(default_factory=list)


class TeacherPdfLessonHeatmapOut(BaseModel):
    course_id: str
    lesson_id: str
    lesson_title: str
    page_number: int
    document_version: Optional[str] = None
    page_count: Optional[int] = None
    pdf_url: Optional[str] = None
    included_students: int = 0
    included_sessions: int = 0
    valid_sample_count: int = 0
    confidence_threshold: float = 0
    tracking_quality: Optional[float] = None
    points: list[dict[str, Any]] = Field(default_factory=list)
