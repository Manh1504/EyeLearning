from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from web.database import get_db
from web.authz import current_user_from_cookie, ensure_can_read_session_analytics
from web.models import AOIDefinition, AOIMetric, Session, User
from web.schemas import AOIMetricOut, AOIMetricWithAOIOut
from web.services.metrics_service import calculate_aoi_metrics_for_session

router = APIRouter(prefix="/metrics", tags=["metrics"])

@router.post("/recalculate/{session_id}", response_model=list[AOIMetricOut])
async def recalculate_metrics(
    session_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await ensure_can_read_session_analytics(db, user, session_id)
    result = await db.execute(select(Session.session_id).where(Session.session_id == session_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    return await calculate_aoi_metrics_for_session(db, session_id)


@router.get("/{session_id}", response_model=list[AOIMetricWithAOIOut])
async def get_metrics(
    session_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await ensure_can_read_session_analytics(db, user, session_id)
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
