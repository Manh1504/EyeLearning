from sqlalchemy import (
    Column, String, Boolean, Integer, Float,
    ForeignKey, Text, DateTime, UniqueConstraint
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base
import uuid


class User(Base):
    __tablename__ = "users"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name            = Column(String(100), nullable=False)
    student_code    = Column(String(20), nullable=False, unique=True)
    email           = Column(String(150))
    role            = Column(String(20), nullable=False, default="student")
    password_hash   = Column(Text)
    is_active       = Column(Boolean, nullable=False, default=True)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    sessions        = relationship("Session", back_populates="user")


class Lecture(Base):
    __tablename__ = "lectures"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title           = Column(String(255), nullable=False)
    description     = Column(Text)
    file_url        = Column(Text)
    thumbnail_url   = Column(Text)
    duration_sec    = Column(Integer)
    is_active       = Column(Boolean, nullable=False, default=True)
    created_by      = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    created_at      = Column(DateTime(timezone=True), server_default=func.now())
    updated_at      = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    sessions        = relationship("Session", back_populates="lecture")


class Session(Base):
    __tablename__ = "sessions"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id         = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    lecture_id      = Column(UUID(as_uuid=True), ForeignKey("lectures.id", ondelete="SET NULL"))
    status          = Column(String(20), nullable=False, default="calibrating")
    screen_width    = Column(Integer)
    screen_height   = Column(Integer)
    started_at      = Column(DateTime(timezone=True), server_default=func.now())
    finished_at     = Column(DateTime(timezone=True))
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    user                  = relationship("User", back_populates="sessions")
    lecture               = relationship("Lecture", back_populates="sessions")
    calibration_profile   = relationship("CalibrationProfile", back_populates="session", uselist=False)
    gaze_chunks           = relationship("GazeChunk", back_populates="session")
    heatmaps              = relationship("Heatmap", back_populates="session")


class CalibrationProfile(Base):
    __tablename__ = "calibration_profiles"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id      = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, unique=True)
    model_path      = Column(Text, nullable=False)
    avg_error_px    = Column(Float)
    n_points        = Column(Integer, nullable=False, default=0)
    model_type      = Column(String(50), default="SVR")
    meta            = Column(JSONB)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    session         = relationship("Session", back_populates="calibration_profile")


class GazeChunk(Base):
    __tablename__ = "gaze_chunks"

    id              = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id      = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    seq             = Column(Integer, nullable=False)
    start_ms        = Column(Integer, nullable=False)
    data            = Column(JSONB, nullable=False)
    created_at      = Column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (UniqueConstraint("session_id", "seq", name="uq_gaze_chunks_session_seq"),)

    session         = relationship("Session", back_populates="gaze_chunks")


class Heatmap(Base):
    __tablename__ = "heatmaps"

    id                      = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id              = Column(UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    cloudinary_public_id    = Column(Text, nullable=False)
    image_url               = Column(Text, nullable=False)
    image_url_thumbnail     = Column(Text)
    time_range_start_ms     = Column(Integer)
    time_range_end_ms       = Column(Integer)
    created_at              = Column(DateTime(timezone=True), server_default=func.now())

    session         = relationship("Session", back_populates="heatmaps")