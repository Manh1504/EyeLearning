from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, SmallInteger, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.auth import User


class Gender(Base):
    __tablename__ = "genders"

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=True)
    code: Mapped[str] = mapped_column(String(20), unique=True)
    label: Mapped[str | None] = mapped_column(String(50))


class UserProfile(Base):
    __tablename__ = "user_profiles"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    full_name: Mapped[str] = mapped_column(String(150))
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    gender_id: Mapped[int | None] = mapped_column(ForeignKey("genders.id"))
    email: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(20))
    avatar_url: Mapped[str | None] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

    user: Mapped["User"] = relationship(back_populates="profile")  # noqa: F821
    gender: Mapped[Gender | None] = relationship(lazy="joined")


class StudentProfile(Base):
    __tablename__ = "student_profiles"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    student_code: Mapped[str] = mapped_column(String(30), unique=True)
    program: Mapped[str | None] = mapped_column(String(200))
    extra: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))

    user: Mapped["User"] = relationship(back_populates="student_profile")  # noqa: F821


class TeacherProfile(Base):
    __tablename__ = "teacher_profiles"

    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    teacher_code: Mapped[str] = mapped_column(String(30), unique=True)
    department: Mapped[str | None] = mapped_column(String(150))
    extra: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))

    user: Mapped["User"] = relationship(back_populates="teacher_profile")  # noqa: F821
