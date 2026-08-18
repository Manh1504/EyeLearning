from datetime import datetime, timezone

from sqlalchemy import (
    REAL,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LearningSession(Base):
    __tablename__ = "learning_sessions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")
    )
    enrollment_id: Mapped[str] = mapped_column(
        ForeignKey("enrollments.id", ondelete="CASCADE")
    )
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"))
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id"))
    calibration_param_id: Mapped[str | None] = mapped_column(
        ForeignKey("calibration_params.id")
    )
    status: Mapped[str] = mapped_column(String(20), server_default=text("'in_progress'"))
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    tracking_consent: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))


class GazeEvent(Base):
    __tablename__ = "gaze_events"
    __table_args__ = (
        CheckConstraint("gaze_x >= 0 AND gaze_x <= 1", name="gaze_events_gaze_x_check"),
        CheckConstraint("gaze_y >= 0 AND gaze_y <= 1", name="gaze_events_gaze_y_check"),
        {"postgresql_partition_by": "RANGE (event_time)"},
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    learning_session_id: Mapped[str] = mapped_column(
        ForeignKey("learning_sessions.id", ondelete="CASCADE"), nullable=False
    )
    lesson_content_id: Mapped[str] = mapped_column(
        ForeignKey("lesson_contents.id"), nullable=False
    )
    event_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), primary_key=True, server_default=text("now()")
    )
    gaze_x: Mapped[float] = mapped_column(REAL, nullable=False)
    gaze_y: Mapped[float] = mapped_column(REAL, nullable=False)


class GazeSlideStat(Base):
    __tablename__ = "gaze_slide_stats"
    __table_args__ = (
        UniqueConstraint("learning_session_id", "lesson_content_id"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")
    )
    learning_session_id: Mapped[str] = mapped_column(
        ForeignKey("learning_sessions.id", ondelete="CASCADE")
    )
    lesson_content_id: Mapped[str] = mapped_column(
        ForeignKey("lesson_contents.id", ondelete="CASCADE")
    )
    total_samples: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    on_slide_samples: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    view_ms: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        onupdate=lambda: datetime.now(timezone.utc),
    )
