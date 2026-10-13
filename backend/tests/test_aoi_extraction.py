from io import BytesIO

import pymupdf
from PIL import Image

from app.services.aoi import MAX_AOIS, extract_slide_aois


def _image_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (120, 80), "#1f6feb").save(output, format="PNG")
    return output.getvalue()


def test_extracts_text_image_and_table_regions():
    doc = pymupdf.open()
    page = doc.new_page(width=600, height=400)
    page.insert_text((40, 40), "Lesson title", fontsize=20)
    page.insert_image(pymupdf.Rect(40, 70, 200, 180), stream=_image_bytes())

    x_positions = (260, 400, 540)
    y_positions = (80, 130, 180)
    for x in x_positions:
        page.draw_line((x, y_positions[0]), (x, y_positions[-1]))
    for y in y_positions:
        page.draw_line((x_positions[0], y), (x_positions[-1], y))
    page.insert_text((275, 110), "Cột A")
    page.insert_text((415, 110), "Cột B")
    page.insert_text((275, 160), "Giá trị 1")
    page.insert_text((415, 160), "Giá trị 2")
    page.draw_rect(pymupdf.Rect(260, 240, 360, 300))
    page.draw_line((360, 270), (420, 270))
    page.draw_rect(pymupdf.Rect(420, 240, 520, 300))

    [aois] = extract_slide_aois(doc.tobytes())
    names = [aoi["name"] for aoi in aois]

    assert "Hình ảnh" in names
    assert "Bảng" in names
    assert "Sơ đồ" in names
    assert any(name.startswith("Lesson title") for name in names)
    assert all(0 <= aoi["x_min"] < aoi["x_max"] <= 1 for aoi in aois)
    assert all(0 <= aoi["y_min"] < aoi["y_max"] <= 1 for aoi in aois)


def test_visual_regions_are_kept_when_page_exceeds_limit():
    doc = pymupdf.open()
    page = doc.new_page(width=600, height=800)
    for index in range(MAX_AOIS + 10):
        x = 20 + (index % 2) * 290
        y = 20 + (index // 2) * 28
        page.insert_text((x, y), f"Nội dung tách rời số {index:02d}", fontsize=10)
    page.insert_image(pymupdf.Rect(440, 700, 580, 780), stream=_image_bytes())

    [aois] = extract_slide_aois(doc.tobytes())

    assert len(aois) <= MAX_AOIS
    assert any(aoi["name"] == "Hình ảnh" for aoi in aois)


def test_extracts_single_compound_vector_region():
    doc = pymupdf.open()
    page = doc.new_page(width=600, height=400)
    page.insert_text((40, 40), "Diagram title", fontsize=20)
    shape = page.new_shape()
    shape.draw_rect(pymupdf.Rect(100, 100, 500, 330))
    shape.draw_line((100, 215), (500, 215))
    shape.draw_line((300, 100), (300, 330))
    shape.finish()
    shape.commit()

    [aois] = extract_slide_aois(doc.tobytes())

    assert any(aoi["name"] == "Sơ đồ" for aoi in aois)
