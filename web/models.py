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

    sessions = relationship("Session", back_populates="user")
    calibration_profiles = relationship("CalibrationProfile", back_populates="user")
    lessons = relationship("Lesson", back_populates="teacher")


class Lesson(Base):
    __tablename__ = "lessons"

    lesson_id = Column(Text, primary_key=True)
    lesson_title = Column(Text, nullable=False)
    teacher_id = Column(Text, ForeignKey("users.user_id", ondelete="SET NULL"))
    lesson_description = Column(Text)
    video_url = Column(Text)
    content_url = Column(Text)
    layout_version = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    teacher = relationship("User", back_populates="lessons")
    sessions = relationship("Session", back_populates="lesson")
    aoi_definitions = relationship("AOIDefinition", back_populates="lesson")


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

    user = relationship("User", back_populates="calibration_profiles")


class Session(Base):
    __tablename__ = "sessions"

    session_id = Column(Text, primary_key=True)
    user_id = Column(Text, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False)
    lesson_id = Column(Text, ForeignKey("lessons.lesson_id", ondelete="CASCADE"), nullable=False)
    # KHÔNG FK cứng — calibration_group_id không phải PK của calibration_profiles
    # (1 group gồm 9 row checkpoint). Validate tồn tại ở tầng application
    # (routers/calibration.py), không phải ở constraint DB.
    calibration_group_id = Column(Text)
    started_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True))
    is_fullscreen = Column(Boolean)
    viewport_w = Column(Integer)
    viewport_h = Column(Integer)
    status = Column(Text, nullable=False, server_default="calibrating")

    user = relationship("User", back_populates="sessions")
    lesson = relationship("Lesson", back_populates="sessions")
    tracking_points = relationship("TrackingPoint", back_populates="session")
    aoi_metrics = relationship("AOIMetric", back_populates="session")
    heatmaps = relationship("Heatmap", back_populates="session")


class AOIDefinition(Base):
    __tablename__ = "aoi_definitions"

    aoi_id = Column(Text, primary_key=True)
    lesson_id = Column(Text, ForeignKey("lessons.lesson_id", ondelete="CASCADE"), nullable=False)
    layout_version = Column(Text, nullable=False)
    aoi_key = Column(Text, nullable=False)
    aoi_name = Column(Text, nullable=False)
    css_selector = Column(Text, nullable=False)
    aoi_type = Column(Text, nullable=False)
    is_learning_area = Column(Boolean, nullable=False, default=True)
    is_active = Column(Boolean, nullable=False, default=True)

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
    aoi_id = Column(Text, ForeignKey("aoi_definitions.aoi_id", ondelete="SET NULL"))
    timestamp_ms = Column(BigInteger, nullable=False)
    viewport_x = Column(Float, nullable=False)
    viewport_y = Column(Float, nullable=False)
    scroll_x = Column(Float, nullable=False, default=0)
    scroll_y = Column(Float, nullable=False, default=0)
    confidence = Column(Float)
    gaze_status = Column(Text)

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
    start_ms = Column(Integer, nullable=False)
    data = Column(JSONB, nullable=False)

    __table_args__ = (UniqueConstraint("session_id", "seq", name="uq_gaze_chunks_session_seq"),)
