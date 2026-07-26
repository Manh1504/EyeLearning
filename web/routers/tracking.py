from time import time
from typing import Union

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from web.database import get_db
from web.models import AOIDefinition, AOIMetric, GazeChunk, Heatmap, Session, TrackingPoint
from web.services.page_snapshot_service import snapshot_paths
from web.schemas import TrackingPointBatchOut, TrackingPointBatchRequest, TrackingPointCreate, TrackingPointOut

router = APIRouter(tags=["tracking"])
EPOCH_MS_THRESHOLD = 1_000_000_000_000


async def _table_exists(db: AsyncSession, table_name: str) -> bool:
    result = await db.execute(text("select to_regclass(:name) is not null"), {"name": f"public.{table_name}"})
    return bool(result.scalar_one())


def _as_points(body: Union[TrackingPointBatchRequest, list[TrackingPointCreate]]) -> list[TrackingPointCreate]:
    if isinstance(body, list):
        return body
    return body.points


def _point_id(session_id: str, timestamp_ms: int, index: int) -> str:
    return f"gaze_{session_id}_{timestamp_ms}_{int(time() * 1000)}_{index}"


async def _load_sessions(points: list[TrackingPointCreate], db: AsyncSession) -> dict[str, Session]:
    session_ids = {point.session_id for point in points}
    if not session_ids:
        return {}

    result = await db.execute(select(Session).where(Session.session_id.in_(session_ids)))
    sessions = {session.session_id: session for session in result.scalars().all()}
    missing = session_ids - set(sessions)
    if missing:
        raise HTTPException(status_code=404, detail=f"Session không tồn tại: {', '.join(sorted(missing))}")
    for session in sessions.values():
        if session.status == "calibrating":
            session.status = "learning"
    return sessions


async def _load_aoi_map(
    points: list[TrackingPointCreate],
    sessions: dict[str, Session],
    db: AsyncSession,
) -> dict[tuple[str, str], str]:
    lesson_ids = set()
    aoi_keys = set()

    for point in points:
        if not point.target_zone:
            continue
        lesson_id = point.lesson_id or sessions[point.session_id].lesson_id
        if lesson_id:
            lesson_ids.add(lesson_id)
            aoi_keys.add(point.target_zone)

    if not lesson_ids or not aoi_keys:
        return {}

    result = await db.execute(
        select(AOIDefinition).where(
            AOIDefinition.lesson_id.in_(lesson_ids),
            AOIDefinition.aoi_key.in_(aoi_keys),
            AOIDefinition.is_active.is_(True),
        )
    )
    return {(aoi.lesson_id, aoi.aoi_key): aoi.aoi_id for aoi in result.scalars().all()}


@router.post("/tracking/points", response_model=TrackingPointBatchOut)
async def save_tracking_points(
    body: Union[TrackingPointBatchRequest, list[TrackingPointCreate]] = Body(...),
    db: AsyncSession = Depends(get_db),
):
    points = _as_points(body)
    if not points:
        return {"inserted": 0, "points": []}

    sessions = await _load_sessions(points, db)
    aoi_map = await _load_aoi_map(points, sessions, db)

    rows = []
    for index, point in enumerate(points):
        lesson_id = point.lesson_id or sessions[point.session_id].lesson_id
        aoi_id = None
        if lesson_id and point.target_zone:
            aoi_id = aoi_map.get((lesson_id, point.target_zone))

        row = TrackingPoint(
            point_id=_point_id(point.session_id, point.timestamp_ms, index),
            session_id=point.session_id,
            aoi_id=aoi_id,
            timestamp_ms=point.timestamp_ms,
            viewport_x=point.viewport_x if point.viewport_x is not None else point.x,
            viewport_y=point.viewport_y if point.viewport_y is not None else point.y,
            scroll_x=point.scroll_x,
            scroll_y=point.scroll_y,
            confidence=point.confidence,
            gaze_status=point.gaze_status,
        )
        db.add(row)
        rows.append(row)

    try:
        await db.flush()
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not insert tracking_points: {exc.__class__.__name__}",
        )
    return {"inserted": len(rows), "points": rows}


@router.get("/sessions/{session_id}/tracking-points", response_model=list[TrackingPointOut])
async def get_session_tracking_points(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session.session_id).where(Session.session_id == session_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    result = await db.execute(
        select(TrackingPoint)
        .where(TrackingPoint.session_id == session_id)
        .order_by(TrackingPoint.timestamp_ms)
    )
    return list(result.scalars().all())


@router.get("/sessions/{session_id}/tracking-summary")
async def get_session_tracking_summary(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session.session_id).where(Session.session_id == session_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    total_result = await db.execute(
        select(
            func.count(TrackingPoint.point_id),
            func.count(TrackingPoint.aoi_id),
            func.min(TrackingPoint.timestamp_ms),
        ).where(TrackingPoint.session_id == session_id)
    )
    total_points, mapped_points, min_timestamp_ms = total_result.one()

    epoch_start_result = await db.execute(
        select(func.min(TrackingPoint.timestamp_ms)).where(
            TrackingPoint.session_id == session_id,
            TrackingPoint.timestamp_ms >= EPOCH_MS_THRESHOLD,
        )
    )
    session_start_timestamp_ms = epoch_start_result.scalar_one_or_none() or min_timestamp_ms

    by_aoi_result = await db.execute(
        select(AOIDefinition.aoi_key, func.count(TrackingPoint.point_id))
        .join(AOIDefinition, TrackingPoint.aoi_id == AOIDefinition.aoi_id)
        .where(TrackingPoint.session_id == session_id)
        .group_by(AOIDefinition.aoi_key)
        .order_by(AOIDefinition.aoi_key)
    )
    points_by_aoi = {aoi_key: count for aoi_key, count in by_aoi_result.all()}

    chunks_count = 0
    if await _table_exists(db, "gaze_chunks"):
        chunks_count = int(
            (
                await db.execute(select(func.count(GazeChunk.chunk_id)).where(GazeChunk.session_id == session_id))
            ).scalar_one()
            or 0
        )
    metrics_count = int(
        (
            await db.execute(select(func.count(AOIMetric.metric_id)).where(AOIMetric.session_id == session_id))
        ).scalar_one()
        or 0
    )
    heatmaps_count = int(
        (
            await db.execute(select(func.count(Heatmap.heatmap_id)).where(Heatmap.session_id == session_id))
        ).scalar_one()
        or 0
    )
    snapshot_image_path, snapshot_metadata_path = snapshot_paths(session_id)

    total_points = int(total_points or 0)
    mapped_points = int(mapped_points or 0)
    return {
        "session_id": session_id,
        "total_tracking_points": total_points,
        "total_points": total_points,
        "mapped_points": mapped_points,
        "outside_aoi_points": total_points - mapped_points,
        "session_start_timestamp_ms": session_start_timestamp_ms,
        "points_by_aoi": points_by_aoi,
        "gaze_chunks_count": chunks_count,
        "metrics_count": metrics_count,
        "heatmaps_count": heatmaps_count,
        "has_page_snapshot": snapshot_image_path.is_file() and snapshot_metadata_path.is_file(),
    }
