import json
from pathlib import Path
from time import time

from fastapi import HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from web.config import configure_cloudinary, is_cloudinary_configured
from web.models import PageSnapshot

BASE_DIR = Path(__file__).resolve().parents[2]
PAGE_SNAPSHOT_DIR = BASE_DIR / "data" / "outputs" / "page_snapshots"


def safe_snapshot_name(session_id: str, suffix: str) -> str:
    safe_session = "".join(char if char.isalnum() or char in "._-" else "_" for char in session_id)
    return f"page_snapshot_{safe_session}.{suffix}"


def snapshot_paths(session_id: str) -> tuple[Path, Path]:
    return (
        PAGE_SNAPSHOT_DIR / safe_snapshot_name(session_id, "png"),
        PAGE_SNAPSHOT_DIR / safe_snapshot_name(session_id, "json"),
    )


def snapshot_url(session_id: str) -> str:
    return f"/page-snapshots/file/{safe_snapshot_name(session_id, 'png')}"


REQUIRED_METADATA_FIELDS = (
    "document_width_css", "document_height_css",
    "viewport_width", "viewport_height",
    "canvas_width", "canvas_height",
    "requested_scale", "actual_scale",
    "captured_at_ms",
)


async def save_page_snapshot(
    session_id: str,
    snapshot: UploadFile,
    metadata: str,
    db: AsyncSession,
) -> dict:
    if snapshot.content_type not in {"image/png", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="snapshot must be a PNG file")

    try:
        parsed_metadata = json.loads(metadata)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="metadata must be valid JSON") from exc

    missing_fields = [f for f in REQUIRED_METADATA_FIELDS if parsed_metadata.get(f) is None]
    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"metadata missing required fields: {', '.join(missing_fields)}",
        )

    PAGE_SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    image_path, metadata_path = snapshot_paths(session_id)
    image_bytes = await snapshot.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="snapshot file is empty")

    image_path.write_bytes(image_bytes)
    metadata_path.write_text(json.dumps(parsed_metadata, indent=2), encoding="utf-8")

    uploaded_url = None
    cloudinary_public_id = None
    if is_cloudinary_configured():
        try:
            import cloudinary.uploader

            configure_cloudinary()
            result = cloudinary.uploader.upload(
                str(image_path),
                folder="eyelearn/page_snapshots",
                public_id=image_path.stem,
                overwrite=True,
                resource_type="image",
            )
            uploaded_url = result.get("secure_url")
            cloudinary_public_id = result.get("public_id")
        except Exception as exc:
            parsed_metadata["cloudinary_error"] = str(exc)
            metadata_path.write_text(json.dumps(parsed_metadata, indent=2), encoding="utf-8")

    final_image_url = uploaded_url or snapshot_url(session_id)
    status = "done" if uploaded_url else "pending"

    # UNIQUE(session_id): nếu snapshot đã tồn tại (retry lúc finish), ghi đè thay vì lỗi
    existing = await db.execute(select(PageSnapshot).where(PageSnapshot.session_id == session_id))
    row = existing.scalar_one_or_none()

    if row is None:
        row = PageSnapshot(snapshot_id=f"SNAP_{session_id}_{int(time() * 1000)}", session_id=session_id)
        db.add(row)

    row.captured_at_ms = int(parsed_metadata["captured_at_ms"])
    row.viewport_w = int(parsed_metadata["viewport_width"])
    row.viewport_h = int(parsed_metadata["viewport_height"])
    row.document_w = int(parsed_metadata["document_width_css"])
    row.document_h = int(parsed_metadata["document_height_css"])
    row.requested_scale = float(parsed_metadata["requested_scale"])
    row.actual_scale = float(parsed_metadata["actual_scale"])
    row.canvas_w = int(parsed_metadata["canvas_width"])
    row.canvas_h = int(parsed_metadata["canvas_height"])
    row.cloudinary_public_id = cloudinary_public_id
    row.image_url = final_image_url
    row.image_url_thumbnail = final_image_url
    row.status = status
    row.error_message = parsed_metadata.get("cloudinary_error")

    await db.flush()

    return {
        "ok": True,
        "session_id": session_id,
        "snapshot_id": row.snapshot_id,
        "snapshot_path": str(image_path),
        "metadata_path": str(metadata_path),
        "snapshot_url": final_image_url,
        "cloudinary_public_id": cloudinary_public_id,
        "actual_scale": row.actual_scale,
    }
