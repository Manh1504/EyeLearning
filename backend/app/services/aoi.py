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


def _page_aois(page) -> list[dict]:
    w, h = page.rect.width, page.rect.height
    if w <= 0 or h <= 0:
        return []

    aois: list[dict] = []
    index = 0
    for block in page.get_text("blocks"):
        x0, y0, x1, y1, text, _no, block_type = block
        nx0 = _clip01(x0 / w)
        ny0 = _clip01(y0 / h)
        nx1 = _clip01(x1 / w)
        ny1 = _clip01(y1 / h)
        if nx1 - nx0 < 0.0005 or ny1 - ny0 < 0.0005:
            continue

        if block_type == 0:
            clean = (text or "").strip()
            if len(clean) < MIN_CHARS:
                continue
            name = (clean[:60] + "…") if len(clean) > 60 else clean
            weight = float(len(clean))
            char_count = len(clean)
        else:  # ảnh / vùng không phải text
            area = (nx1 - nx0) * (ny1 - ny0)
            if area < MIN_AREA:
                continue
            name = "Hình ảnh"
            weight = round(area * 1000, 2)
            char_count = 0

        aois.append(
            {
                "name": name,
                "x_min": round(nx0, 6),
                "y_min": round(ny0, 6),
                "x_max": round(nx1, 6),
                "y_max": round(ny1, 6),
                "weight": weight,
                "char_count": char_count,
                "block_index": index,
                "source": "pdf",
            }
        )
        index += 1
        if index >= MAX_AOIS:
            break
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
    Trả về số slide đã cập nhật. Bài chưa có source.pdf → trả 0."""
    pdf_path = find_source_pdf(lesson_id)
    if pdf_path is None:
        return 0
    data = pdf_path.read_bytes()
    pages = extract_slide_aois(data)

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