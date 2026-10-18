from datetime import date

from pydantic import EmailStr, Field, model_validator

from app.schemas.common import CamelModel


class LoginRequest(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


class RegisterRequest(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    full_name: str = Field(min_length=1, max_length=150)
    birth_year: int = Field(ge=1900, le=2100)

    @model_validator(mode="after")
    def validate_birth_year(self):
        current_year = date.today().year
        if self.birth_year > current_year:
            raise ValueError("Năm sinh không hợp lệ")
        return self


class RefreshRequest(CamelModel):
    refresh_token: str | None = None


class UserSummary(CamelModel):
    id: str
    email: str
    roles: list[str]
    full_name: str | None = None


class TokenPair(CamelModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserSummary
