from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "GazeEdu API"
    debug: bool = True
    testing: bool = False

    database_url: str = (
        "postgresql+asyncpg://postgres:postgres@localhost:5435/eyetracking"
    )

    jwt_secret: str = "dev-secret-change-me-please-0123456789abcdef"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    cors_origins: str = "http://localhost:3000"

    ai_http_url: str = "http://127.0.0.1:8000"
    ai_ws_url: str = "ws://127.0.0.1:8000/infer"

    gaze_downsample_hz: float = 4.0
    gaze_batch_max: int = 2000

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
