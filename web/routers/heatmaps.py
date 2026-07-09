from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from web.database import get_db
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
    debug: bool = Query(default=False),
    mode: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
):
    debug_overlay = debug or mode == "overlay_debug"
    return await generate_heatmap_for_session(db, session_id=session_id, aoi_key=aoi_key, debug=debug_overlay)


@router.get("/{session_id}", response_model=list[HeatmapResponse])
async def get_session_heatmaps(session_id: str, db: AsyncSession = Depends(get_db)):
    return await list_heatmaps_for_session(db, session_id=session_id)


@router.get("/id/{heatmap_id}", response_model=HeatmapResponse)
async def get_heatmap(heatmap_id: str, db: AsyncSession = Depends(get_db)):
    return await get_heatmap_by_id(db, heatmap_id=heatmap_id)


@router.get("/file/{filename}", include_in_schema=False)
async def get_heatmap_file(filename: str):
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=400, detail="Invalid heatmap filename")

    path = (HEATMAP_DIR / safe_name).resolve()
    heatmap_root = HEATMAP_DIR.resolve()
    if heatmap_root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Heatmap file not found")

    return FileResponse(path, media_type="image/png")
