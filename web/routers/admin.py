import json
from urllib.error import URLError
from urllib.request import urlopen

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from web.config import backend_ai_http_url, cloudinary_status
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


async def _count_unclassified_users(db: AsyncSession) -> int | None:
    if not await _table_exists(db, "users"):
        return None
    result = await db.execute(text("select count(*) from users where role is null or role not in ('student', 'teacher', 'admin')"))
    return int(result.scalar_one())


async def _count_tracking_points_today(db: AsyncSession) -> int | None:
    if not await _table_exists(db, "tracking_points") or not await _table_exists(db, "sessions"):
        return None
    result = await db.execute(
        text(
            """
            select count(*)
            from tracking_points tp
            join sessions s on s.session_id = tp.session_id
            where coalesce(s.session_type, 'student_learning') = 'student_learning'
              and s.started_at >= date_trunc('day', now())
            """
        )
    )
    return int(result.scalar_one())


def _page_snapshot_count() -> int:
    if not PAGE_SNAPSHOT_DIR.is_dir():
        return 0
    return len(list(PAGE_SNAPSHOT_DIR.glob("page_snapshot_*.png")))


def _ai_service_status() -> dict:
    url = f"{backend_ai_http_url()}/health_check"
    try:
        with urlopen(url, timeout=1.5) as response:
            payload = json.loads(response.read().decode("utf-8"))
            return {
                "ok": 200 <= response.status < 300 and payload.get("pipeline_loaded") is True,
                "url": url,
                "pipeline_loaded": payload.get("pipeline_loaded"),
                "status": payload.get("status"),
            }
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
        course_item_join = "left join course_items ci on ci.course_item_id = s.course_item_id" if await _table_exists(db, "course_items") else ""
        course_item_title = "ci.title" if course_item_join else "null"
        result = await db.execute(
            text(
                f"""
                select
                    s.session_id,
                    s.lesson_id,
                    s.status,
                    s.course_id,
                    s.course_item_id,
                    s.pdf_lesson_id,
                    s.pdf_document_version,
                    s.user_id,
                    u.full_name,
                    u.student_code,
                    {course_item_title} as item_title,
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
                {course_item_join}
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
            "admins": await _count_users_by_role(db, "admin"),
            "unclassified_users": await _count_unclassified_users(db),
            "lessons": await _count_table(db, "lessons"),
            "sessions": await _count_official_sessions(db),
            "admin_test_sessions": await _count_admin_test_sessions(db),
            "gaze_chunks": await _count_table(db, "gaze_chunks"),
            "tracking_points": await _count_table(db, "tracking_points"),
            "tracking_points_today": await _count_tracking_points_today(db),
            "aoi_metrics": await _count_table(db, "aoi_metrics"),
            "heatmaps": await _count_table(db, "heatmaps"),
            "page_snapshots": _page_snapshot_count(),
        },
        "recent_sessions": recent_sessions,
    }
