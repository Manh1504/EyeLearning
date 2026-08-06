from types import SimpleNamespace
import unittest

from web.schemas import TrackingPointCreate
from web.routers.gaze_chunks import GazeChunkCreate
from web.services.tracking_ingestion import tracking_point_payload


def session(**kwargs):
    defaults = {
        "session_id": "S001",
        "user_id": "U001",
        "lesson_id": None,
        "course_id": "SESSION_COURSE",
        "course_item_id": "SESSION_ITEM",
        "pdf_lesson_id": "SESSION_PDF",
        "pdf_document_version": "SESSION/version.pdf",
        "test_id": None,
        "module_id": None,
        "activity_id": None,
        "content_version_id": None,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class TrackingIngestionTest(unittest.TestCase):
    def test_pdf_fields_survive_chunk_schema_and_payload_mapping(self):
        point = TrackingPointCreate(
            session_id="S001",
            timestamp_ms=1_800_000_000_000,
            viewport_x=500.0,
            viewport_y=300.0,
            scroll_x=0,
            scroll_y=200,
            course_id="C001",
            course_item_id="CI001",
            pdf_lesson_id="PDF001",
            pdf_document_version="C001/version_abc.pdf",
            page_number=3,
            page_x_normalized=0.42,
            page_y_normalized=0.61,
            page_display_width=900,
            page_display_height=1273,
            confidence=None,
            gaze_status="predicted",
            metadata_json={
                "in_pdf_page": True,
                "is_transitioning": False,
            },
        )

        payload = tracking_point_payload(
            point,
            session(),
            point_id="P001",
            aoi_id=None,
        )

        self.assertEqual(payload["page_number"], 3)
        self.assertEqual(payload["page_x_normalized"], 0.42)
        self.assertEqual(payload["page_y_normalized"], 0.61)
        self.assertEqual(payload["pdf_document_version"], "C001/version_abc.pdf")
        self.assertEqual(payload["course_item_id"], "CI001")

    def test_session_pdf_context_fills_missing_point_fields(self):
        point = TrackingPointCreate(
            session_id="S001",
            t=1_800_000_000_000,
            x=500.0,
            y=300.0,
            conf=0.8,
        )

        payload = tracking_point_payload(
            point,
            session(),
            point_id="P002",
            aoi_id="AOI001",
        )

        self.assertEqual(payload["timestamp_ms"], 1_800_000_000_000)
        self.assertEqual(payload["viewport_x"], 500.0)
        self.assertEqual(payload["viewport_y"], 300.0)
        self.assertEqual(payload["confidence"], 0.8)
        self.assertEqual(payload["course_id"], "SESSION_COURSE")
        self.assertEqual(payload["pdf_document_version"], "SESSION/version.pdf")

    def test_gaze_chunk_accepts_points_alias_and_preserves_sequence_payload(self):
        chunk = GazeChunkCreate(
            session_id="S001",
            lesson_id="L001",
            seq=42,
            start_ms=1_800_000_000_000,
            points=[
                {
                    "session_id": "S001",
                    "timestamp_ms": 1_800_000_000_000,
                    "viewport_x": 100,
                    "viewport_y": 200,
                    "page_number": 2,
                    "page_x_normalized": 0.2,
                    "page_y_normalized": 0.3,
                }
            ],
        )

        self.assertEqual(chunk.seq, 42)
        self.assertEqual(len(chunk.data), 1)
        self.assertEqual(chunk.data[0].page_number, 2)

    def test_gaze_chunk_rejects_points_from_another_session(self):
        with self.assertRaises(ValueError):
            GazeChunkCreate(
                session_id="S001",
                lesson_id="L001",
                seq=42,
                start_ms=1_800_000_000_000,
                points=[
                    {
                        "session_id": "S002",
                        "timestamp_ms": 1_800_000_000_000,
                        "viewport_x": 100,
                        "viewport_y": 200,
                    }
                ],
            )


if __name__ == "__main__":
    unittest.main()
