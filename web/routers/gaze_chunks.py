from time import time
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from web.database import get_db
from web.models import AOIDefinition, GazeChunk, Session, TrackingPoint

router = APIRouter(prefix="/gaze", tags=["gaze"])


class GazePoint(BaseModel):
    t: Optional[int] = None
    timestamp_ms: Optional[int] = None
    x: Optional[float] = None
    y: Optional[float] = None
    viewport_x: Optional[float] = None
    viewport_y: Optional[float] = None
    scroll_x: float = 0
    scroll_y: float = 0
    target_zone: Optional[str] = None
    gaze_status: Optional[str] = None
    conf: Optional[float] = None
    confidence: Optional[float] = None


class GazeChunkCreate(BaseModel):
    session_id: str
    lesson_id: Optional[str] = None
    seq: int
    start_ms: int
    data: List[GazePoint] = Field(default_factory=list)
    points: List[GazePoint] = Field(default_factory=list)

    @model_validator(mode="after")
    def normalize_points(self):
        if not self.data and self.points:
            self.data = self.points
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
async def save_gaze_chunk(body: GazeChunkCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.session_id == body.session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    chunk_id = f"chunk_{body.session_id}_{body.seq}_{int(time() * 1000)}"
    raw_chunk_enabled = await _table_exists(db, "gaze_chunks")
    if raw_chunk_enabled:
        chunk = GazeChunk(
            chunk_id=chunk_id,
            session_id=body.session_id,
            seq=body.seq,
            start_ms=body.start_ms,
            data=[p.model_dump() for p in body.data],
        )
        db.add(chunk)

        try:
            await db.flush()
        except SQLAlchemyError as exc:
            raise HTTPException(
                status_code=409,
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

    inserted_points = 0
    now_ms = int(time() * 1000)
    for index, point in enumerate(body.data):
        viewport_x = point.viewport_x if point.viewport_x is not None else point.x
        viewport_y = point.viewport_y if point.viewport_y is not None else point.y
        if viewport_x is None or viewport_y is None:
            continue

        timestamp_ms = point.timestamp_ms if point.timestamp_ms is not None else point.t
        if timestamp_ms is None:
            timestamp_ms = body.start_ms + index

        db.add(
            TrackingPoint(
                point_id=f"gaze_{body.session_id}_{timestamp_ms}_{now_ms}_{body.seq}_{index}",
                session_id=body.session_id,
                aoi_id=aoi_map.get(point.target_zone) if point.target_zone else None,
                timestamp_ms=timestamp_ms,
                viewport_x=viewport_x,
                viewport_y=viewport_y,
                scroll_x=point.scroll_x,
                scroll_y=point.scroll_y,
                confidence=point.confidence if point.confidence is not None else point.conf,
                gaze_status=point.gaze_status or "gaze_chunk",
            )
        )
        inserted_points += 1

    try:
        await db.flush()
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
async def get_gaze_chunks(session_id: str, db: AsyncSession = Depends(get_db)):
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
async def check_missing_chunks(session_id: str, db: AsyncSession = Depends(get_db)):
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
