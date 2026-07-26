from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from web.database import get_db
from web.services.page_snapshot_service import PAGE_SNAPSHOT_DIR, save_page_snapshot

router = APIRouter(tags=["page-snapshots"])


@router.post("/page-snapshot/{session_id}")
async def create_page_snapshot(
    session_id: str,
    snapshot: UploadFile = File(...),
    metadata: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    return await save_page_snapshot(session_id=session_id, snapshot=snapshot, metadata=metadata, db=db)


@router.get("/page-snapshots/file/{filename}", include_in_schema=False)
async def get_page_snapshot_file(filename: str):
    safe_name = Path(filename).name
    if safe_name != filename:
        raise HTTPException(status_code=400, detail="Invalid snapshot filename")

    path = (PAGE_SNAPSHOT_DIR / safe_name).resolve()
    snapshot_root = PAGE_SNAPSHOT_DIR.resolve()
    if snapshot_root not in path.parents or not path.is_file():
        raise HTTPException(status_code=404, detail="Snapshot file not found")

    media_type = "image/png" if path.suffix.lower() == ".png" else "application/json"
    return FileResponse(path, media_type=media_type)
