import json
from pathlib import Path

from fastapi import HTTPException, UploadFile

from web.config import configure_cloudinary, is_cloudinary_configured

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


async def save_page_snapshot(session_id: str, snapshot: UploadFile, metadata: str) -> dict:
    if snapshot.content_type not in {"image/png", "application/octet-stream"}:
        raise HTTPException(status_code=400, detail="snapshot must be a PNG file")

    try:
        parsed_metadata = json.loads(metadata)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="metadata must be valid JSON") from exc

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

    return {
        "ok": True,
        "session_id": session_id,
        "snapshot_path": str(image_path),
        "metadata_path": str(metadata_path),
        "snapshot_url": uploaded_url or snapshot_url(session_id),
        "cloudinary_public_id": cloudinary_public_id,
    }
