from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional
from uuid import UUID

from database import get_db
from models import GazeChunk, Session

router = APIRouter(prefix="/gaze", tags=["gaze"])


# ─── Schemas ──────────────────────────────────────────────────

class GazePoint(BaseModel):
    t:    int    # offset trong chunk (ms)
    x:    float  # normalized 0.0–1.0
    y:    float  # normalized 0.0–1.0
    conf: Optional[float] = None  # confidence nếu có

class GazeChunkCreate(BaseModel):
    session_id: UUID
    seq:        int    # số thứ tự chunk — để detect mất data
    start_ms:   int    # offset từ đầu session (ms)
    data:       List[GazePoint]

class GazeChunkOut(BaseModel):
    id:         UUID
    session_id: UUID
    seq:        int
    start_ms:   int
    n_points:   int    # số điểm trong chunk

    class Config:
        from_attributes = True


# ─── Endpoints ────────────────────────────────────────────────

@router.post("/chunks", response_model=GazeChunkOut, summary="Lưu 1 batch gaze data (mỗi 5 giây)")
async def save_gaze_chunk(body: GazeChunkCreate, db: AsyncSession = Depends(get_db)):

    # Kiểm tra session tồn tại và đang học
    result = await db.execute(select(Session).where(Session.id == body.session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")
    if session.status not in ("calibrating", "learning", "finished"):
        raise HTTPException(status_code=400, detail=f"Session đang ở trạng thái '{session.status}', chưa thể ghi gaze data")

    # Serialize data thành list of dict để lưu JSONB
    data_json = [p.model_dump() for p in body.data]

    chunk = GazeChunk(
        session_id=body.session_id,
        seq=body.seq,
        start_ms=body.start_ms,
        data=data_json,
    )
    db.add(chunk)

    try:
        await db.flush()
    except Exception:
        raise HTTPException(
            status_code=409,
            detail=f"Chunk seq={body.seq} đã tồn tại cho session này"
        )

    return GazeChunkOut(
        id=chunk.id,
        session_id=chunk.session_id,
        seq=chunk.seq,
        start_ms=chunk.start_ms,
        n_points=len(body.data),
    )


@router.get("/chunks/{session_id}", summary="Lấy toàn bộ gaze chunks của 1 session")
async def get_gaze_chunks(session_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(GazeChunk)
        .where(GazeChunk.session_id == session_id)
        .order_by(GazeChunk.seq)
    )
    chunks = result.scalars().all()

    if not chunks:
        raise HTTPException(status_code=404, detail="Không có gaze data cho session này")

    # Flatten toàn bộ điểm gaze, kèm thông tin chunk
    all_points = []
    for chunk in chunks:
        for point in chunk.data:
            all_points.append({
                "seq":      chunk.seq,
                "start_ms": chunk.start_ms,
                **point,
            })

    return {
        "session_id": session_id,
        "n_chunks":   len(chunks),
        "n_points":   len(all_points),
        "points":     all_points,
    }


@router.get("/chunks/{session_id}/missing", summary="Kiểm tra chunk nào bị mất")
async def check_missing_chunks(session_id: UUID, db: AsyncSession = Depends(get_db)):
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
    missing  = sorted(expected - received)

    return {
        "total_received": len(seqs),
        "total_expected": len(expected),
        "missing_count":  len(missing),
        "missing":        missing,
    }