from typing import Optional
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from web.database import get_db
from web.authz import current_user_from_cookie, ensure_can_read_session_analytics, ensure_student_owns_session
from web.models import AOIDefinition, GazeChunk, Session, TrackingPoint, User
from web.schemas import TrackingPointCreate
from web.services.tracking_ingestion import tracking_point_payload

router = APIRouter(prefix="/gaze", tags=["gaze"])
logger = logging.getLogger(__name__)


class GazeChunkCreate(BaseModel):
    session_id: str
    lesson_id: Optional[str] = None
    seq: int
    start_ms: int
    data: list[TrackingPointCreate] = Field(default_factory=list)
    points: list[TrackingPointCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def normalize_points(self):
        if not self.data and self.points:
            self.data = self.points
        for point in self.data:
            if point.session_id != self.session_id:
                raise ValueError("Mọi gaze point phải thuộc cùng session với chunk")
        return self


class GazeChunkOut(BaseModel):
    chunk_id: str
    session_id: str
    seq: int
    start_ms: int
    n_points: int
    tracking_points_inserted: int = 0


async def _table_exists(db: AsyncSession, table_name: str) -> bool:
    result = await db.execute(text("select to_regclass(:name) is not null"), {"name": f"public.{table_name}"})
    return bool(result.scalar_one())


@router.post("/chunks", response_model=GazeChunkOut, summary="Lưu 1 batch gaze data raw backup")
async def save_gaze_chunk(
    body: GazeChunkCreate,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Session).where(Session.session_id == body.session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")
    await ensure_student_owns_session(db, user, body.session_id)

    if session.session_type == "student_learning" and session.status != "learning":
        raise HTTPException(status_code=409, detail="Phiên học chưa sẵn sàng ghi dữ liệu gaze. Hãy tải hồ sơ căn chỉnh và kiểm tra nhanh trước.")

    chunk_id = f"chunk_{body.session_id}_{body.seq}"
    raw_chunk_enabled = await _table_exists(db, "gaze_chunks")
    if raw_chunk_enabled:
        statement = (
            insert(GazeChunk)
            .values(
                chunk_id=chunk_id,
                session_id=body.session_id,
                seq=body.seq,
                start_ms=body.start_ms,
                data=[p.model_dump() for p in body.data],
            )
            .on_conflict_do_nothing(index_elements=[GazeChunk.session_id, GazeChunk.seq])
        )

        try:
            await db.execute(statement)
        except SQLAlchemyError as exc:
            logger.exception("Could not save gaze chunk session_id=%s seq=%s", body.session_id, body.seq)
            raise HTTPException(
                status_code=500,
                detail=f"Could not save gaze chunk seq={body.seq}: {exc.__class__.__name__}",
            )

    target_zones = {point.target_zone for point in body.data if point.target_zone}
    aoi_map = {}
    if target_zones:
        result = await db.execute(
            select(AOIDefinition).where(
                AOIDefinition.lesson_id == session.lesson_id,
                AOIDefinition.aoi_key.in_(target_zones),
                AOIDefinition.is_active.is_(True),
            )
        )
        aoi_map = {aoi.aoi_key: aoi.aoi_id for aoi in result.scalars().all()}

    row_payloads = []
    for index, point in enumerate(body.data):
        viewport_x = point.viewport_x if point.viewport_x is not None else point.x
        viewport_y = point.viewport_y if point.viewport_y is not None else point.y
        if viewport_x is None or viewport_y is None:
            continue

        timestamp_ms = point.timestamp_ms if point.timestamp_ms is not None else point.t
        if timestamp_ms is None:
            timestamp_ms = body.start_ms + index

        payload = tracking_point_payload(
            point,
            session,
            point_id=f"gaze_{body.session_id}_{body.seq}_{index}",
            aoi_id=aoi_map.get(point.target_zone) if point.target_zone else None,
        )
        payload["gaze_status"] = payload["gaze_status"] or "gaze_chunk"
        row_payloads.append(payload)

    try:
        inserted_points = 0
        if row_payloads:
            statement = insert(TrackingPoint).values(row_payloads)
            statement = statement.on_conflict_do_nothing(index_elements=[TrackingPoint.point_id])
            result = await db.execute(statement)
            inserted_points = int(result.rowcount or 0)
    except SQLAlchemyError as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not flatten gaze chunk into tracking_points: {exc.__class__.__name__}",
        )

    return {
        "chunk_id": chunk_id,
        "session_id": body.session_id,
        "seq": body.seq,
        "start_ms": body.start_ms,
        "n_points": len(body.data),
        "tracking_points_inserted": inserted_points,
    }


@router.get("/chunks/{session_id}", summary="Lấy toàn bộ gaze chunks của 1 session")
async def get_gaze_chunks(
    session_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await ensure_can_read_session_analytics(db, user, session_id)
    result = await db.execute(
        select(GazeChunk)
        .where(GazeChunk.session_id == session_id)
        .order_by(GazeChunk.seq)
    )
    chunks = result.scalars().all()

    if not chunks:
        raise HTTPException(status_code=404, detail="Không có gaze data cho session này")

    all_points = []
    for chunk in chunks:
        for point in chunk.data:
            all_points.append({"seq": chunk.seq, "start_ms": chunk.start_ms, **point})

    return {
        "session_id": session_id,
        "n_chunks": len(chunks),
        "n_points": len(all_points),
        "points": all_points,
    }


@router.get("/chunks/{session_id}/missing", summary="Kiểm tra chunk nào bị mất")
async def check_missing_chunks(
    session_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await ensure_can_read_session_analytics(db, user, session_id)
    result = await db.execute(
        select(GazeChunk.seq)
        .where(GazeChunk.session_id == session_id)
        .order_by(GazeChunk.seq)
    )
    seqs = [row[0] for row in result.fetchall()]

    if not seqs:
        return {"missing": [], "total_received": 0}

    expected = set(range(seqs[0], seqs[-1] + 1))
    received = set(seqs)
    missing = sorted(expected - received)

    return {
        "total_received": len(seqs),
        "total_expected": len(expected),
        "missing_count": len(missing),
        "missing": missing,
    }
