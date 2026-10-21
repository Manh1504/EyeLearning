"""Connection pool PostgreSQL dùng chung cho checkpointer + retriever + ingestion.

Trước đây mỗi thành phần tự mở connection riêng, và checkpointer dùng thẳng
`from_conn_string` (1 connection) — khi nhiều request `/chat` chạy song song
trong threadpool thì dùng chung 1 connection là điểm nghẽn/rủi ro. Dùng
`psycopg_pool.ConnectionPool` để mỗi tác vụ mượn connection riêng.

`register_vector` được cấu hình cho MỌI connection trong pool để pgvector hoạt
động ở retriever/ingestion.
"""

import logging
import os
import threading

from pgvector.psycopg import register_vector
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.settings import database_url

logger = logging.getLogger(__name__)

_pool: ConnectionPool | None = None
_lock = threading.Lock()


def _configure(conn) -> None:
    register_vector(conn)


def get_pool() -> ConnectionPool:
    """Lazy singleton pool; tạo lần đầu khi cần."""
    global _pool
    if _pool is None:
        with _lock:
            if _pool is None:
                _pool = ConnectionPool(
                    conninfo=database_url(),
                    min_size=int(os.getenv("DB_POOL_MIN", "1")),
                    max_size=int(os.getenv("DB_POOL_MAX", "10")),
                    kwargs={
                        "autocommit": True,
                        "row_factory": dict_row,
                        "prepare_threshold": 0,
                    },
                    configure=_configure,
                    check=ConnectionPool.check_connection,
                    open=True,
                )
                logger.info("Đã mở DB connection pool")
    return _pool


def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        _pool = None
