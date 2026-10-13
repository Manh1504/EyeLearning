"""Trích "vùng nội dung" (AOI) của từng trang slide từ bản PDF gốc.

Mỗi khối text (hoặc ảnh) trên trang trở thành một AOI trong bảng `aoi_regions`,
bbox chuẩn hóa [0,1] theo kích thước trang. Đây là cơ sở để đo độ bao phủ nội dung
("điểm nhìn đã quét bao nhiêu % dữ liệu trên trang").

Nguồn AOI cho một slide:
  - 'pdf'  : trích từ text block của pymupdf (ưu tiên).
  - 'grid' : fallback lưới đều khi trang không trích được block chữ nào (PDF toàn ảnh).
  - 'none' : chưa trích (bài cũ chưa re-upload).
"""

from pathlib import Path

import pymupdf
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.analytics import AoiRegion
from app.models.course import LessonContent

MAX_AOIS = 40
MIN_CHARS = 3
MIN_AREA = 0.0008  # 0.08% diện tích trang
MAX_VISUAL_AREA = 0.9  # ảnh quét toàn trang dùng lưới fallback chi tiết hơn


def _clip01(v: float) -> float:
    return max(0.0, min(1.0, v))


def grid_cells(cols: int, rows: int) -> list[dict]:
    """Fallback: chia trang thành lưới đều. Mỗi ô là một AOI trọng số 1."""
    cells: list[dict] = []
    index = 0
    for r in range(rows):
        for c in range(cols):
            cells.append(
                {
                    "name": f"Ô {index + 1}",
                    "x_min": round(c / cols, 6),
                    "y_min": round(r / rows, 6),
                    "x_max": round((c + 1) / cols, 6),
                    "y_max": round((r + 1) / rows, 6),
                    "weight": 1.0,
                    "char_count": 0,
                    "block_index": index,
                    "source": "grid",
                }
            )
            index += 1
    return cells


def _rect_area(rect: pymupdf.Rect) -> float:
    return max(0.0, rect.width) * max(0.0, rect.height)


def _contained_ratio(inner: pymupdf.Rect, outer: pymupdf.Rect) -> float:
    area = _rect_area(inner)
    return _rect_area(inner & outer) / area if area else 0.0


def _display_rect(page, value) -> pymupdf.Rect:
    """Đổi tọa độ PDF sang hệ tọa độ trang đang hiển thị."""
    return pymupdf.Rect(value) * page.rotation_matrix


def _merge_text_blocks(blocks: list[dict]) -> list[dict]:
    """Gộp các block gần nhau trong cùng cột để AOI chữ không bị chia vụn."""
    merged: list[dict] = []
    for block in sorted(blocks, key=lambda item: (item["rect"].y0, item["rect"].x0)):
        if merged:
            previous = merged[-1]
            a, b = previous["rect"], block["rect"]
            overlap = max(0.0, min(a.x1, b.x1) - max(a.x0, b.x0))
            min_width = min(a.width, b.width)
            gap = b.y0 - a.y1
            same_column = min_width > 0 and overlap / min_width >= 0.55
            close = -2 <= gap <= max(8.0, min(a.height, b.height) * 0.6)
            if same_column and close:
                previous["rect"] = a | b
                previous["text"] = f'{previous["text"]} {block["text"]}'
                continue
        merged.append(block.copy())
    return merged


def _visual_blocks(page, page_area: float) -> list[dict]:
    visuals: list[dict] = []
    drawings = []
    try:
        drawings = page.get_drawings()
        tables = page.find_tables(paths=drawings).tables
    except Exception:
        tables = []

    for table in tables:
        rect = _display_rect(page, table.bbox) & page.rect
        area = _rect_area(rect) / page_area
        if MIN_AREA <= area <= MAX_VISUAL_AREA:
            visuals.append({"rect": rect, "kind": "table", "name": "Bảng"})

    try:
        image_infos = page.get_image_info()
    except Exception:
        image_infos = []
    for info in image_infos:
        rect = _display_rect(page, info["bbox"]) & page.rect
        area = _rect_area(rect) / page_area
        if MIN_AREA <= area <= MAX_VISUAL_AREA:
            visuals.append({"rect": rect, "kind": "image", "name": "Hình ảnh"})

    if drawings:
        try:
            clusters = page.cluster_drawings(drawings=drawings)
        except Exception:
            clusters = []
        for cluster in clusters:
            raw_rect = pymupdf.Rect(cluster)
            path_count = sum(
                1
                for drawing in drawings
                if raw_rect.contains(pymupdf.Rect(drawing["rect"]))
                or _rect_area(raw_rect & pymupdf.Rect(drawing["rect"])) > 0
            )
            rect = _display_rect(page, raw_rect) & page.rect
            area = _rect_area(rect) / page_area
            if path_count >= 2 and MIN_AREA <= area <= MAX_VISUAL_AREA:
                visuals.append({"rect": rect, "kind": "diagram", "name": "Sơ đồ"})

    deduplicated: list[dict] = []
    priority = {"table": 3, "image": 2, "diagram": 1}
    for visual in sorted(visuals, key=lambda item: priority[item["kind"]], reverse=True):
        if any(
            _contained_ratio(visual["rect"], kept["rect"]) >= 0.85
            or _contained_ratio(kept["rect"], visual["rect"]) >= 0.85
            for kept in deduplicated
        ):
            continue
        deduplicated.append(visual)
    return deduplicated


def _page_aois(page) -> list[dict]:
    w, h = page.rect.width, page.rect.height
    page_area = w * h
    if page_area <= 0:
        return []

    text_blocks: list[dict] = []
    for block in page.get_text("blocks", sort=True):
        x0, y0, x1, y1, text, _no, block_type = block
        if block_type != 0:
            continue
        clean = " ".join((text or "").split())
        rect = _display_rect(page, (x0, y0, x1, y1)) & page.rect
        if len(clean) >= MIN_CHARS and _rect_area(rect) / page_area >= MIN_AREA:
            text_blocks.append({"rect": rect, "text": clean, "kind": "text"})

    visuals = _visual_blocks(page, page_area)
    text_blocks = [
        block
        for block in _merge_text_blocks(text_blocks)
        if not any(
            _contained_ratio(block["rect"], visual["rect"]) >= 0.8
            for visual in visuals
        )
    ]

    candidates = visuals + text_blocks
    if len(candidates) > MAX_AOIS:
        candidates = sorted(
            candidates,
            key=lambda item: (
                item["kind"] != "text",
                len(item.get("text", ""))
                or _rect_area(item["rect"]) / page_area,
            ),
            reverse=True,
        )[:MAX_AOIS]
    candidates.sort(key=lambda item: (item["rect"].y0, item["rect"].x0))

    aois: list[dict] = []
    for candidate in candidates:
        rect = candidate["rect"]
        nx0, ny0 = _clip01(rect.x0 / w), _clip01(rect.y0 / h)
        nx1, ny1 = _clip01(rect.x1 / w), _clip01(rect.y1 / h)
        if nx1 - nx0 < 0.0005 or ny1 - ny0 < 0.0005:
            continue
        if candidate["kind"] == "text":
            text = candidate["text"]
            name = (text[:60] + "…") if len(text) > 60 else text
            char_count = len(text)
            weight = float(char_count)
        else:
            name = candidate["name"]
            char_count = 0
            weight = round((nx1 - nx0) * (ny1 - ny0) * 1000, 2)
        aois.append(
            {
                "name": name,
                "x_min": round(nx0, 6),
                "y_min": round(ny0, 6),
                "x_max": round(nx1, 6),
                "y_max": round(ny1, 6),
                "weight": weight,
                "char_count": char_count,
                "block_index": len(aois),
                "source": "pdf",
            }
        )
    return aois


def extract_slide_aois(data: bytes) -> list[list[dict]]:
    """Trả về danh sách AOI cho từng trang (đã chuẩn hóa [0,1]). Trang không có
    text block thì nhận lưới fallback để không bị coverage = 0 oan."""
    try:
        doc = pymupdf.open(stream=data, filetype="pdf")
    except Exception:
        return []
    if doc.needs_pass:
        doc.close()
        return []
    pages: list[list[dict]] = []
    for page in doc:
        aois = _page_aois(page)
        pages.append(aois)
    doc.close()
    return pages


def find_source_pdf(lesson_id: str) -> Path | None:
    lesson_dir = settings.media_path / "lessons" / lesson_id
    if not lesson_dir.is_dir():
        return None
    candidates = [p for p in lesson_dir.rglob("source.pdf") if p.is_file()]
    if not candidates:
        return None
    candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return candidates[0]


async def store_aois_for_content(
    db: AsyncSession, content: LessonContent, aoi_dicts: list[dict], source: str
) -> None:
    await db.execute(
        delete(AoiRegion).where(AoiRegion.lesson_content_id == content.id)
    )
    content.aoi_source = source
    for a in aoi_dicts:
        db.add(
            AoiRegion(
                lesson_content_id=content.id,
                name=a["name"],
                x_min=a["x_min"],
                y_min=a["y_min"],
                x_max=a["x_max"],
                y_max=a["y_max"],
                source=a["source"],
                weight=a["weight"],
                char_count=a["char_count"],
                block_index=a["block_index"],
            )
        )


async def rebuild_lesson_aois(db: AsyncSession, lesson_id: str) -> int:
    """Trích lại AOI cho toàn bộ slide của bài từ `source.pdf` đã lưu lúc upload.
    Bài cũ không còn PDF nguồn dùng lưới dự phòng để mọi slide vẫn có AOI."""
    contents = (
        (
            await db.execute(
                select(LessonContent)
                .where(LessonContent.lesson_id == lesson_id)
                .order_by(LessonContent.order_index)
            )
        )
        .scalars()
        .all()
    )
    if not contents:
        return 0

    pdf_path = find_source_pdf(lesson_id)
    pages = extract_slide_aois(pdf_path.read_bytes()) if pdf_path is not None else []

    updated = 0
    for i, content in enumerate(contents):
        page_aois = pages[i] if i < len(pages) else []
        if page_aois:
            source = "pdf"
        else:
            from app.core.config import settings as _s

            page_aois = grid_cells(_s.mastery_grid_cols, _s.mastery_grid_rows)
            source = "grid"
        await store_aois_for_content(db, content, page_aois, source)
        updated += 1
    return updated
