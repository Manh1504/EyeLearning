from datetime import datetime, timezone
from types import SimpleNamespace
from unittest import IsolatedAsyncioTestCase
from unittest.mock import AsyncMock, patch

from web.services import pdf_teacher_analytics_service as service


class FakeResult:
    """Mimics the subset of SQLAlchemy's Result used by build_lesson_analytics."""

    def __init__(self, rows):
        self._rows = rows

    def all(self):
        return self._rows


class LoadValidPointsColumnOrderTest(IsolatedAsyncioTestCase):
    """Regression test for the column/index mismatch bug in load_valid_points:
    a bad merge once prepended metadata_json to the SELECT list (and appended
    duplicate columns) without updating the row[i] mapping below, silently
    corrupting every field (page_number, coordinates, confidence, started_at...).
    """

    async def test_row_fields_map_to_the_correct_select_columns(self):
        started_at = datetime(2026, 1, 1, 9, 0, tzinfo=timezone.utc)
        # Row order MUST match the 12-column select() in load_valid_points:
        # session_id, user_id, course_id, course_item_id, document_version,
        # page_number, timestamp_ms, page_x, page_y, confidence, metadata_json, started_at
        row = (
            "S001",            # session_id
            "U001",            # user_id
            "C001",            # course_id
            "CI001",           # course_item_id / lesson_id
            "C001/doc_v1.pdf", # document_version
            3,                 # page_number
            15000,             # timestamp_ms
            0.42,              # page_x_normalized
            0.77,              # page_y_normalized
            0.95,              # confidence
            {},                # metadata_json
            started_at,        # Session.started_at
        )
        db = AsyncMock()
        db.execute.return_value = FakeResult([row])

        points = await service.load_valid_points(
            db, course_id="C001", lesson_id="CI001"
        )

        self.assertEqual(len(points), 1)
        point = points[0]
        self.assertEqual(point.session_id, "S001")
        self.assertEqual(point.student_id, "U001")
        self.assertEqual(point.document_version, "C001/doc_v1.pdf")
        self.assertEqual(point.page_number, 3)
        self.assertEqual(point.timestamp_ms, 15000)
        self.assertAlmostEqual(point.x, 0.42)
        self.assertAlmostEqual(point.y, 0.77)
        self.assertAlmostEqual(point.confidence, 0.95)
        self.assertEqual(point.started_at, started_at)


class BuildLessonAnalyticsTest(IsolatedAsyncioTestCase):
    """Regression tests for the two bugs fixed in build_lesson_analytics:

    1. pdf_url must use the real mounted route order (/courses/teacher/...),
       not the reversed (/teacher/courses/...) that broke the heatmap PDF viewer.
    2. session_summaries must carry the student's real name (joined from User),
       not the raw user_id, so the Teacher > Lesson Analytics "sessions" tab
       shows readable names instead of UUIDs.
    """

    async def test_pdf_url_uses_courses_teacher_prefix_order(self):
        item = SimpleNamespace(course_item_id="CI001", title="Bai hoc 1")
        pdf_lesson = SimpleNamespace(storage_key="C001/doc_v1.pdf", page_count=5)

        session_row = (
            "S001",
            "U001",
            datetime(2026, 1, 1, tzinfo=timezone.utc),
            datetime(2026, 1, 1, 0, 10, tzinfo=timezone.utc),
            "Nguyen Van A",
            "SV001",
        )
        db = AsyncMock()
        db.execute.return_value = FakeResult([session_row])

        with patch.object(service, "_lesson_meta", AsyncMock(return_value=(item, pdf_lesson))), \
             patch.object(service, "load_valid_points", AsyncMock(return_value=[])):
            payload = await service.build_lesson_analytics(
                db, course_id="C001", lesson_id="CI001"
            )

        self.assertIsNotNone(payload)
        self.assertEqual(
            payload["pdf_url"],
            "/courses/teacher/C001/lessons/CI001/document?document_version=C001/doc_v1.pdf",
        )
        # Must NOT be the previously-broken reversed path.
        self.assertFalse(payload["pdf_url"].startswith("/teacher/courses/"))

    async def test_session_summaries_use_real_student_name(self):
        item = SimpleNamespace(course_item_id="CI001", title="Bai hoc 1")
        pdf_lesson = SimpleNamespace(storage_key="C001/doc_v1.pdf", page_count=5)

        session_row = (
            "S001",
            "U001",
            datetime(2026, 1, 1, tzinfo=timezone.utc),
            datetime(2026, 1, 1, 0, 10, tzinfo=timezone.utc),
            "Nguyen Van A",
            "SV001",
        )
        db = AsyncMock()
        db.execute.return_value = FakeResult([session_row])

        with patch.object(service, "_lesson_meta", AsyncMock(return_value=(item, pdf_lesson))), \
             patch.object(service, "load_valid_points", AsyncMock(return_value=[])):
            payload = await service.build_lesson_analytics(
                db, course_id="C001", lesson_id="CI001"
            )

        self.assertEqual(len(payload["sessions"]), 1)
        row = payload["sessions"][0]
        self.assertEqual(row["student_name"], "Nguyen Van A")
        self.assertEqual(row["student_code"], "SV001")
        self.assertEqual(row["student_id"], "U001")
        # Must NOT fall back to the raw user_id when a full_name is available.
        self.assertNotEqual(row["student_name"], row["student_id"])

    async def test_session_summaries_fall_back_when_user_has_no_name(self):
        item = SimpleNamespace(course_item_id="CI001", title="Bai hoc 1")
        pdf_lesson = SimpleNamespace(storage_key="C001/doc_v1.pdf", page_count=5)

        session_row = (
            "S001",
            "U002",
            datetime(2026, 1, 1, tzinfo=timezone.utc),
            None,
            None,
            None,
        )
        db = AsyncMock()
        db.execute.return_value = FakeResult([session_row])

        with patch.object(service, "_lesson_meta", AsyncMock(return_value=(item, pdf_lesson))), \
             patch.object(service, "load_valid_points", AsyncMock(return_value=[])):
            payload = await service.build_lesson_analytics(
                db, course_id="C001", lesson_id="CI001"
            )

        row = payload["sessions"][0]
        self.assertEqual(row["student_name"], "U002")