"""Cấu hình dùng chung cho chatbot.

`DATABASE_URL` là DSN psycopg (postgresql://...), KHÔNG dùng hậu tố +asyncpg.
Fallback `DATABASE_URL_DOCKER` để tương thích khi stack chỉ cấu hình biến dùng
chung với backend.
"""

import os


def database_url() -> str:
    url = os.getenv("DATABASE_URL") or os.getenv("DATABASE_URL_DOCKER") or ""
    if not url:
        raise RuntimeError(
            "Thiếu DATABASE_URL (hoặc DATABASE_URL_DOCKER) cho chatbot. "
            "Đặt DSN dạng postgresql://user:pass@postgres:5432/eyetracking"
        )
    return url
