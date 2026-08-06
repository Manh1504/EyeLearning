from collections import defaultdict
from time import time

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from web.models import AOIMetric, TrackingPoint

ALGORITHM_VERSION = "aoi_metrics_v2_relative_first_hit"
MAX_DWELL_STEP_MS = 1000
EPOCH_MS_THRESHOLD = 1_000_000_000_000


def _is_metric_point(point: TrackingPoint) -> bool:
    metadata = point.metadata_json or {}
    if metadata.get("prediction_available") is False:
        return False
    if metadata.get("inside_viewport") is False:
        return False
    if metadata.get("is_transitioning") is True:
        return False
    if metadata.get("is_resizing") is True:
        return False
    if metadata.get("is_rendering") is True:
        return False
    if metadata.get("in_pdf_page") is False:
        return False
    if metadata.get("in_reliable_region") is False:
        return False
    return True


def _session_start_timestamp(points: list[TrackingPoint]) -> int:
    epoch_timestamps = [point.timestamp_ms for point in points if point.timestamp_ms >= EPOCH_MS_THRESHOLD]
    if epoch_timestamps:
        return min(epoch_timestamps)
    return points[0].timestamp_ms


def _count_revisits(aoi_sequence: list[str]) -> dict[str, int]:
    compressed = []
    previous = None
    for aoi_id in aoi_sequence:
        if aoi_id != previous:
            compressed.append(aoi_id)
            previous = aoi_id

    visits = defaultdict(int)
    for aoi_id in compressed:
        visits[aoi_id] += 1

    return {aoi_id: max(0, count - 1) for aoi_id, count in visits.items()}


async def calculate_aoi_metrics_for_session(db: AsyncSession, session_id: str) -> list[AOIMetric]:
    result = await db.execute(
        select(TrackingPoint)
        .where(TrackingPoint.session_id == session_id)
        .order_by(TrackingPoint.timestamp_ms)
    )
    points = [point for point in result.scalars().all() if _is_metric_point(point)]

    await db.execute(delete(AOIMetric).where(AOIMetric.session_id == session_id))

    if len(points) < 2:
        await db.flush()
        return []

    session_start_ts = _session_start_timestamp(points)
    dwell_by_aoi = defaultdict(int)
    point_count_by_aoi = defaultdict(int)
    first_hit_by_aoi = {}
    aoi_sequence = []
    total_valid_dwell_ms = 0

    for point in points:
        if point.aoi_id is None:
            continue
        point_count_by_aoi[point.aoi_id] += 1
        first_hit_by_aoi.setdefault(point.aoi_id, max(0, point.timestamp_ms - session_start_ts))
        aoi_sequence.append(point.aoi_id)

    for index, point in enumerate(points[:-1]):
        next_point = points[index + 1]
        dt = next_point.timestamp_ms - point.timestamp_ms
        if dt <= 0:
            continue

        capped_dt = min(dt, MAX_DWELL_STEP_MS)
        total_valid_dwell_ms += capped_dt

        if point.aoi_id is None:
            continue

        dwell_by_aoi[point.aoi_id] += capped_dt

    revisit_by_aoi = _count_revisits(aoi_sequence)

    rows = []
    for aoi_id in point_count_by_aoi:
        dwell_time_ms = dwell_by_aoi.get(aoi_id, 0)
        metric = AOIMetric(
            metric_id=f"METRIC_{session_id}_{aoi_id}_{int(time() * 1000)}",
            session_id=session_id,
            aoi_id=aoi_id,
            dwell_time_ms=dwell_time_ms,
            dwell_time_pct=(dwell_time_ms / total_valid_dwell_ms) if total_valid_dwell_ms else 0,
            point_count=point_count_by_aoi[aoi_id],
            first_hit_ms=first_hit_by_aoi.get(aoi_id),
            revisit_count=revisit_by_aoi.get(aoi_id, 0),
            algorithm_version=ALGORITHM_VERSION,
        )
        db.add(metric)
        rows.append(metric)

    await db.flush()
    return rows
