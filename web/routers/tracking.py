import hashlib
from typing import Union

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from web.database import get_db
from web.authz import current_user_from_cookie, ensure_can_read_session_analytics, ensure_student_owns_session
from web.models import AOIDefinition, AOIMetric, GazeChunk, Heatmap, Session, TrackingPoint, User
from web.services.page_snapshot_service import snapshot_paths
from web.schemas import TrackingPointBatchOut, TrackingPointBatchRequest, TrackingPointCreate, TrackingPointOut

router = APIRouter(tags=["tracking"])
EPOCH_MS_THRESHOLD = 1_000_000_000_000


def _is_reliable_sample(point: TrackingPoint) -> bool:
    metadata = point.metadata_json or {}
    if metadata.get("is_transitioning") is True:
        return False
    if metadata.get("in_reliable_region") is False:
        return False
    return True


def _is_content_sample(point: TrackingPoint) -> bool:
    metadata = point.metadata_json or {}
    return _is_reliable_sample(point) and metadata.get("ui_interaction") is not True


async def _table_exists(db: AsyncSession, table_name: str) -> bool:
    result = await db.execute(text("select to_regclass(:name) is not null"), {"name": f"public.{table_name}"})
    return bool(result.scalar_one())


def _as_points(body: Union[TrackingPointBatchRequest, list[TrackingPointCreate]]) -> list[TrackingPointCreate]:
    if isinstance(body, list):
        return body
    return body.points


def _point_id(point: TrackingPointCreate, session: Session, index: int) -> str:
    payload = "|".join(
        [
            point.session_id,
            str(point.timestamp_ms),
            str(index),
            str(point.viewport_x if point.viewport_x is not None else point.x),
            str(point.viewport_y if point.viewport_y is not None else point.y),
            str(point.page_number or ""),
            str(point.page_x_normalized if point.page_x_normalized is not None else ""),
            str(point.page_y_normalized if point.page_y_normalized is not None else ""),
            str(point.course_item_id or session.course_item_id or ""),
        ]
    )
    digest = hashlib.sha1(payload.encode("utf-8")).hexdigest()[:20]
    return f"gaze_{point.session_id}_{digest}"


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
        if session.session_type == "student_learning" and session.status != "learning":
            raise HTTPException(status_code=409, detail="Phiên học chưa sẵn sàng ghi dữ liệu gaze. Hãy tải hồ sơ căn chỉnh và kiểm tra nhanh trước.")
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
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    points = _as_points(body)
    if not points:
        return {"inserted": 0, "points": []}

    sessions = await _load_sessions(points, db)
    for session_id in sessions:
        await ensure_student_owns_session(db, user, session_id)
    aoi_map = await _load_aoi_map(points, sessions, db)

    row_payloads = []
    for index, point in enumerate(points):
        session = sessions[point.session_id]
        lesson_id = point.lesson_id or session.lesson_id
        aoi_id = None
        if lesson_id and point.target_zone:
            aoi_id = aoi_map.get((lesson_id, point.target_zone))

        row_payloads.append({
            "point_id": _point_id(point, session, index),
            "session_id": point.session_id,
            "user_id": point.user_id or session.user_id,
            "aoi_id": aoi_id,
            "course_id": point.course_id or session.course_id,
            "course_item_id": point.course_item_id or session.course_item_id,
            "pdf_lesson_id": point.pdf_lesson_id or session.pdf_lesson_id,
            "pdf_document_version": getattr(point, "pdf_document_version", None) or session.pdf_document_version,
            "test_id": point.test_id or session.test_id,
            "module_id": point.module_id or session.module_id,
            "activity_id": point.activity_id or session.activity_id,
            "content_version_id": point.content_version_id or session.content_version_id,
            "stimulus_id": point.stimulus_id,
            "timestamp_ms": point.timestamp_ms,
            "viewport_x": point.viewport_x if point.viewport_x is not None else point.x,
            "viewport_y": point.viewport_y if point.viewport_y is not None else point.y,
            "scroll_x": point.scroll_x,
            "scroll_y": point.scroll_y,
            "stimulus_x_norm": point.stimulus_x_norm,
            "stimulus_y_norm": point.stimulus_y_norm,
            "stimulus_left": point.stimulus_left,
            "stimulus_top": point.stimulus_top,
            "stimulus_width": point.stimulus_width,
            "stimulus_height": point.stimulus_height,
            "tracking_quality": point.tracking_quality,
            "screen_x": point.screen_x,
            "screen_y": point.screen_y,
            "viewport_width": point.viewport_width,
            "viewport_height": point.viewport_height,
            "page_number": point.page_number,
            "page_x_normalized": point.page_x_normalized,
            "page_y_normalized": point.page_y_normalized,
            "page_display_width": point.page_display_width,
            "page_display_height": point.page_display_height,
            "device_pixel_ratio": point.device_pixel_ratio,
            "zoom": point.zoom,
            "fullscreen": point.fullscreen,
            "confidence": point.confidence,
            "gaze_status": point.gaze_status,
            "metadata_json": point.metadata_json,
        })

    try:
        statement = insert(TrackingPoint).values(row_payloads)
        statement = statement.on_conflict_do_nothing(index_elements=[TrackingPoint.point_id]).returning(TrackingPoint)
        result = await db.execute(statement)
        inserted_rows = list(result.scalars().all())
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not insert tracking_points: {exc.__class__.__name__}",
        )
    return {"inserted": len(inserted_rows), "points": inserted_rows}


@router.get("/sessions/{session_id}/tracking-points", response_model=list[TrackingPointOut])
async def get_session_tracking_points(
    session_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await ensure_can_read_session_analytics(db, user, session_id)

    result = await db.execute(
        select(TrackingPoint)
        .where(TrackingPoint.session_id == session_id)
        .order_by(TrackingPoint.timestamp_ms)
    )
    return list(result.scalars().all())


@router.get("/sessions/{session_id}/tracking-summary")
async def get_session_tracking_summary(
    session_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await ensure_can_read_session_analytics(db, user, session_id)
    result = await db.execute(select(Session.session_id).where(Session.session_id == session_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    total_result = await db.execute(
        select(
            func.count(TrackingPoint.point_id),
            func.min(TrackingPoint.timestamp_ms),
        ).where(TrackingPoint.session_id == session_id)
    )
    total_points, min_timestamp_ms = total_result.one()

    epoch_start_result = await db.execute(
        select(func.min(TrackingPoint.timestamp_ms)).where(
            TrackingPoint.session_id == session_id,
            TrackingPoint.timestamp_ms >= EPOCH_MS_THRESHOLD,
        )
    )
    session_start_timestamp_ms = epoch_start_result.scalar_one_or_none() or min_timestamp_ms

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

    points_result = await db.execute(select(TrackingPoint).where(TrackingPoint.session_id == session_id))
    all_points = list(points_result.scalars().all())
    reliable_point_rows = [point for point in all_points if _is_reliable_sample(point)]
    reliable_points = len(reliable_point_rows)
    content_points = sum(1 for point in all_points if _is_content_sample(point))
    mapped_points = sum(1 for point in reliable_point_rows if point.aoi_id)
    aoi_ids = {point.aoi_id for point in reliable_point_rows if point.aoi_id}
    aoi_key_by_id = {}
    if aoi_ids:
        aoi_result = await db.execute(select(AOIDefinition.aoi_id, AOIDefinition.aoi_key).where(AOIDefinition.aoi_id.in_(aoi_ids)))
        aoi_key_by_id = {aoi_id: aoi_key for aoi_id, aoi_key in aoi_result.all()}
    points_by_aoi = {}
    for point in reliable_point_rows:
        aoi_key = aoi_key_by_id.get(point.aoi_id)
        if aoi_key:
            points_by_aoi[aoi_key] = points_by_aoi.get(aoi_key, 0) + 1
    total_points = int(total_points or 0)
    return {
        "session_id": session_id,
        "total_tracking_points": total_points,
        "total_points": total_points,
        "mapped_points": mapped_points,
        "outside_aoi_points": max(0, reliable_points - mapped_points),
        "valid_gaze_samples": reliable_points,
        "content_gaze_samples": content_points,
        "tracking_coverage": (reliable_points / total_points) if total_points else 0,
        "session_start_timestamp_ms": session_start_timestamp_ms,
        "points_by_aoi": points_by_aoi,
        "gaze_chunks_count": chunks_count,
        "metrics_count": metrics_count,
        "heatmaps_count": heatmaps_count,
        "has_page_snapshot": snapshot_image_path.is_file() and snapshot_metadata_path.is_file(),
    }
