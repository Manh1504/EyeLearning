from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from web.config import cloudinary_status
from web.database import get_db
from web.authz import current_user_from_cookie, ensure_can_read_session_analytics, require_admin_user
from web.models import AOIMetric, GazeChunk, Heatmap, TrackingPoint, User
from web.services.page_snapshot_service import snapshot_paths

router = APIRouter(prefix="/debug", tags=["debug"])


async def _table_exists(db: AsyncSession, table_name: str) -> bool:
    result = await db.execute(text("select to_regclass(:name) is not null"), {"name": f"public.{table_name}"})
    return bool(result.scalar_one())


async def _count_table(db: AsyncSession, table_name: str) -> int | None:
    if not await _table_exists(db, table_name):
        return None
    result = await db.execute(text(f"select count(*) from {table_name}"))
    return int(result.scalar_one())


@router.get("/schema-status")
async def schema_status(user: User = Depends(current_user_from_cookie), db: AsyncSession = Depends(get_db)):
    require_admin_user(user)
    lessons_exists = await _table_exists(db, "lessons")
    lectures_exists = await _table_exists(db, "lectures")

    sample_session_id = None
    if await _table_exists(db, "sessions"):
        result = await db.execute(text("select session_id from sessions limit 1"))
        sample_session_id = result.scalar_one_or_none()

    return {
        "lessons_exists": lessons_exists,
        "lectures_exists": lectures_exists,
        "counts": {
            "lessons": await _count_table(db, "lessons"),
            "sessions": await _count_table(db, "sessions"),
            "gaze_chunks": await _count_table(db, "gaze_chunks"),
            "aoi_definitions": await _count_table(db, "aoi_definitions"),
            "tracking_points": await _count_table(db, "tracking_points"),
            "aoi_metrics": await _count_table(db, "aoi_metrics"),
            "heatmaps": await _count_table(db, "heatmaps"),
        },
        "sample_session_id": sample_session_id,
    }


@router.get("/cloudinary-status")
async def get_cloudinary_status(user: User = Depends(current_user_from_cookie)):
    require_admin_user(user)
    return cloudinary_status()


@router.get("/session-health/{session_id}")
async def session_health(
    session_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await ensure_can_read_session_analytics(db, user, session_id)
    session_exists = bool(
        (
            await db.execute(text("select exists(select 1 from sessions where session_id = :session_id)"), {"session_id": session_id})
        ).scalar_one()
    )
    if not session_exists:
        return {
            "session_id": session_id,
            "session_exists": False,
            "chunks_saved": False,
            "tracking_points_saved": False,
            "aoi_mapping_ok": False,
            "metrics_exist": False,
            "heatmaps_exist": False,
            "page_snapshot_exists": False,
            "recommended_next_action": "Session not found. Create a session from the start page.",
        }

    chunks_count = 0
    if await _table_exists(db, "gaze_chunks"):
        chunks_count = int((await db.execute(select_count(GazeChunk.chunk_id, GazeChunk.session_id, session_id))).scalar_one() or 0)
    tracking_points_count = int((await db.execute(select_count(TrackingPoint.point_id, TrackingPoint.session_id, session_id))).scalar_one() or 0)
    mapped_points_count = int(
        (
            await db.execute(
                text("select count(aoi_id) from tracking_points where session_id = :session_id"),
                {"session_id": session_id},
            )
        ).scalar_one()
        or 0
    )
    metrics_count = int((await db.execute(select_count(AOIMetric.metric_id, AOIMetric.session_id, session_id))).scalar_one() or 0)
    heatmaps_count = int((await db.execute(select_count(Heatmap.heatmap_id, Heatmap.session_id, session_id))).scalar_one() or 0)
    snapshot_image_path, snapshot_metadata_path = snapshot_paths(session_id)
    page_snapshot_exists = snapshot_image_path.is_file() and snapshot_metadata_path.is_file()

    if tracking_points_count == 0 and chunks_count > 0:
        recommended_next_action = "No tracking points. Check chunk flattening."
    elif tracking_points_count == 0:
        recommended_next_action = "No tracking points. Start gaze/mouse tracking and send points."
    elif metrics_count == 0:
        recommended_next_action = "Tracking points exist. Recalculate metrics."
    elif heatmaps_count == 0:
        recommended_next_action = "Metrics exist. Generate heatmap."
    elif not page_snapshot_exists:
        recommended_next_action = "No snapshot. Overlay heatmap will fallback to grid."
    else:
        recommended_next_action = "Session is ready for analytics demo."

    return {
        "session_id": session_id,
        "session_exists": True,
        "chunks_saved": chunks_count > 0,
        "gaze_chunks_count": chunks_count,
        "tracking_points_saved": tracking_points_count > 0,
        "tracking_points_count": tracking_points_count,
        "aoi_mapping_ok": mapped_points_count > 0,
        "mapped_points_count": mapped_points_count,
        "metrics_exist": metrics_count > 0,
        "metrics_count": metrics_count,
        "heatmaps_exist": heatmaps_count > 0,
        "heatmaps_count": heatmaps_count,
        "page_snapshot_exists": page_snapshot_exists,
        "recommended_next_action": recommended_next_action,
    }


def select_count(column, session_column, session_id: str):
    return select(func.count(column)).where(session_column == session_id)
