from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime

from sqlalchemy import and_, distinct, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from web.models import Course, CourseEnrollment, CourseItem, PDFLesson, PDFLessonProgress, Session, TrackingPoint

MAX_HEATMAP_POINTS = 4000
MAX_SAMPLE_STEP_MS = 1000


@dataclass(frozen=True)
class ValidPoint:
    session_id: str
    student_id: str
    course_id: str
    lesson_id: str
    document_version: str | None
    page_number: int
    timestamp_ms: int
    x: float
    y: float
    confidence: float | None
    started_at: datetime | None


def is_valid_pdf_point(point: TrackingPoint, minimum_confidence: float = 0) -> bool:
    if point.page_number is None:
        return False
    if point.page_x_normalized is None or point.page_y_normalized is None:
        return False
    if not (0 <= float(point.page_x_normalized) <= 1 and 0 <= float(point.page_y_normalized) <= 1):
        return False
    metadata = point.metadata_json or {}
    if metadata.get("is_transitioning") is True:
        return False
    if metadata.get("in_reliable_region") is False:
        return False
    if point.confidence is not None and point.confidence < minimum_confidence:
        return False
    return True


def sample_duration_ms(points: list[ValidPoint], index: int) -> int:
    if index >= len(points) - 1:
        return 100
    dt = int(points[index + 1].timestamp_ms - points[index].timestamp_ms)
    if dt <= 0:
        return 0
    return min(dt, MAX_SAMPLE_STEP_MS)


def aggregate_page_metrics(points: list[ValidPoint]) -> list[dict]:
    by_session = defaultdict(list)
    for point in sorted(points, key=lambda row: (row.session_id, row.timestamp_ms)):
        by_session[point.session_id].append(point)

    page_rows: dict[int, dict] = {}
    for session_points in by_session.values():
        visited_pages: list[int] = []
        entries_by_page = defaultdict(int)
        durations_by_page = defaultdict(int)
        students_by_page = defaultdict(set)
        sessions_by_page = defaultdict(set)
        samples_by_page = defaultdict(int)
        last_activity_by_page = {}
        confidences_by_page = defaultdict(list)

        current_page = None
        for index, point in enumerate(session_points):
            duration = sample_duration_ms(session_points, index)
            page = int(point.page_number)
            if current_page != page:
                entries_by_page[page] += 1
                visited_pages.append(page)
                current_page = page
            durations_by_page[page] += duration
            samples_by_page[page] += 1
            students_by_page[page].add(point.student_id)
            sessions_by_page[page].add(point.session_id)
            if point.confidence is not None:
                confidences_by_page[page].append(float(point.confidence))
            if point.started_at:
                last_activity_by_page[page] = max(last_activity_by_page.get(page, point.started_at), point.started_at)

        revisit_by_page = defaultdict(int)
        seen_once = set()
        for page in visited_pages:
            if page in seen_once:
                revisit_by_page[page] += 1
            else:
                seen_once.add(page)

        for page, sample_count in samples_by_page.items():
            row = page_rows.setdefault(
                page,
                {
                    "page_number": page,
                    "students": set(),
                    "sessions": set(),
                    "valid_gaze_samples": 0,
                    "valid_gaze_time_ms": 0,
                    "page_entry_count": 0,
                    "revisit_count": 0,
                    "confidence_values": [],
                    "last_activity_at": None,
                },
            )
            row["students"].update(students_by_page[page])
            row["sessions"].update(sessions_by_page[page])
            row["valid_gaze_samples"] += sample_count
            row["valid_gaze_time_ms"] += durations_by_page[page]
            row["page_entry_count"] += entries_by_page[page]
            row["revisit_count"] += revisit_by_page[page]
            row["confidence_values"].extend(confidences_by_page[page])
            page_last = last_activity_by_page.get(page)
            if page_last is not None:
                row["last_activity_at"] = max(row["last_activity_at"], page_last) if row["last_activity_at"] else page_last

    rows = []
    for page in sorted(page_rows):
        row = page_rows[page]
        sessions_count = len(row["sessions"])
        rows.append(
            {
                "page_number": page,
                "students_viewed": len(row["students"]),
                "sessions_viewed": sessions_count,
                "valid_gaze_samples": row["valid_gaze_samples"],
                "valid_gaze_time_seconds": round(row["valid_gaze_time_ms"] / 1000, 2) if row["valid_gaze_time_ms"] else None,
                "average_valid_gaze_time_seconds": round((row["valid_gaze_time_ms"] / sessions_count) / 1000, 2) if sessions_count else None,
                "page_entry_count": row["page_entry_count"],
                "revisit_count": row["revisit_count"],
                "tracking_quality": round(sum(row["confidence_values"]) / len(row["confidence_values"]), 4) if row["confidence_values"] else None,
                "last_activity_at": row["last_activity_at"],
            }
        )
    return rows


async def _course_meta(db: AsyncSession, course_id: str) -> Course | None:
    return await db.scalar(select(Course).where(Course.course_id == course_id))


async def _lesson_meta(db: AsyncSession, course_id: str, lesson_id: str) -> tuple[CourseItem, PDFLesson] | tuple[None, None]:
    item = await db.scalar(
        select(CourseItem).where(
            CourseItem.course_item_id == lesson_id,
            CourseItem.course_id == course_id,
            CourseItem.item_type == "PDF_LESSON",
        )
    )
    if not item:
        return None, None
    pdf_lesson = await db.scalar(select(PDFLesson).where(PDFLesson.course_item_id == item.course_item_id))
    return item, pdf_lesson


def _session_filters(course_id: str, lesson_id: str | None = None, student_id: str | None = None, date_from: datetime | None = None, date_to: datetime | None = None, document_version: str | None = None):
    filters = [
        Session.course_id == course_id,
        Session.session_type == "student_learning",
        Session.status.in_(["learning", "finished", "preparing"]),
    ]
    if lesson_id:
        filters.append(Session.course_item_id == lesson_id)
    if student_id:
        filters.append(Session.user_id == student_id)
    if date_from:
        filters.append(Session.started_at >= date_from)
    if date_to:
        filters.append(Session.started_at <= date_to)
    if document_version:
        filters.append(Session.pdf_document_version == document_version)
    return filters


async def load_valid_points(
    db: AsyncSession,
    *,
    course_id: str,
    lesson_id: str,
    student_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    minimum_confidence: float = 0,
    document_version: str | None = None,
) -> list[ValidPoint]:
    filters = _session_filters(course_id, lesson_id, student_id, date_from, date_to, document_version)
    stmt = (
        select(
            TrackingPoint.session_id,
            Session.user_id,
            TrackingPoint.course_id,
            TrackingPoint.course_item_id,
            func.coalesce(TrackingPoint.pdf_document_version, Session.pdf_document_version),
            TrackingPoint.page_number,
            TrackingPoint.timestamp_ms,
            TrackingPoint.page_x_normalized,
            TrackingPoint.page_y_normalized,
            TrackingPoint.confidence,
            Session.started_at,
        )
        .join(Session, Session.session_id == TrackingPoint.session_id)
        .where(and_(*filters))
        .where(TrackingPoint.page_number.is_not(None))
        .order_by(TrackingPoint.session_id, TrackingPoint.timestamp_ms)
    )
    result = await db.execute(stmt)
    rows = []
    for row in result.all():
        point = TrackingPoint(
            session_id=row[0],
            user_id=row[1],
            course_id=row[2],
            course_item_id=row[3],
            pdf_document_version=row[4],
            page_number=row[5],
            timestamp_ms=row[6],
            page_x_normalized=row[7],
            page_y_normalized=row[8],
            confidence=row[9],
            metadata_json={},
        )
        if not is_valid_pdf_point(point, minimum_confidence):
            continue
        rows.append(
            ValidPoint(
                session_id=row[0],
                student_id=row[1],
                course_id=row[2],
                lesson_id=row[3],
                document_version=row[4],
                page_number=int(row[5]),
                timestamp_ms=int(row[6]),
                x=float(row[7]),
                y=float(row[8]),
                confidence=float(row[9]) if row[9] is not None else None,
                started_at=row[10],
            )
        )
    return rows


async def build_course_analytics(
    db: AsyncSession,
    *,
    course_id: str,
    student_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    minimum_confidence: float = 0,
    document_version: str | None = None,
) -> dict | None:
    course = await _course_meta(db, course_id)
    if not course:
        return None
    current_lessons_result = await db.execute(
        select(CourseItem, PDFLesson)
        .join(PDFLesson, PDFLesson.course_item_id == CourseItem.course_item_id)
        .where(CourseItem.course_id == course_id, CourseItem.item_type == "PDF_LESSON")
        .order_by(CourseItem.display_order)
    )
    lessons = current_lessons_result.all()
    enrolled_count = await db.scalar(
        select(func.count(CourseEnrollment.student_id)).where(
            CourseEnrollment.course_id == course_id,
            CourseEnrollment.status == "active",
        )
    ) or 0
    lesson_rows = []
    total_sessions = 0
    valid_sessions = 0
    total_duration_seconds = 0.0
    duration_count = 0
    students_with_activity: set[str] = set()

    for item, pdf_lesson in lessons:
        points = await load_valid_points(
            db,
            course_id=course_id,
            lesson_id=item.course_item_id,
            student_id=student_id,
            date_from=date_from,
            date_to=date_to,
            minimum_confidence=minimum_confidence,
            document_version=document_version or pdf_lesson.storage_key,
        )
        filters = _session_filters(course_id, item.course_item_id, student_id, date_from, date_to, document_version or pdf_lesson.storage_key)
        session_stmt = select(
            Session.session_id,
            Session.user_id,
            Session.started_at,
            Session.ended_at,
        ).where(and_(*filters))
        sessions = (await db.execute(session_stmt)).all()
        session_count = len(sessions)
        total_sessions += session_count
        started_students = {row[1] for row in sessions}
        students_with_activity.update(started_students)
        valid_session_ids = {point.session_id for point in points}
        valid_sessions += len(valid_session_ids)
        pages_with_data = len({point.page_number for point in points})
        sample_pages = aggregate_page_metrics(points)
        total_valid_ms = sum((row["valid_gaze_time_seconds"] or 0) for row in sample_pages)
        lesson_durations = []
        last_activity_at = None
        for session_id, _, started_at, ended_at in sessions:
          if started_at and ended_at:
            delta = (ended_at - started_at).total_seconds()
            if delta >= 0:
              lesson_durations.append(delta)
          if started_at:
            last_activity_at = max(last_activity_at, started_at) if last_activity_at else started_at
        if lesson_durations:
            total_duration_seconds += sum(lesson_durations)
            duration_count += len(lesson_durations)
        completed_count = await db.scalar(
            select(func.count(PDFLessonProgress.user_id)).where(
                PDFLessonProgress.pdf_lesson_id == pdf_lesson.pdf_lesson_id,
                PDFLessonProgress.completed_at.is_not(None),
            )
        )
        lesson_rows.append(
            {
                "lesson_id": item.course_item_id,
                "lesson_title": item.title,
                "page_count": pdf_lesson.page_count,
                "document_version": document_version or pdf_lesson.storage_key,
                "enrolled_student_count": int(enrolled_count),
                "students_started": len(started_students),
                "students_completed": int(completed_count or 0),
                "session_count": session_count,
                "valid_session_count": len(valid_session_ids),
                "valid_tracking_rate": (len(valid_session_ids) / session_count) if session_count else None,
                "average_session_duration_seconds": round(sum(lesson_durations) / len(lesson_durations), 2) if lesson_durations else None,
                "average_valid_gaze_time_seconds": round(total_valid_ms / session_count, 2) if session_count else None,
                "total_valid_gaze_samples": len(points),
                "pages_with_data": pages_with_data,
                "last_activity_at": last_activity_at,
            }
        )

    return {
        "course_id": course.course_id,
        "course_title": course.course_title,
        "total_sessions": total_sessions,
        "students_with_activity": len(students_with_activity),
        "valid_tracking_rate": (valid_sessions / total_sessions) if total_sessions else None,
        "average_session_duration_seconds": round(total_duration_seconds / duration_count, 2) if duration_count else None,
        "lessons": lesson_rows,
    }


async def build_lesson_analytics(
    db: AsyncSession,
    *,
    course_id: str,
    lesson_id: str,
    student_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    minimum_confidence: float = 0,
    document_version: str | None = None,
) -> dict | None:
    item, pdf_lesson = await _lesson_meta(db, course_id, lesson_id)
    if not item or not pdf_lesson:
        return None
    resolved_version = document_version or pdf_lesson.storage_key
    points = await load_valid_points(
        db,
        course_id=course_id,
        lesson_id=lesson_id,
        student_id=student_id,
        date_from=date_from,
        date_to=date_to,
        minimum_confidence=minimum_confidence,
        document_version=resolved_version,
    )
    pages = aggregate_page_metrics(points)
    filters = _session_filters(course_id, lesson_id, student_id, date_from, date_to, resolved_version)
    session_rows = (
        await db.execute(
            select(Session.session_id, Session.user_id, Session.started_at, Session.ended_at).where(and_(*filters))
        )
    ).all()
    session_ids = [row[0] for row in session_rows]
    durations = []
    first_activity_at = None
    last_activity_at = None
    for _, _, started_at, ended_at in session_rows:
        if started_at:
            first_activity_at = min(first_activity_at, started_at) if first_activity_at else started_at
            last_activity_at = max(last_activity_at, started_at) if last_activity_at else started_at
        if started_at and ended_at:
            delta = (ended_at - started_at).total_seconds()
            if delta >= 0:
                durations.append(delta)
    valid_session_ids = {point.session_id for point in points}
    session_page_map = defaultdict(set)
    session_sample_map = defaultdict(int)
    session_conf_map = defaultdict(list)
    for point in points:
        session_page_map[point.session_id].add(point.page_number)
        session_sample_map[point.session_id] += 1
        if point.confidence is not None:
            session_conf_map[point.session_id].append(point.confidence)
    session_summaries = []
    for session_id, student_id, started_at, ended_at in session_rows:
        duration = None
        if started_at and ended_at:
            delta = (ended_at - started_at).total_seconds()
            if delta >= 0:
                duration = round(delta, 2)
        confidences = session_conf_map.get(session_id, [])
        session_summaries.append(
            {
                "session_id": session_id,
                "student_id": student_id,
                "student_name": student_id,
                "started_at": started_at,
                "duration_seconds": duration,
                "pages_viewed": len(session_page_map.get(session_id, set())),
                "valid_tracking_samples": session_sample_map.get(session_id, 0),
                "tracking_quality": round(sum(confidences) / len(confidences), 4) if confidences else None,
                "document_version": resolved_version,
            }
        )
    return {
        "lesson_id": item.course_item_id,
        "course_id": course_id,
        "lesson_title": item.title,
        "document_version": resolved_version,
        "page_count": pdf_lesson.page_count,
        "students_started": len({row[1] for row in session_rows}),
        "session_count": len(session_rows),
        "valid_session_count": len(valid_session_ids),
        "valid_tracking_rate": (len(valid_session_ids) / len(session_rows)) if session_rows else None,
        "average_session_duration_seconds": round(sum(durations) / len(durations), 2) if durations else None,
        "total_valid_gaze_samples": len(points),
        "pages_with_data": len(pages),
        "first_activity_at": first_activity_at,
        "last_activity_at": last_activity_at,
        "pages": pages,
        "sessions": session_summaries,
        "session_ids": session_ids,
        "pdf_url": f"/teacher/courses/{course_id}/lessons/{lesson_id}/document?document_version={resolved_version}",
    }


async def build_page_heatmap(
    db: AsyncSession,
    *,
    course_id: str,
    lesson_id: str,
    page_number: int,
    student_id: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    minimum_confidence: float = 0,
    document_version: str | None = None,
) -> dict | None:
    lesson = await build_lesson_analytics(
        db,
        course_id=course_id,
        lesson_id=lesson_id,
        student_id=student_id,
        date_from=date_from,
        date_to=date_to,
        minimum_confidence=minimum_confidence,
        document_version=document_version,
    )
    if not lesson:
        return None
    if page_number < 1 or (lesson["page_count"] and page_number > lesson["page_count"]):
        raise ValueError("invalid_page")
    points = await load_valid_points(
        db,
        course_id=course_id,
        lesson_id=lesson_id,
        student_id=student_id,
        date_from=date_from,
        date_to=date_to,
        minimum_confidence=minimum_confidence,
        document_version=lesson["document_version"],
    )
    page_points = [point for point in points if point.page_number == page_number]
    if len(page_points) > MAX_HEATMAP_POINTS:
        step = max(1, len(page_points) // MAX_HEATMAP_POINTS)
        page_points = page_points[::step][:MAX_HEATMAP_POINTS]
    page_row = next((row for row in lesson["pages"] if row["page_number"] == page_number), None)
    return {
        "course_id": course_id,
        "lesson_id": lesson_id,
        "lesson_title": lesson["lesson_title"],
        "page_number": page_number,
        "document_version": lesson["document_version"],
        "page_count": lesson["page_count"],
        "pdf_url": lesson["pdf_url"],
        "included_students": len({point.student_id for point in page_points}),
        "included_sessions": len({point.session_id for point in page_points}),
        "valid_sample_count": len(page_points),
        "confidence_threshold": minimum_confidence,
        "tracking_quality": page_row["tracking_quality"] if page_row else None,
        "points": [
            {
                "x_normalized": round(point.x, 4),
                "y_normalized": round(point.y, 4),
                "confidence": point.confidence,
                "weight": 1,
            }
            for point in page_points
        ],
    }
