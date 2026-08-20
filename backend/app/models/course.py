from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class CourseStatus(Base):
    __tablename__ = "course_statuses"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    label: Mapped[str | None] = mapped_column(String(100))


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")
    )
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    level: Mapped[str | None] = mapped_column(String(30))
    thumbnail_url: Mapped[str | None] = mapped_column(Text)
    status_id: Mapped[int] = mapped_column(ForeignKey("course_statuses.id"))
    teacher_id: Mapped[str] = mapped_column(ForeignKey("teacher_profiles.user_id"))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    status: Mapped[CourseStatus] = relationship(lazy="joined")
    modules: Mapped[list["Module"]] = relationship(
        back_populates="course",
        order_by="Module.order_index",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    teachers: Mapped[list["CourseTeacher"]] = relationship(
        back_populates="course",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class CourseTeacher(Base):
    """Phân công giảng viên cho khóa học (many-to-many do admin quản lý)."""

    __tablename__ = "course_teachers"

    course_id: Mapped[str] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), primary_key=True
    )
    teacher_id: Mapped[str] = mapped_column(
        ForeignKey("teacher_profiles.user_id", ondelete="CASCADE"), primary_key=True
    )
    assigned_by: Mapped[str | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

    course: Mapped[Course] = relationship(back_populates="teachers")


class Module(Base):
    __tablename__ = "modules"
    __table_args__ = (UniqueConstraint("course_id", "order_index"),)

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")
    )
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    order_index: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

    course: Mapped[Course] = relationship(back_populates="modules")
    lessons: Mapped[list["Lesson"]] = relationship(
        back_populates="module",
        order_by="Lesson.order_index",
        lazy="selectin",
        cascade="all, delete-orphan",
    )


class Lesson(Base):
    __tablename__ = "lessons"
    __table_args__ = (UniqueConstraint("module_id", "order_index"),)

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")
    )
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(255))
    order_index: Mapped[int] = mapped_column(Integer)
    content_url: Mapped[str | None] = mapped_column(Text)
    metadata_: Mapped[dict] = mapped_column(
        "metadata", JSONB, server_default=text("'{}'::jsonb")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    module: Mapped[Module] = relationship(back_populates="lessons")
    contents: Mapped[list["LessonContent"]] = relationship(
        back_populates="lesson",
        order_by="LessonContent.order_index",
        lazy="selectin",
        cascade="all, delete-orphan",
    )


class LessonContent(Base):
    __tablename__ = "lesson_contents"
    __table_args__ = (UniqueConstraint("lesson_id", "order_index"),)

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")
    )
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"))
    order_index: Mapped[int] = mapped_column(Integer)
    image_url: Mapped[str] = mapped_column(Text)
    content_json: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))

    lesson: Mapped[Lesson] = relationship(back_populates="contents")


class Enrollment(Base):
    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("course_id", "student_id"),
        CheckConstraint(
            "status IN ('active', 'completed', 'dropped')", name="enrollments_status_check"
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")
    )
    course_id: Mapped[str] = mapped_column(ForeignKey("courses.id", ondelete="CASCADE"))
    student_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    enrolled_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    status: Mapped[str] = mapped_column(String(30), server_default=text("'active'"))

    course: Mapped[Course] = relationship(lazy="joined")


class LessonProgress(Base):
    __tablename__ = "lesson_progress"
    __table_args__ = (
        UniqueConstraint("enrollment_id", "lesson_id"),
        CheckConstraint(
            "status IN ('in_progress', 'completed')", name="lesson_progress_status_check"
        ),
    )

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")
    )
    enrollment_id: Mapped[str] = mapped_column(
        ForeignKey("enrollments.id", ondelete="CASCADE")
    )
    lesson_id: Mapped[str] = mapped_column(ForeignKey("lessons.id", ondelete="CASCADE"))
    status: Mapped[str] = mapped_column(String(20), server_default=text("'in_progress'"))
    viewed_slides: Mapped[list[int]] = mapped_column(
        ARRAY(Integer), server_default=text("'{}'")
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_watched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=text("now()"),
        onupdate=lambda: datetime.now(timezone.utc),
    )
