from urllib.error import URLError
from urllib.request import urlopen

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from web.config import client_config, cloudinary_status
from web.authz import current_user_from_cookie, require_admin_user
from web.database import get_db
from web.services.page_snapshot_service import PAGE_SNAPSHOT_DIR, snapshot_paths

router = APIRouter(prefix="/admin", tags=["admin"])


async def _table_exists(db: AsyncSession, table_name: str) -> bool:
    result = await db.execute(text("select to_regclass(:name) is not null"), {"name": f"public.{table_name}"})
    return bool(result.scalar_one())


async def _count_table(db: AsyncSession, table_name: str) -> int | None:
    if not await _table_exists(db, table_name):
        return None
    result = await db.execute(text(f"select count(*) from {table_name}"))
    return int(result.scalar_one())


async def _count_official_sessions(db: AsyncSession) -> int | None:
    if not await _table_exists(db, "sessions"):
        return None
    result = await db.execute(text("select count(*) from sessions where session_type = 'student_learning'"))
    return int(result.scalar_one())


async def _count_admin_test_sessions(db: AsyncSession) -> int | None:
    if not await _table_exists(db, "sessions"):
        return None
    result = await db.execute(text("select count(*) from sessions where session_type = 'admin_test'"))
    return int(result.scalar_one())


async def _count_users_by_role(db: AsyncSession, role: str) -> int | None:
    if not await _table_exists(db, "users"):
        return None
    result = await db.execute(text("select count(*) from users where role = :role"), {"role": role})
    return int(result.scalar_one())


def _page_snapshot_count() -> int:
    if not PAGE_SNAPSHOT_DIR.is_dir():
        return 0
    return len(list(PAGE_SNAPSHOT_DIR.glob("page_snapshot_*.png")))


def _ai_service_status() -> dict:
    url = f"{client_config()['ai_http_url']}/health_check"
    try:
        with urlopen(url, timeout=1.5) as response:
            return {"ok": 200 <= response.status < 300, "url": url}
    except (OSError, URLError) as exc:
        return {"ok": False, "url": url, "error": str(exc)}


@router.get("/overview")
async def admin_overview(
    user = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    require_admin_user(user)
    recent_sessions = []
    if await _table_exists(db, "sessions"):
        tracking_points_count = (
            "(select count(*) from tracking_points tp where tp.session_id = s.session_id)"
            if await _table_exists(db, "tracking_points")
            else "0"
        )
        metrics_count = (
            "(select count(*) from aoi_metrics am where am.session_id = s.session_id)"
            if await _table_exists(db, "aoi_metrics")
            else "0"
        )
        heatmaps_count = (
            "(select count(*) from heatmaps h where h.session_id = s.session_id)"
            if await _table_exists(db, "heatmaps")
            else "0"
        )
        result = await db.execute(
            text(
                f"""
                select
                    s.session_id,
                    s.lesson_id,
                    s.user_id,
                    u.full_name,
                    u.student_code,
                    s.started_at,
                    s.ended_at,
                    s.viewport_w,
                    s.viewport_h,
                    coalesce(s.session_type, 'legacy_unknown') as session_type,
                    s.created_by_role,
                    {tracking_points_count} as tracking_points_count,
                    {metrics_count} as metrics_count,
                    {heatmaps_count} as heatmaps_count
                from sessions s
                left join users u on u.user_id = s.user_id
                order by s.started_at desc nulls last
                limit 50
                """
            )
        )
        for row in result.mappings().all():
            snapshot_image_path, snapshot_metadata_path = snapshot_paths(row["session_id"])
            recent_sessions.append({
                **dict(row),
                "snapshot_captured": snapshot_image_path.is_file() and snapshot_metadata_path.is_file(),
            })

    return {
        "system_health": {
            "api": {"ok": True},
            "db_schema": await _table_exists(db, "sessions"),
            "ai_service": _ai_service_status(),
            "cloudinary": cloudinary_status(),
        },
        "counts": {
            "users": await _count_table(db, "users"),
            "teachers": await _count_users_by_role(db, "teacher"),
            "students": await _count_users_by_role(db, "student"),
            "lessons": await _count_table(db, "lessons"),
            "sessions": await _count_official_sessions(db),
            "admin_test_sessions": await _count_admin_test_sessions(db),
            "gaze_chunks": await _count_table(db, "gaze_chunks"),
            "tracking_points": await _count_table(db, "tracking_points"),
            "aoi_metrics": await _count_table(db, "aoi_metrics"),
            "heatmaps": await _count_table(db, "heatmaps"),
            "page_snapshots": _page_snapshot_count(),
        },
        "recent_sessions": recent_sessions,
    }
