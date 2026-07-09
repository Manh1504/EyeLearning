from collections import defaultdict
from time import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from web.database import get_db
from web.models import AOIDefinition, AOIMetric, Session, TrackingPoint
from web.schemas import AOIMetricOut, AOIMetricWithAOIOut

router = APIRouter(prefix="/metrics", tags=["metrics"])

ALGORITHM_VERSION = "aoi_metrics_v2_relative_first_hit"
MAX_DWELL_STEP_MS = 1000
EPOCH_MS_THRESHOLD = 1_000_000_000_000


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


@router.post("/recalculate/{session_id}", response_model=list[AOIMetricOut])
async def recalculate_metrics(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session.session_id).where(Session.session_id == session_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    result = await db.execute(
        select(TrackingPoint)
        .where(TrackingPoint.session_id == session_id)
        .order_by(TrackingPoint.timestamp_ms)
    )
    points = list(result.scalars().all())

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


@router.get("/{session_id}", response_model=list[AOIMetricWithAOIOut])
async def get_metrics(session_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session.session_id).where(Session.session_id == session_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    result = await db.execute(
        select(AOIMetric, AOIDefinition)
        .join(AOIDefinition, AOIMetric.aoi_id == AOIDefinition.aoi_id)
        .where(AOIMetric.session_id == session_id)
        .order_by(AOIMetric.dwell_time_ms.desc(), AOIDefinition.aoi_key)
    )

    return [
        {
            "aoi_id": aoi.aoi_id,
            "aoi_key": aoi.aoi_key,
            "aoi_name": aoi.aoi_name,
            "aoi_type": aoi.aoi_type,
            "is_learning_area": aoi.is_learning_area,
            "dwell_time_ms": metric.dwell_time_ms,
            "dwell_time_pct": metric.dwell_time_pct,
            "point_count": metric.point_count,
            "first_hit_ms": metric.first_hit_ms,
            "revisit_count": metric.revisit_count,
            "calculated_at": metric.calculated_at,
            "algorithm_version": metric.algorithm_version,
        }
        for metric, aoi in result.all()
    ]
