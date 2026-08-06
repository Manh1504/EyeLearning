from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from web.database import Base


class User(Base):
    __tablename__ = "users"

    user_id = Column(Text, primary_key=True)
    role = Column(Text)
    full_name = Column(Text)
    student_code = Column(Text, unique=True)
    email = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    password_hash = Column(Text)
    is_active = Column(Boolean, nullable=False, server_default="true")

    sessions = relationship("Session", back_populates="user")
    calibration_profiles = relationship("CalibrationProfile", back_populates="user")
    lessons = relationship("Lesson", back_populates="teacher")


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    session_id = Column(Text, primary_key=True)
    user_id = Column(Text, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(Text, nullable=False, unique=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    revoked_at = Column(DateTime(timezone=True))
    user_agent = Column(Text)

    user = relationship("User")


class Course(Base):
    __tablename__ = "courses"

    course_id = Column(Text, primary_key=True)
    course_title = Column(Text, nullable=False)
    course_description = Column(Text)
    status = Column(Text, nullable=False, server_default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CourseItem(Base):
    __tablename__ = "course_items"

    course_item_id = Column(Text, primary_key=True)
    course_id = Column(Text, ForeignKey("courses.course_id", ondelete="CASCADE"), nullable=False)
    item_type = Column(Text, nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text)
    display_order = Column(Integer, nullable=False, default=1)
    is_enabled = Column(Boolean, nullable=False, server_default="true")
    available_from = Column(DateTime(timezone=True))
    available_until = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PDFLesson(Base):
    __tablename__ = "pdf_lessons"

    pdf_lesson_id = Column(Text, primary_key=True)
    course_item_id = Column(Text, ForeignKey("course_items.course_item_id", ondelete="CASCADE"), nullable=False, unique=True)
    storage_key = Column(Text, nullable=False, unique=True)
    pdf_url = Column(Text)
    original_filename = Column(Text, nullable=False)
    file_size = Column(BigInteger)
    page_count = Column(Integer)
    processing_status = Column(Text, nullable=False, server_default="READY")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Test(Base):
    __tablename__ = "tests"

    test_id = Column(Text, primary_key=True)
    course_item_id = Column(Text, ForeignKey("course_items.course_item_id", ondelete="CASCADE"), nullable=False, unique=True)
    question_count = Column(Integer, nullable=False, server_default="0")
    config_json = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class PDFLessonProgress(Base):
    __tablename__ = "pdf_lesson_progress"

    progress_id = Column(Text, primary_key=True)
    user_id = Column(Text, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    course_id = Column(Text, ForeignKey("courses.course_id", ondelete="CASCADE"), nullable=False)
    course_item_id = Column(Text, ForeignKey("course_items.course_item_id", ondelete="CASCADE"), nullable=False)
    pdf_lesson_id = Column(Text, ForeignKey("pdf_lessons.pdf_lesson_id", ondelete="CASCADE"), nullable=False)
    last_page_number = Column(Integer, nullable=False, server_default="1")
    max_page_number_seen = Column(Integer, nullable=False, server_default="1")
    completed_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "pdf_lesson_id", name="uq_pdf_lesson_progress_user_lesson"),
    )


class CourseModule(Base):
    __tablename__ = "course_modules"

    module_id = Column(Text, primary_key=True)
    course_id = Column(Text, ForeignKey("courses.course_id", ondelete="CASCADE"), nullable=False)
    module_title = Column(Text, nullable=False)
    module_description = Column(Text)
    order_index = Column(Integer, nullable=False, default=1)
    estimated_duration_min = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Lesson(Base):
    __tablename__ = "lessons"

    lesson_id = Column(Text, primary_key=True)
    course_id = Column(Text, ForeignKey("courses.course_id", ondelete="SET NULL"))
    module_id = Column(Text, ForeignKey("course_modules.module_id", ondelete="SET NULL"))
    lesson_title = Column(Text, nullable=False)
    teacher_id = Column(Text, ForeignKey("users.user_id", ondelete="SET NULL"))
    lesson_description = Column(Text)
    video_url = Column(Text)
    content_url = Column(Text)
    layout_version = Column(Text, nullable=False)
    order_index = Column(Integer, nullable=False, default=1)
    estimated_duration_min = Column(Integer)
    learning_objectives = Column(JSONB)
    published_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    teacher = relationship("User", back_populates="lessons")
    sessions = relationship("Session", back_populates="lesson")
    aoi_definitions = relationship("AOIDefinition", back_populates="lesson")


class ContentVersion(Base):
    __tablename__ = "content_versions"

    content_version_id = Column(Text, primary_key=True)
    lesson_id = Column(Text, ForeignKey("lessons.lesson_id", ondelete="CASCADE"), nullable=False)
    version_label = Column(Text, nullable=False, default="v1")
    version_number = Column(Integer, nullable=False, default=1)
    status = Column(Text, nullable=False, default="published")
    source_type = Column(Text, nullable=False, default="legacy")
    source_url = Column(Text)
    source_filename = Column(Text)
    semantic_extraction_status = Column(Text, nullable=False, default="not_started")
    metadata_json = Column(JSONB)
    published_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class LessonActivity(Base):
    __tablename__ = "lesson_activities"

    activity_id = Column(Text, primary_key=True)
    lesson_id = Column(Text, ForeignKey("lessons.lesson_id", ondelete="CASCADE"), nullable=False)
    activity_type = Column(Text, nullable=False)
    title = Column(Text, nullable=False)
    description = Column(Text)
    order_index = Column(Integer, nullable=False, default=1)
    estimated_duration_min = Column(Integer)
    tracking_enabled = Column(Boolean, nullable=False, default=True)
    tracking_mode = Column(Text, nullable=False, default="gaze")
    content_version_id = Column(Text, ForeignKey("content_versions.content_version_id", ondelete="SET NULL"))
    published_at = Column(DateTime(timezone=True))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    metadata_json = Column(JSONB)


class ContentStimulus(Base):
    __tablename__ = "content_stimuli"

    stimulus_id = Column(Text, primary_key=True)
    activity_id = Column(Text, ForeignKey("lesson_activities.activity_id", ondelete="CASCADE"), nullable=False)
    content_version_id = Column(Text, ForeignKey("content_versions.content_version_id", ondelete="SET NULL"))
    stimulus_type = Column(Text, nullable=False)
    title = Column(Text, nullable=False)
    order_index = Column(Integer, nullable=False, default=1)
    visual_url = Column(Text)
    width = Column(Integer)
    height = Column(Integer)
    notes = Column(Text)
    tracking_enabled = Column(Boolean, nullable=False, default=True)
    metadata_json = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class StimulusElement(Base):
    __tablename__ = "stimulus_elements"

    element_id = Column(Text, primary_key=True)
    stimulus_id = Column(Text, ForeignKey("content_stimuli.stimulus_id", ondelete="CASCADE"), nullable=False)
    element_type = Column(Text, nullable=False)
    text_content = Column(Text)
    x_normalized = Column(Float)
    y_normalized = Column(Float)
    width_normalized = Column(Float)
    height_normalized = Column(Float)
    reading_order = Column(Integer)
    semantic_label = Column(Text)
    source_element_id = Column(Text)
    metadata_json = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class ContentImport(Base):
    __tablename__ = "content_imports"

    import_id = Column(Text, primary_key=True)
    course_id = Column(Text, ForeignKey("courses.course_id", ondelete="CASCADE"), nullable=False)
    lesson_id = Column(Text, ForeignKey("lessons.lesson_id", ondelete="SET NULL"))
    uploaded_by = Column(Text, ForeignKey("users.user_id", ondelete="SET NULL"))
    source_filename = Column(Text, nullable=False)
    source_mime_type = Column(Text)
    source_size_bytes = Column(BigInteger)
    status = Column(Text, nullable=False, default="uploaded")
    adapter_key = Column(Text)
    error_message = Column(Text)
    metadata_json = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class TeacherCourseAssignment(Base):
    __tablename__ = "teacher_course_assignments"

    teacher_id = Column(Text, ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True)
    course_id = Column(Text, ForeignKey("courses.course_id", ondelete="CASCADE"), primary_key=True)
    assigned_by = Column(Text, ForeignKey("users.user_id", ondelete="SET NULL"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CourseEnrollment(Base):
    __tablename__ = "course_enrollments"

    student_id = Column(Text, ForeignKey("users.user_id", ondelete="CASCADE"), primary_key=True)
    course_id = Column(Text, ForeignKey("courses.course_id", ondelete="CASCADE"), primary_key=True)
    enrolled_by = Column(Text, ForeignKey("users.user_id", ondelete="SET NULL"))
    status = Column(Text, nullable=False, server_default="active")
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CalibrationProfile(Base):
    __tablename__ = "calibration_profiles"

    calibration_id       = Column(Text, primary_key=True)
    calibration_group_id = Column(Text, nullable=False)
    user_id              = Column(Text, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)

    checkpoint_name = Column(Text, nullable=False)
    checkpoint_x    = Column(Float, nullable=False)
    checkpoint_y    = Column(Float, nullable=False)
    pitch           = Column(Float, nullable=False)
    yaw             = Column(Float, nullable=False)

    is_fullscreen = Column(Boolean, nullable=False)
    viewport_h    = Column(Integer, nullable=False)
    viewport_w    = Column(Integer, nullable=False)

    avg_error_px       = Column(Float)
    n_points           = Column(Integer, nullable=False, server_default="9")
    status              = Column(Text, nullable=False, server_default="active")
    trained_at          = Column(DateTime(timezone=True), server_default=func.now())
    expires_at          = Column(DateTime(timezone=True))
    is_micro            = Column(Boolean, nullable=False, server_default="false")
    device_fingerprint  = Column(Text)
    model_storage_url   = Column(Text)
    model_format        = Column(Text, server_default="joblib")
    profile_name        = Column(Text)
    model_version       = Column(Text, nullable=False, server_default="svr:v1")
    environment_json    = Column(JSONB)
    artifact_status     = Column(Text, nullable=False, server_default="available")
    is_default          = Column(Boolean, nullable=False, server_default="false")
    last_used_at        = Column(DateTime(timezone=True))
    browser_label       = Column(Text)
    last_validation_at  = Column(DateTime(timezone=True))
    last_validation_status = Column(Text)
    updated_at          = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User", back_populates="calibration_profiles")


class CalibrationValidationRun(Base):
    __tablename__ = "calibration_validation_runs"

    validation_id = Column(Text, primary_key=True)
    calibration_group_id = Column(Text, nullable=False)
    user_id = Column(Text, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    session_id = Column(Text, ForeignKey("sessions.session_id", ondelete="SET NULL"))
    status = Column(Text, nullable=False)
    sample_count = Column(Integer, nullable=False, server_default="0")
    valid_sample_count = Column(Integer, nullable=False, server_default="0")
    valid_sample_ratio = Column(Float)
    median_error_norm = Column(Float)
    max_error_norm = Column(Float)
    environment_json = Column(JSONB)
    result_json = Column(JSONB)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Session(Base):
    __tablename__ = "sessions"

    session_id = Column(Text, primary_key=True)
    user_id = Column(Text, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    lesson_id = Column(Text, ForeignKey("lessons.lesson_id", ondelete="CASCADE"))
    course_id = Column(Text, ForeignKey("courses.course_id", ondelete="SET NULL"))
    course_item_id = Column(Text, ForeignKey("course_items.course_item_id", ondelete="SET NULL"))
    pdf_lesson_id = Column(Text, ForeignKey("pdf_lessons.pdf_lesson_id", ondelete="SET NULL"))
    pdf_document_version = Column(Text)
    test_id = Column(Text, ForeignKey("tests.test_id", ondelete="SET NULL"))
    module_id = Column(Text, ForeignKey("course_modules.module_id", ondelete="SET NULL"))
    activity_id = Column(Text, ForeignKey("lesson_activities.activity_id", ondelete="SET NULL"))
    content_version_id = Column(Text, ForeignKey("content_versions.content_version_id", ondelete="SET NULL"))
    # KHÔNG FK cứng — calibration_group_id không phải PK của calibration_profiles
    # (1 group gồm 9 row checkpoint). Validate tồn tại ở tầng application
    # (routers/calibration.py), không phải ở constraint DB.
    calibration_group_id = Column(Text)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True))
    last_heartbeat_at = Column(DateTime(timezone=True))
    is_fullscreen = Column(Boolean)
    viewport_w = Column(Integer)
    viewport_h = Column(Integer)
    status = Column(Text, nullable=False, server_default="preparing")
    session_type = Column(Text, nullable=False, server_default="student_learning")
    created_by_role = Column(Text)

    user = relationship("User", back_populates="sessions")
    lesson = relationship("Lesson", back_populates="sessions")
    tracking_points = relationship("TrackingPoint", back_populates="session")
    aoi_metrics = relationship("AOIMetric", back_populates="session")
    heatmaps = relationship("Heatmap", back_populates="session")


class AOIDefinition(Base):
    __tablename__ = "aoi_definitions"

    aoi_id = Column(Text, primary_key=True)
    lesson_id = Column(Text, ForeignKey("lessons.lesson_id", ondelete="CASCADE"), nullable=False)
    content_version_id = Column(Text, ForeignKey("content_versions.content_version_id", ondelete="SET NULL"))
    stimulus_id = Column(Text, ForeignKey("content_stimuli.stimulus_id", ondelete="SET NULL"))
    layout_version = Column(Text, nullable=False)
    aoi_key = Column(Text, nullable=False)
    aoi_name = Column(Text, nullable=False)
    css_selector = Column(Text, nullable=False)
    aoi_type = Column(Text, nullable=False)
    is_learning_area = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True)
    semantic_type = Column(Text)
    source = Column(Text)
    x_normalized = Column(Float)
    y_normalized = Column(Float)
    width_normalized = Column(Float)
    height_normalized = Column(Float)
    order_index = Column(Integer)

    __table_args__ = (
        UniqueConstraint("lesson_id", "layout_version", "aoi_key", name="aoi_definitions_lesson_id_layout_version_aoi_key_key"),
    )

    lesson = relationship("Lesson", back_populates="aoi_definitions")
    tracking_points = relationship("TrackingPoint", back_populates="aoi")
    aoi_metrics = relationship("AOIMetric", back_populates="aoi")


class TrackingPoint(Base):
    __tablename__ = "tracking_points"

    point_id = Column(Text, primary_key=True)
    session_id = Column(Text, ForeignKey("sessions.session_id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Text, ForeignKey("users.user_id", ondelete="SET NULL"))
    aoi_id = Column(Text, ForeignKey("aoi_definitions.aoi_id", ondelete="SET NULL"))
    course_id = Column(Text, ForeignKey("courses.course_id", ondelete="SET NULL"))
    course_item_id = Column(Text, ForeignKey("course_items.course_item_id", ondelete="SET NULL"))
    pdf_lesson_id = Column(Text, ForeignKey("pdf_lessons.pdf_lesson_id", ondelete="SET NULL"))
    pdf_document_version = Column(Text)
    test_id = Column(Text, ForeignKey("tests.test_id", ondelete="SET NULL"))
    module_id = Column(Text, ForeignKey("course_modules.module_id", ondelete="SET NULL"))
    activity_id = Column(Text, ForeignKey("lesson_activities.activity_id", ondelete="SET NULL"))
    content_version_id = Column(Text, ForeignKey("content_versions.content_version_id", ondelete="SET NULL"))
    stimulus_id = Column(Text, ForeignKey("content_stimuli.stimulus_id", ondelete="SET NULL"))
    timestamp_ms = Column(BigInteger, nullable=False)
    viewport_x = Column(Float, nullable=False)
    viewport_y = Column(Float, nullable=False)
    scroll_x = Column(Float, nullable=False, default=0)
    scroll_y = Column(Float, nullable=False, default=0)
    stimulus_x_norm = Column(Float)
    stimulus_y_norm = Column(Float)
    stimulus_left = Column(Float)
    stimulus_top = Column(Float)
    stimulus_width = Column(Float)
    stimulus_height = Column(Float)
    tracking_quality = Column(Text)
    screen_x = Column(Float)
    screen_y = Column(Float)
    viewport_width = Column(Integer)
    viewport_height = Column(Integer)
    device_pixel_ratio = Column(Float)
    zoom = Column(Float)
    fullscreen = Column(Boolean)
    page_number = Column(Integer)
    page_x_normalized = Column(Float)
    page_y_normalized = Column(Float)
    page_display_width = Column(Float)
    page_display_height = Column(Float)
    confidence = Column(Float)
    gaze_status = Column(Text)
    metadata_json = Column(JSONB)

    session = relationship("Session", back_populates="tracking_points")
    aoi = relationship("AOIDefinition", back_populates="tracking_points")


class AOIMetric(Base):
    __tablename__ = "aoi_metrics"

    metric_id = Column(Text, primary_key=True)
    session_id = Column(Text, ForeignKey("sessions.session_id", ondelete="CASCADE"), nullable=False)
    aoi_id = Column(Text, ForeignKey("aoi_definitions.aoi_id", ondelete="CASCADE"), nullable=False)
    dwell_time_ms = Column(BigInteger, nullable=False)
    dwell_time_pct = Column(Float, nullable=False)
    point_count = Column(Integer, nullable=False)
    first_hit_ms = Column(BigInteger)
    revisit_count = Column(Integer, nullable=False, default=0)
    calculated_at = Column(DateTime(timezone=True), server_default=func.now())
    algorithm_version = Column(Text, nullable=False)

    session = relationship("Session", back_populates="aoi_metrics")
    aoi = relationship("AOIDefinition", back_populates="aoi_metrics")


class Heatmap(Base):
    __tablename__ = "heatmaps"

    heatmap_id = Column(Text, primary_key=True)
    session_id = Column(Text, ForeignKey("sessions.session_id", ondelete="CASCADE"), nullable=False)
    aoi_key = Column(Text)
    background_image_url = Column(Text)
    status = Column(Text, nullable=False)
    error_message = Column(Text)
    cloudinary_public_id = Column(Text)
    image_url = Column(Text)
    image_url_thumbnail = Column(Text)
    point_count = Column(Integer, nullable=False, default=0)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())
    metadata_json = Column(JSONB)

    session = relationship("Session", back_populates="heatmaps")


class LearningEvent(Base):
    __tablename__ = "learning_events"

    event_id = Column(Text, primary_key=True)
    session_id = Column(Text, ForeignKey("sessions.session_id", ondelete="CASCADE"), nullable=False)
    event_type = Column(Text, nullable=False)
    target_aoi_id = Column(Text, ForeignKey("aoi_definitions.aoi_id", ondelete="SET NULL"))
    timestamp_ms = Column(BigInteger, nullable=False)
    event_value = Column(JSONB)
    user_id = Column(Text, ForeignKey("users.user_id", ondelete="SET NULL"))
    course_id = Column(Text, ForeignKey("courses.course_id", ondelete="SET NULL"))
    module_id = Column(Text, ForeignKey("course_modules.module_id", ondelete="SET NULL"))
    lesson_id = Column(Text, ForeignKey("lessons.lesson_id", ondelete="SET NULL"))
    activity_id = Column(Text, ForeignKey("lesson_activities.activity_id", ondelete="SET NULL"))
    content_version_id = Column(Text, ForeignKey("content_versions.content_version_id", ondelete="SET NULL"))
    stimulus_id = Column(Text, ForeignKey("content_stimuli.stimulus_id", ondelete="SET NULL"))
    client_timestamp_ms = Column(BigInteger)
    server_timestamp = Column(DateTime(timezone=True), server_default=func.now())
    sequence_number = Column(Integer)
    metadata_json = Column(JSONB)


class AOIVisit(Base):
    __tablename__ = "aoi_visits"

    visit_id = Column(Text, primary_key=True)
    session_id = Column(Text, ForeignKey("sessions.session_id", ondelete="CASCADE"), nullable=False)
    aoi_id = Column(Text, ForeignKey("aoi_definitions.aoi_id", ondelete="SET NULL"))
    course_id = Column(Text, ForeignKey("courses.course_id", ondelete="SET NULL"))
    module_id = Column(Text, ForeignKey("course_modules.module_id", ondelete="SET NULL"))
    lesson_id = Column(Text, ForeignKey("lessons.lesson_id", ondelete="SET NULL"))
    activity_id = Column(Text, ForeignKey("lesson_activities.activity_id", ondelete="SET NULL"))
    content_version_id = Column(Text, ForeignKey("content_versions.content_version_id", ondelete="SET NULL"))
    stimulus_id = Column(Text, ForeignKey("content_stimuli.stimulus_id", ondelete="SET NULL"))
    started_at_ms = Column(BigInteger, nullable=False)
    ended_at_ms = Column(BigInteger, nullable=False)
    dwell_time_ms = Column(BigInteger, nullable=False)
    fixation_count = Column(Integer, nullable=False, default=0)
    metadata_json = Column(JSONB)
    calculated_at = Column(DateTime(timezone=True), server_default=func.now())


class AOITransition(Base):
    __tablename__ = "aoi_transitions"

    transition_id = Column(Text, primary_key=True)
    session_id = Column(Text, ForeignKey("sessions.session_id", ondelete="CASCADE"), nullable=False)
    from_aoi_id = Column(Text, ForeignKey("aoi_definitions.aoi_id", ondelete="SET NULL"))
    to_aoi_id = Column(Text, ForeignKey("aoi_definitions.aoi_id", ondelete="SET NULL"))
    course_id = Column(Text, ForeignKey("courses.course_id", ondelete="SET NULL"))
    module_id = Column(Text, ForeignKey("course_modules.module_id", ondelete="SET NULL"))
    lesson_id = Column(Text, ForeignKey("lessons.lesson_id", ondelete="SET NULL"))
    activity_id = Column(Text, ForeignKey("lesson_activities.activity_id", ondelete="SET NULL"))
    content_version_id = Column(Text, ForeignKey("content_versions.content_version_id", ondelete="SET NULL"))
    stimulus_id = Column(Text, ForeignKey("content_stimuli.stimulus_id", ondelete="SET NULL"))
    occurred_at_ms = Column(BigInteger, nullable=False)
    transition_order = Column(Integer)
    metadata_json = Column(JSONB)
    calculated_at = Column(DateTime(timezone=True), server_default=func.now())


class AOISnapshot(Base):
    __tablename__ = "aoi_snapshots"

    snapshot_id     = Column(Text, primary_key=True)
    session_id      = Column(Text, ForeignKey("sessions.session_id", ondelete="CASCADE"), nullable=False)
    aoi_id          = Column(Text, ForeignKey("aoi_definitions.aoi_id", ondelete="CASCADE"), nullable=False)
    viewport_x      = Column(Float, nullable=False)
    viewport_y      = Column(Float, nullable=False)
    viewport_w      = Column(Float, nullable=False)
    viewport_h      = Column(Float, nullable=False)
    scroll_x        = Column(Float, nullable=False, default=0)
    scroll_y        = Column(Float, nullable=False, default=0)
    captured_at_ms  = Column(BigInteger, nullable=False)


class PageSnapshot(Base):
    __tablename__ = "page_snapshots"

    snapshot_id          = Column(Text, primary_key=True)
    session_id           = Column(Text, ForeignKey("sessions.session_id", ondelete="CASCADE"), nullable=False, unique=True)
    captured_at_ms       = Column(BigInteger, nullable=False)

    viewport_w           = Column(Integer, nullable=False)
    viewport_h           = Column(Integer, nullable=False)
    document_w           = Column(Integer, nullable=False)
    document_h           = Column(Integer, nullable=False)

    requested_scale      = Column(Float, nullable=False)
    actual_scale         = Column(Float, nullable=False)
    canvas_w             = Column(Integer, nullable=False)
    canvas_h             = Column(Integer, nullable=False)

    cloudinary_public_id = Column(Text)
    image_url            = Column(Text)
    image_url_thumbnail  = Column(Text)
    status               = Column(Text, nullable=False, server_default="pending")
    error_message         = Column(Text)


class GazeChunk(Base):
    __tablename__ = "gaze_chunks"

    chunk_id = Column(Text, primary_key=True)
    session_id = Column(Text, ForeignKey("sessions.session_id", ondelete="CASCADE"), nullable=False)
    seq = Column(Integer, nullable=False)
    start_ms = Column(BigInteger, nullable=False)
    data = Column(JSONB, nullable=False)

    __table_args__ = (UniqueConstraint("session_id", "seq", name="uq_gaze_chunks_session_seq"),)
