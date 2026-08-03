from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from web.database import get_db
from web.authz import current_user_from_cookie, ensure_can_read_session_analytics
from web.models import Heatmap, User
from web.schemas import HeatmapGenerateResponse, HeatmapResponse
from web.services.heatmap_service import (
    HEATMAP_DIR,
    generate_heatmap_for_session,
    get_heatmap_by_id,
    list_heatmaps_for_session,
)

router = APIRouter(prefix="/heatmaps", tags=["heatmaps"])


@router.post("/generate/{session_id}", response_model=HeatmapGenerateResponse)
async def generate_heatmap(
    session_id: str,
    aoi_key: str | None = Query(default=None),
    slide_id: str | None = Query(default=None),
    debug: bool = Query(default=False),
    mode: str | None = Query(default=None),
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await ensure_can_read_session_analytics(db, user, session_id)
    debug_overlay = debug or mode == "overlay_debug"
    return await generate_heatmap_for_session(
        db,
        session_id=session_id,
        aoi_key=aoi_key,
        slide_id=slide_id,
        debug=debug_overlay,
    )


@router.get("/{session_id}", response_model=list[HeatmapResponse])
async def get_session_heatmaps(
    session_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await ensure_can_read_session_analytics(db, user, session_id)
    return await list_heatmaps_for_session(db, session_id=session_id)


@router.get("/id/{heatmap_id}", response_model=HeatmapResponse)
async def get_heatmap(
    heatmap_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Heatmap.session_id).where(Heatmap.heatmap_id == heatmap_id))
    session_id = result.scalar_one_or_none()
    if not session_id:
        raise HTTPException(status_code=404, detail="Heatmap không tồn tại")
    await ensure_can_read_session_analytics(db, user, session_id)
    return await get_heatmap_by_id(db, heatmap_id=heatmap_id)


@router.get("/file/{filename}", include_in_schema=False)
async def get_heatmap_file(
    filename: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=400, detail="Invalid heatmap filename")

    path = (HEATMAP_DIR / safe_name).resolve()
    heatmap_root = HEATMAP_DIR.resolve()
    if heatmap_root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Heatmap file not found")

    result = await db.execute(select(Heatmap.session_id).where(Heatmap.image_url.like(f"%/{safe_name}")))
    session_id = result.scalar_one_or_none()
    if not session_id:
        raise HTTPException(status_code=404, detail="Heatmap không tồn tại")
    await ensure_can_read_session_analytics(db, user, session_id)

    return FileResponse(path, media_type="image/png")
