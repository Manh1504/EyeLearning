import logging
import json
import re
from datetime import datetime, timezone
from pathlib import Path

from fastapi import HTTPException
from sqlalchemy import distinct, select
from sqlalchemy.ext.asyncio import AsyncSession

from web.config import DATA_DIR, configure_cloudinary, is_cloudinary_configured
from web.models import AOIDefinition, Heatmap, Session, TrackingPoint
from web.services.page_snapshot_service import snapshot_paths, snapshot_url

logger = logging.getLogger(__name__)

HEATMAP_DIR = DATA_DIR / "outputs" / "heatmaps"
MAX_IMAGE_W = 2400
MAX_IMAGE_H = 1800
MIN_IMAGE_W = 800
MIN_IMAGE_H = 600
PADDING = 120
MAX_SLIDE_PREVIEW_POINTS = 500


def _safe_slug(value: str | None) -> str:
    if not value:
        return "all"
    return re.sub(r"[^A-Za-z0-9_.-]+", "_", value).strip("_") or "all"


def _heatmap_id(session_id: str, aoi_key: str | None, slide_id: str | None = None) -> str:
    parts = [_safe_slug(session_id)]
    if slide_id:
        parts.append(f"slide_{_safe_slug(slide_id)}")
    parts.append(_safe_slug(aoi_key))
    return f"HEATMAP_{'_'.join(parts)}_{int(datetime.now(timezone.utc).timestamp() * 1000)}"


async def _load_points(
    db: AsyncSession,
    session_id: str,
    aoi_key: str | None,
    slide_id: str | None = None,
) -> list[TrackingPoint]:
    query = select(TrackingPoint).where(TrackingPoint.session_id == session_id)
    if aoi_key:
        query = query.join(AOIDefinition, TrackingPoint.aoi_id == AOIDefinition.aoi_id).where(
            AOIDefinition.aoi_key == aoi_key
        )
    if slide_id:
        query = query.where(TrackingPoint.metadata_json["slide_id"].astext == slide_id)

    result = await db.execute(query.order_by(TrackingPoint.timestamp_ms))
    points = list(result.scalars().all())
    return [point for point in points if _is_heatmap_point(point, slide_mode=bool(slide_id))]


def _metadata_bool(metadata: dict, key: str) -> bool | None:
    value = metadata.get(key)
    return value if isinstance(value, bool) else None


def _is_heatmap_point(point: TrackingPoint, slide_mode: bool = False) -> bool:
    metadata = point.metadata_json or {}
    if _metadata_bool(metadata, "is_transitioning") is True:
        return False
    if _metadata_bool(metadata, "in_reliable_region") is False:
        return False
    if slide_mode:
        if _metadata_bool(metadata, "in_slide_canvas") is not True:
            return False
        if _metadata_bool(metadata, "ui_interaction") is True:
            return False
        if metadata.get("slide_x_norm") is None or metadata.get("slide_y_norm") is None:
            return False
    return True


def _image_url(filename: str) -> str:
    return f"/heatmaps/file/{filename}"


def _density_overlay(width: int, height: int, image_points: list[tuple[int, int, float | None]], radius: int):
    from PIL import Image, ImageDraw, ImageFilter

    density = Image.new("L", (width, height), 0)
    draw = ImageDraw.Draw(density)
    for x, y, confidence in image_points:
        weight = int(80 + 120 * max(0.0, min(1.0, confidence if confidence is not None else 0.75)))
        draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=weight)

    density = density.filter(ImageFilter.GaussianBlur(radius=max(10, radius // 2)))
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    overlay_pixels = overlay.load()
    density_pixels = density.load()

    for y in range(height):
        for x in range(width):
            value = density_pixels[x, y]
            if value < 10:
                continue
            if value < 90:
                color = (34, 197, 94)
            elif value < 170:
                color = (250, 204, 21)
            else:
                color = (239, 68, 68)
            overlay_pixels[x, y] = (*color, min(190, int(value * 1.15)))
    return overlay


def _upload_to_cloudinary(path: Path, public_id: str) -> tuple[str | None, str | None, str | None, str | None]:
    configured = is_cloudinary_configured()
    logger.info("Cloudinary configured: %s", configured)
    if not configured:
        return None, None, None, None

    try:
        import cloudinary.uploader

        configure_cloudinary()
        logger.info("Cloudinary upload attempted public_id=%s", public_id)
        result = cloudinary.uploader.upload(
            str(path),
            folder="eyelearn/heatmaps",
            public_id=public_id,
            overwrite=True,
            resource_type="image",
        )
    except Exception as exc:
        logger.warning("Cloudinary upload failed: %s", exc)
        return None, None, None, str(exc)

    secure_url = result.get("secure_url")
    uploaded_public_id = result.get("public_id")
    logger.info("Cloudinary upload success public_id=%s", uploaded_public_id)
    return secure_url, secure_url, uploaded_public_id, None


def _render_heatmap(points: list[TrackingPoint], output_path: Path) -> dict:
    try:
        from PIL import Image, ImageDraw, ImageFilter
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail="Pillow is required to generate heatmap images. Run: uv pip install -r web/requirements.txt",
        ) from exc

    doc_points = [
        (
            max(0.0, float(point.viewport_x or 0) + float(point.scroll_x or 0)),
            max(0.0, float(point.viewport_y or 0) + float(point.scroll_y or 0)),
            point.confidence,
        )
        for point in points
    ]

    max_x = max(x for x, _, _ in doc_points) + PADDING
    max_y = max(y for _, y, _ in doc_points) + PADDING
    raw_w = max(MIN_IMAGE_W, int(max_x))
    raw_h = max(MIN_IMAGE_H, int(max_y))
    scale = min(MAX_IMAGE_W / raw_w, MAX_IMAGE_H / raw_h, 1.0)
    width = max(MIN_IMAGE_W, int(raw_w * scale))
    height = max(MIN_IMAGE_H, int(raw_h * scale))

    background = Image.new("RGB", (width, height), "#f8fafc")
    grid = ImageDraw.Draw(background)
    for x in range(0, width, 80):
        grid.line((x, 0, x, height), fill="#e2e8f0")
    for y in range(0, height, 80):
        grid.line((0, y, width, y), fill="#e2e8f0")

    radius = max(24, int(48 * max(scale, 0.5)))
    image_points = [(int(x * scale), int(y * scale), confidence) for x, y, confidence in doc_points]
    overlay = _density_overlay(width, height, image_points, radius)

    image = background.convert("RGBA")
    image.alpha_composite(overlay)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(output_path, "PNG", optimize=True)

    return {
        "width": width,
        "height": height,
        "raw_width": raw_w,
        "raw_height": raw_h,
        "scale": scale,
        "coordinate_space": "document_css_px",
        "source": "tracking_points",
        "renderer": "pillow_density_v1",
    }


def _render_slide_heatmap(points: list[TrackingPoint], output_path: Path, slide_id: str) -> dict:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail="Pillow is required to generate heatmap images. Run: uv pip install -r web/requirements.txt",
        ) from exc

    width = 1200
    height = 675
    background = Image.new("RGB", (width, height), "#ffffff")
    draw = ImageDraw.Draw(background)
    font = ImageFont.load_default()

    draw.rectangle((0, 0, width - 1, height - 1), outline="#d7e2ea", width=2)
    safe_x = int(width * 0.1)
    safe_y = int(height * 0.08)
    draw.rectangle((safe_x, safe_y, width - safe_x, height - safe_y), outline="#e7eef3", width=1)
    draw.text((safe_x, safe_y - 18), f"Slide: {slide_id}", fill="#64748b", font=font)

    image_points = []
    slide_preview_points = []
    skipped = 0
    for point in points:
        metadata = point.metadata_json or {}
        x_norm = metadata.get("slide_x_norm")
        y_norm = metadata.get("slide_y_norm")
        if x_norm is None or y_norm is None:
            skipped += 1
            continue
        x = max(0.0, min(1.0, float(x_norm)))
        y = max(0.0, min(1.0, float(y_norm)))
        image_points.append((int(x * width), int(y * height), point.confidence))
        slide_preview_points.append(
            {
                "x": round(x, 4),
                "y": round(y, 4),
                "confidence": point.confidence,
                "timestamp_ms": point.timestamp_ms,
            }
        )

    if not image_points:
        raise HTTPException(status_code=422, detail="No slide-normalized tracking points found for this slide.")

    overlay = _density_overlay(width, height, image_points, radius=38)
    image = background.convert("RGBA")
    image.alpha_composite(overlay)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(output_path, "PNG", optimize=True)

    if len(slide_preview_points) > MAX_SLIDE_PREVIEW_POINTS:
        step = max(1, len(slide_preview_points) // MAX_SLIDE_PREVIEW_POINTS)
        slide_preview_points = slide_preview_points[::step][:MAX_SLIDE_PREVIEW_POINTS]

    return {
        "overlay_mode": False,
        "slide_mode": True,
        "slide_id": slide_id,
        "width": width,
        "height": height,
        "coordinate_space": "slide_canvas_normalized",
        "source": "tracking_points.metadata_json",
        "renderer": "pillow_slide_density_v1",
        "point_count": len(image_points),
        "slide_preview_points": slide_preview_points,
        "skipped_points_without_slide_coordinates": skipped,
    }


def _snapshot_exists(session_id: str) -> bool:
    image_path, metadata_path = snapshot_paths(session_id)
    return image_path.is_file() and metadata_path.is_file()


def _render_overlay_heatmap(
    session_id: str,
    points: list[TrackingPoint],
    output_path: Path,
    debug: bool = False,
) -> dict | None:
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError as exc:
        raise HTTPException(
            status_code=500,
            detail="Pillow is required to generate heatmap images. Run: uv pip install -r web/requirements.txt",
        ) from exc

    snapshot_image_path, snapshot_metadata_path = snapshot_paths(session_id)
    if not snapshot_image_path.is_file() or not snapshot_metadata_path.is_file():
        return None

    metadata = json.loads(snapshot_metadata_path.read_text(encoding="utf-8"))
    background = Image.open(snapshot_image_path).convert("RGBA")
    width, height = background.size
    document_width_css = float(metadata.get("document_width_css") or 0)
    document_height_css = float(metadata.get("document_height_css") or 0)
    if document_width_css <= 0 or document_height_css <= 0:
        return None

    scale_x = width / document_width_css
    scale_y = height / document_height_css
    image_points = []
    for point in points:
        document_x = float(point.viewport_x or 0) + float(point.scroll_x or 0)
        document_y = float(point.viewport_y or 0) + float(point.scroll_y or 0)
        image_x = int(document_x * scale_x)
        image_y = int(document_y * scale_y)
        if 0 <= image_x < width and 0 <= image_y < height:
            image_points.append((image_x, image_y, point.confidence))

    radius = max(18, int(42 * ((scale_x + scale_y) / 2)))
    overlay = _density_overlay(width, height, image_points, radius)
    background.alpha_composite(overlay)

    if debug:
        draw = ImageDraw.Draw(background)
        font = ImageFont.load_default()
        for x, y, _ in image_points:
            draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=(239, 68, 68, 220))
        for box in metadata.get("aoi_boxes", []):
            x1 = int(float(box.get("document_x_min", 0)) * scale_x)
            y1 = int(float(box.get("document_y_min", 0)) * scale_y)
            x2 = int(float(box.get("document_x_max", 0)) * scale_x)
            y2 = int(float(box.get("document_y_max", 0)) * scale_y)
            label = str(box.get("aoi_key", "aoi"))
            draw.rectangle((x1, y1, x2, y2), outline=(37, 99, 235, 230), width=3)
            draw.text((x1 + 4, y1 + 4), label, fill=(15, 23, 42, 255), font=font)

        debug_lines = [
            f"document_width_css={document_width_css}",
            f"document_height_css={document_height_css}",
            f"snapshot_image_width={width}",
            f"snapshot_image_height={height}",
            f"scale_x={scale_x:.4f}",
            f"scale_y={scale_y:.4f}",
            f"device_pixel_ratio={metadata.get('device_pixel_ratio')}",
            f"visual_viewport_scale={metadata.get('visual_viewport_scale')}",
        ]
        draw.rectangle((10, 10, 360, 10 + 18 * len(debug_lines)), fill=(255, 255, 255, 210))
        for index, line in enumerate(debug_lines):
            draw.text((18, 18 + index * 18), line, fill=(15, 23, 42, 255), font=font)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    background.convert("RGB").save(output_path, "PNG", optimize=True)
    return {
        "overlay_mode": True,
        "debug_overlay": debug,
        "document_width_css": document_width_css,
        "document_height_css": document_height_css,
        "snapshot_image_width": width,
        "snapshot_image_height": height,
        "scale_x": scale_x,
        "scale_y": scale_y,
        "coordinate_space": "document_css_px",
        "source": "tracking_points",
        "renderer": "pillow_overlay_v1",
        "point_count": len(image_points),
    }


async def generate_heatmap_for_session(
    db: AsyncSession,
    session_id: str,
    aoi_key: str | None = None,
    slide_id: str | None = None,
    debug: bool = False,
) -> Heatmap:
    result = await db.execute(select(Session.session_id).where(Session.session_id == session_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    now = datetime.now(timezone.utc)
    heatmap = Heatmap(
        heatmap_id=_heatmap_id(session_id, aoi_key, slide_id=slide_id),
        session_id=session_id,
        aoi_key=aoi_key,
        status="pending",
        point_count=0,
        generated_at=now,
        metadata_json={"source": "tracking_points", "slide_id": slide_id},
    )
    db.add(heatmap)
    await db.flush()

    points = await _load_points(db, session_id, aoi_key, slide_id=slide_id)
    if not points:
        heatmap.status = "failed"
        heatmap.error_message = "No tracking_points found for this session/slide/AOI."
        heatmap.generated_at = datetime.now(timezone.utc)
        await db.flush()
        return heatmap

    overlay_available = _snapshot_exists(session_id) and not slide_id
    prefix = "heatmap_overlay_debug" if debug else "heatmap_overlay"
    if slide_id:
        filename = f"heatmap_slide_{_safe_slug(session_id)}_{_safe_slug(slide_id)}_{_safe_slug(aoi_key)}.png"
    elif overlay_available:
        filename = f"{prefix}_{_safe_slug(session_id)}_{_safe_slug(aoi_key)}.png"
    else:
        filename = f"heatmap_{_safe_slug(session_id)}_{_safe_slug(aoi_key)}.png"
    output_path = HEATMAP_DIR / filename
    if slide_id:
        metadata = _render_slide_heatmap(points, output_path, slide_id=slide_id)
    else:
        metadata = _render_overlay_heatmap(session_id, points, output_path, debug=debug) if overlay_available else None
    if metadata is None:
        metadata = _render_heatmap(points, output_path)
        metadata["overlay_mode"] = False
        if overlay_available:
            metadata["overlay_fallback_reason"] = "Snapshot metadata was invalid."
        else:
            metadata["overlay_fallback_reason"] = "No page snapshot found."

    public_id = f"{Path(filename).stem}"

    cloud_url, thumbnail_url, cloudinary_public_id, cloudinary_error = _upload_to_cloudinary(output_path, public_id)
    if cloudinary_error:
        metadata["cloudinary_error"] = cloudinary_error

    heatmap.status = "done"
    heatmap.error_message = None
    heatmap.point_count = len(points)
    heatmap.generated_at = datetime.now(timezone.utc)
    heatmap.image_url = cloud_url or _image_url(filename)
    heatmap.image_url_thumbnail = thumbnail_url or heatmap.image_url
    heatmap.cloudinary_public_id = cloudinary_public_id
    heatmap.background_image_url = snapshot_url(session_id) if metadata.get("overlay_mode") else None
    heatmap.metadata_json = metadata
    await db.flush()
    return heatmap


async def list_heatmaps_for_session(db: AsyncSession, session_id: str) -> list[Heatmap]:
    result = await db.execute(select(Session.session_id).where(Session.session_id == session_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    result = await db.execute(
        select(Heatmap)
        .where(Heatmap.session_id == session_id)
        .order_by(Heatmap.generated_at.desc(), Heatmap.heatmap_id.desc())
    )
    return list(result.scalars().all())


async def generate_slide_heatmaps_for_session(db: AsyncSession, session_id: str) -> list[Heatmap]:
    result = await db.execute(select(Session.session_id).where(Session.session_id == session_id))
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    result = await db.execute(
        select(distinct(TrackingPoint.metadata_json["slide_id"].astext))
        .where(TrackingPoint.session_id == session_id)
        .where(TrackingPoint.metadata_json["slide_id"].astext.is_not(None))
    )
    slide_ids = sorted(slide_id for slide_id in result.scalars().all() if slide_id)

    heatmaps = []
    for slide_id in slide_ids:
        heatmap = await generate_heatmap_for_session(db, session_id=session_id, slide_id=slide_id)
        if heatmap.status == "done":
            heatmaps.append(heatmap)
    return heatmaps


async def get_heatmap_by_id(db: AsyncSession, heatmap_id: str) -> Heatmap:
    result = await db.execute(select(Heatmap).where(Heatmap.heatmap_id == heatmap_id))
    heatmap = result.scalar_one_or_none()
    if not heatmap:
        raise HTTPException(status_code=404, detail="Heatmap không tồn tại")
    return heatmap
