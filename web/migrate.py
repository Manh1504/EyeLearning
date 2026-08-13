"""Migration runner idempotent cho deploy bằng image (Portainer, vast.ai...).

Áp dụng các file .sql trong web/migrations theo thứ tự tên file, ghi nhận vào
bảng _schema_migrations — file đã chạy không bao giờ chạy lại, image mới hơn
tự áp dụng migration còn thiếu mà không mất data.

Dùng khi không thể mount thư mục migrations vào /docker-entrypoint-initdb.d
của container Postgres (vd. Portainer Stacks chỉ dùng image, không bind-mount):

    python -m web.migrate          # cần biến môi trường DATABASE_URL

Quy tắc:
- DB trống -> chạy toàn bộ migration.
- DB đã có schema (vd. tạo bởi initdb.d của compose dev) nhưng chưa có bảng
  tracking -> BASELINE: ghi nhận mọi file là đã áp dụng, không chạy lại.
- DB có bảng tracking -> chỉ chạy file chưa ghi nhận.
"""

import asyncio
import os
from pathlib import Path

import asyncpg

MIGRATIONS_DIR = Path(__file__).resolve().parent / "migrations"
TRACKING_TABLE_SQL = (
    "CREATE TABLE IF NOT EXISTS _schema_migrations ("
    "filename TEXT PRIMARY KEY, "
    "applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
)
CONNECT_RETRIES = 60
CONNECT_RETRY_SECONDS = 2


def _asyncpg_url(database_url: str) -> str:
    return database_url.replace("postgresql+asyncpg://", "postgresql://", 1)


async def _connect(url: str) -> asyncpg.Connection:
    last_error: Exception | None = None
    for attempt in range(1, CONNECT_RETRIES + 1):
        try:
            return await asyncpg.connect(url)
        except (OSError, asyncpg.PostgresError) as exc:
            last_error = exc
            print(f"[migrate] Chua ket noi duoc Postgres (lan {attempt}): {exc}", flush=True)
            await asyncio.sleep(CONNECT_RETRY_SECONDS)
    raise SystemExit(f"[migrate] Khong ket noi duoc PostgreSQL: {last_error}")


async def _applied_filenames(conn: asyncpg.Connection) -> set[str]:
    rows = await conn.fetch("SELECT filename FROM _schema_migrations")
    return {row["filename"] for row in rows}


async def _has_legacy_schema(conn: asyncpg.Connection) -> bool:
    return bool(
        await conn.fetchval(
            "SELECT EXISTS ("
            "SELECT 1 FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_name = 'users')"
        )
    )


async def run(database_url: str) -> None:
    conn = await _connect(_asyncpg_url(database_url))
    try:
        await conn.execute(TRACKING_TABLE_SQL)
        migration_files = sorted(MIGRATIONS_DIR.glob("*.sql"))
        applied = await _applied_filenames(conn)

        if not applied and await _has_legacy_schema(conn):
            print("[migrate] Schema da ton tai san (initdb.d cu) — baseline, khong chay lai", flush=True)
            for path in migration_files:
                await conn.execute(
                    "INSERT INTO _schema_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING",
                    path.name,
                )
            print(f"[migrate] Baseline {len(migration_files)} file. OK", flush=True)
            return

        pending = [path for path in migration_files if path.name not in applied]
        if not pending:
            print(f"[migrate] Khong co migration moi ({len(migration_files)} file da ap dung). OK", flush=True)
            return

        for path in pending:
            print(f"[migrate] Ap dung: {path.name}", flush=True)
            sql = path.read_text(encoding="utf-8")
            async with conn.transaction():
                await conn.execute(sql)
                await conn.execute(
                    "INSERT INTO _schema_migrations (filename) VALUES ($1)",
                    path.name,
                )
        print(f"[migrate] OK — da ap dung {len(pending)} migration", flush=True)
    finally:
        await conn.close()


def main() -> None:
    database_url = os.getenv("DATABASE_URL", "").strip()
    if not database_url:
        raise SystemExit("[migrate] Thieu bien moi truong DATABASE_URL")
    asyncio.run(run(database_url))


if __name__ == "__main__":
    main()
