"""Xoá checkpoint hội thoại cũ khỏi DB LangGraph (chạy định kỳ).

LangGraph lưu lịch sử mỗi `thread_id` trong các bảng `checkpoints`,
`checkpoint_blobs`, `checkpoint_writes`. Không có TTL sẵn nên DB phình dần; script
này xoá các thread có checkpoint mới nhất cũ hơn `--older-than-days`.

Chạy (dev/ops, không nằm trong request path):

    python -m scripts.prune_checkpoints --older-than-days 30 --dry-run
    python -m scripts.prune_checkpoints --older-than-days 30

Mặc định `--dry-run` chỉ liệt kê; thêm `--apply` để thực sự xoá.
"""

import argparse
import logging
from datetime import datetime, timedelta, timezone

from langgraph.checkpoint.postgres import PostgresSaver

from app.db import close_pool, get_pool

logger = logging.getLogger(__name__)

# Thời điểm checkpoint (ISO 8601) được lưu trong JSONB `checkpoints.checkpoint`.
LAST_TS_SQL = """
    SELECT thread_id, MAX(checkpoint ->> 'ts') AS last_ts
    FROM checkpoints
    GROUP BY thread_id
"""


def _parse_ts(value: str) -> datetime | None:
    if not value:
        return None
    try:
        when = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if when.tzinfo is None:
        when = when.replace(tzinfo=timezone.utc)
    return when


def find_stale_threads(cutoff: datetime) -> list[str]:
    with get_pool().connection() as conn:
        with conn.cursor() as cur:
            cur.execute(LAST_TS_SQL)
            rows = cur.fetchall()

    stale: list[str] = []
    for row in rows:
        when = _parse_ts(row["last_ts"] or "")
        if when is None or when < cutoff:
            stale.append(row["thread_id"])
    return stale


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--older-than-days", type=float, default=30.0)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Thực sự xoá (mặc định chỉ liệt kê — dry-run).",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(message)s")
    cutoff = datetime.now(timezone.utc) - timedelta(days=args.older_than_days)
    stale = find_stale_threads(cutoff)

    if not stale:
        print("Không có thread nào cũ hơn mốc — không cần xoá.")
        close_pool()
        return 0

    print(f"{len(stale)} thread cũ hơn {cutoff.isoformat()} (cutoff).")
    if not args.apply:
        for thread_id in stale:
            print(" -", thread_id)
        print("Chạy lại với --apply để xoá.")
        close_pool()
        return 0

    checkpointer = PostgresSaver(get_pool())
    checkpointer.prune(stale, strategy="delete")
    print(f"Đã xoá {len(stale)} thread.")
    close_pool()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
