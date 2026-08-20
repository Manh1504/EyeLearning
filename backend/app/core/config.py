from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Nguồn duy nhất: file .env ở gốc repo (bỏ hẳn giá trị mẫu nhúng trong code).
ROOT_ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=ROOT_ENV_FILE, env_file_encoding="utf-8", extra="ignore"
    )

    app_name: str = "GazeEdu API"
    debug: bool = False
    testing: bool = False

    # Bắt buộc — phải có trong .env (không nhúng mẫu trong code).
    database_url: str
    jwt_secret: str
    cors_origins: str
    ai_http_url: str

    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60
    refresh_token_expire_days: int = 30

    gaze_downsample_hz: float = 4.0
    gaze_batch_max: int = 2000

    # Thư mục lưu slide ảnh render từ PDF (mount StaticFiles tại /media).
    media_dir: str = "media"
    # Dung lượng tối đa một file PDF upload (bytes).
    max_pdf_bytes: int = 100 * 1024 * 1024

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def media_path(self) -> Path:
        return Path(self.media_dir).resolve()


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
