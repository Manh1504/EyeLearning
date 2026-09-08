from pydantic import EmailStr, Field

from app.schemas.common import CamelModel


class LoginRequest(CamelModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)


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
