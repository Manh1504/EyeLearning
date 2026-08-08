from datetime import datetime, timezone
from types import SimpleNamespace
import unittest

from web.services.pdf_teacher_analytics_service import (
    ValidPoint,
    aggregate_page_metrics,
    is_valid_pdf_point,
)


def tracking_point(**kwargs):
    return SimpleNamespace(
        page_number=kwargs.get("page_number", 1),
        page_x_normalized=kwargs.get("page_x_normalized", 0.5),
        page_y_normalized=kwargs.get("page_y_normalized", 0.5),
        confidence=kwargs.get("confidence", 0.9),
        metadata_json=kwargs.get("metadata_json", {}),
    )


def valid_point(session_id, student_id, page_number, timestamp_ms, confidence=0.9):
    return ValidPoint(
        session_id=session_id,
        student_id=student_id,
        course_id="C001",
        lesson_id="CI001",
        document_version="v1",
        page_number=page_number,
        timestamp_ms=timestamp_ms,
        x=0.5,
        y=0.5,
        confidence=confidence,
        started_at=datetime.now(timezone.utc),
    )


class TeacherPdfAnalyticsServiceTest(unittest.TestCase):
    def test_invalid_coordinates_are_excluded(self):
        self.assertFalse(is_valid_pdf_point(tracking_point(page_x_normalized=1.2)))
        self.assertFalse(is_valid_pdf_point(tracking_point(page_y_normalized=-0.1)))

    def test_low_confidence_is_excluded(self):
        self.assertFalse(is_valid_pdf_point(tracking_point(confidence=0.2), minimum_confidence=0.5))

    def test_missing_confidence_is_allowed_without_threshold(self):
        self.assertTrue(is_valid_pdf_point(tracking_point(confidence=None), minimum_confidence=0))

    def test_missing_confidence_is_excluded_with_threshold(self):
        self.assertFalse(is_valid_pdf_point(tracking_point(confidence=None), minimum_confidence=0.5))

    def test_transitioning_samples_are_excluded(self):
        self.assertFalse(is_valid_pdf_point(tracking_point(metadata_json={"is_transitioning": True})))

    def test_unstable_pdf_samples_are_excluded(self):
        self.assertFalse(is_valid_pdf_point(tracking_point(metadata_json={"inside_viewport": False})))
        self.assertFalse(is_valid_pdf_point(tracking_point(metadata_json={"prediction_available": False})))
        self.assertFalse(is_valid_pdf_point(tracking_point(metadata_json={"is_rendering": True})))
        self.assertFalse(is_valid_pdf_point(tracking_point(metadata_json={"is_resizing": True})))
        self.assertFalse(is_valid_pdf_point(tracking_point(metadata_json={"in_pdf_page": False})))

    def test_page_aggregation_counts_unique_students_sessions_and_revisits(self):
        rows = aggregate_page_metrics(
            [
                valid_point("S1", "U1", 1, 100),
                valid_point("S1", "U1", 1, 200),
                valid_point("S1", "U1", 2, 300),
                valid_point("S1", "U1", 1, 400),
                valid_point("S2", "U2", 1, 100),
            ]
        )
        page1 = next(row for row in rows if row["page_number"] == 1)
        self.assertEqual(page1["students_viewed"], 2)
        self.assertEqual(page1["sessions_viewed"], 2)
        self.assertEqual(page1["revisit_count"], 1)
        self.assertGreater(page1["valid_gaze_samples"], 0)

    def test_outside_reliable_region_is_excluded(self):
        self.assertFalse(
            is_valid_pdf_point(
                tracking_point(
                    metadata_json={
                        "in_pdf_page": True,
                        "in_reliable_region": False,
                        "is_transitioning": False,
                    }
                )
            )
        )

    def test_explicitly_outside_pdf_is_excluded(self):
        self.assertFalse(
            is_valid_pdf_point(
                tracking_point(
                    metadata_json={
                        "in_pdf_page": False,
                        "in_reliable_region": True,
                        "is_transitioning": False,
                    }
                )
            )
        )

if __name__ == "__main__":
    unittest.main()
