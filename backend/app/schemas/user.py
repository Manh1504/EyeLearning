from datetime import date, datetime

from pydantic import Field

from app.schemas.common import CamelModel


class ProfileOut(CamelModel):
    role: str
    email: str
    full_name: str
    date_of_birth: date | None = None
    gender: str | None = None
    phone: str | None = None
    avatar_url: str | None = None
    created_at: datetime
    student_code: str | None = None
    program: str | None = None
    teacher_code: str | None = None
    department: str | None = None


class ProfileUpdate(CamelModel):
    full_name: str = Field(min_length=1, max_length=150)
    date_of_birth: date | None = None
    gender: str | None = Field(default=None, pattern="^(male|female|other)$")
    phone: str | None = Field(default=None, max_length=20)
    avatar_url: str | None = None
    program: str | None = Field(default=None, max_length=200)
    department: str | None = Field(default=None, max_length=150)
