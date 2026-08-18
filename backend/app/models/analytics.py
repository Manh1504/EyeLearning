from datetime import datetime

from sqlalchemy import (
    REAL,
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AoiRegion(Base):
    __tablename__ = "aoi_regions"
    __table_args__ = (
        CheckConstraint(
            "x_min >= 0 AND x_min <= 1 AND y_min >= 0 AND y_min <= 1 "
            "AND x_max >= 0 AND x_max <= 1 AND y_max >= 0 AND y_max <= 1",
            name="aoi_regions_bounds_check",
        ),
        CheckConstraint("x_min < x_max AND y_min < y_max", name="aoi_regions_order_check"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")
    )
    lesson_content_id: Mapped[str] = mapped_column(
        ForeignKey("lesson_contents.id", ondelete="CASCADE")
    )
    name: Mapped[str] = mapped_column(String(100))
    x_min: Mapped[float] = mapped_column(REAL)
    y_min: Mapped[float] = mapped_column(REAL)
    x_max: Mapped[float] = mapped_column(REAL)
    y_max: Mapped[float] = mapped_column(REAL)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class HeatmapAggregate(Base):
    __tablename__ = "heatmap_aggregates"
    __table_args__ = (
        CheckConstraint("scope IN ('class', 'student')", name="heatmap_aggregates_scope_check"),
        CheckConstraint(
            "(scope = 'student') = (student_id IS NOT NULL)",
            name="heatmap_aggregates_scope_student_check",
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")
    )
    lesson_content_id: Mapped[str] = mapped_column(
        ForeignKey("lesson_contents.id", ondelete="CASCADE")
    )
    scope: Mapped[str] = mapped_column(String(10))
    student_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE")
    )
    sample_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    on_slide_ratio: Mapped[float | None] = mapped_column(REAL)
    avg_view_ms: Mapped[int | None] = mapped_column(BigInteger)
    fixation_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    hotspots: Mapped[list] = mapped_column(JSONB, server_default=text("'[]'::jsonb"))
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )


class AoiDwellStat(Base):
    __tablename__ = "aoi_dwell_stats"
    __table_args__ = (UniqueConstraint("learning_session_id", "aoi_region_id"),)

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")
    )
    learning_session_id: Mapped[str] = mapped_column(
        ForeignKey("learning_sessions.id", ondelete="CASCADE")
    )
    aoi_region_id: Mapped[str] = mapped_column(
        ForeignKey("aoi_regions.id", ondelete="CASCADE")
    )
    dwell_ms: Mapped[int] = mapped_column(BigInteger, server_default=text("0"))
    sample_count: Mapped[int] = mapped_column(Integer, server_default=text("0"))


class EngagementScore(Base):
    __tablename__ = "engagement_scores"
    __table_args__ = (
        UniqueConstraint("enrollment_id", "lesson_id"),
        CheckConstraint("score >= 0 AND score <= 100", name="engagement_scores_score_check"),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")
    )
    enrollment_id: Mapped[str] = mapped_column(
        ForeignKey("enrollments.id", ondelete="CASCADE")
    )
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"))
    score: Mapped[float] = mapped_column(REAL)
    on_slide_ratio: Mapped[float | None] = mapped_column(REAL)
    computed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
