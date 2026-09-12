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

    # Cookie auth (httpOnly) — 2a hybrid: access memory + refresh httpOnly
    # Mặc định an toàn prod: Secure=True khi không DEBUG, dev tự hạ xuống
    cookie_secure: bool | None = None  # None = tự suy ra từ debug (True prod, False dev/localhost)
    cookie_samesite: str = "lax"  # lax đủ cho same-site rewrite, strict nếu muốn
    cookie_domain: str | None = None  # None = host-only (khuyến nghị cho rewrite)

    @property
    def cookie_secure_resolved(self) -> bool:
        if self.cookie_secure is not None:
            return self.cookie_secure
        return not self.debug

    gaze_downsample_hz: float = 4.0
    gaze_batch_max: int = 2000

    # Redis (tùy chọn). Dùng cho rate-limit + cache analytics. Để trống → fallback
    # in-memory (1 process, dev/test). Ví dụ: redis://localhost:6379/0
    redis_url: str = ""
    # TTL (giây) cho cache heatmap analytics.
    heatmap_cache_ttl_seconds: int = 60
    # Khoảng cách tối thiểu (giây) giữa 2 lần refresh_aggregates cho cùng 1 lesson.
    aggregate_refresh_throttle_seconds: int = 10

    # Thư mục lưu slide ảnh render từ PDF (mount StaticFiles tại /media).
    media_dir: str = "media"
    # Dung lượng tối đa một file PDF upload (bytes).
    max_pdf_bytes: int = 100 * 1024 * 1024

    # Tính điểm hoàn thành bài học theo độ bao phủ nội dung (AOI).
    mastery_coverage_threshold: float = 0.85      # bao phủ >= 85% → xem như đủ trang
    mastery_key_weight: float = 0.85              # trọng số nhóm slide trọng tâm (còn lại 0.15)
    mastery_min_aoi_dwell_ms: int = 400           # dwell tối thiểu để tính 1 AOI đã xem
    mastery_aoi_padding: float = 0.02             # nở bbox AOI (chuẩn hóa) bù sai số gaze
    mastery_max_dwell_ms: int = 1000              # trần dwell mỗi mẫu (tránh tab mất focus)
    mastery_grid_cols: int = 12                   # lưới fallback khi PDF không trích được text
    mastery_grid_rows: int = 8

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
