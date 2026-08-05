from __future__ import annotations

import asyncio
import os
from datetime import datetime, timedelta, timezone
from time import time

from sqlalchemy import delete, select

from web.config import is_production_env
from web.database import AsyncSessionLocal
from web.models import CourseEnrollment, PDFLesson, Session, TrackingPoint, User

SEED_PREFIX = "SEEDPDF_"


def point(session_id, user_id, course_id, lesson_id, pdf_lesson_id, version, page_number, x, y, offset_ms, confidence=0.9, reliable=True, transitioning=False):
    now = int(time() * 1000)
    return TrackingPoint(
        point_id=f"{SEED_PREFIX}P_{session_id}_{page_number}_{offset_ms}_{int(x*100)}_{int(y*100)}",
        session_id=session_id,
        user_id=user_id,
        course_id=course_id,
        course_item_id=lesson_id,
        pdf_lesson_id=pdf_lesson_id,
        pdf_document_version=version,
        timestamp_ms=now + offset_ms,
        viewport_x=100,
        viewport_y=100,
        scroll_x=0,
        scroll_y=0,
        page_number=page_number,
        page_x_normalized=x,
        page_y_normalized=y,
        page_display_width=800,
        page_display_height=1100,
        confidence=confidence,
        gaze_status="valid",
        tracking_quality="reliable" if reliable else "outside_reliable_region",
        metadata_json={
            "is_transitioning": transitioning,
            "in_reliable_region": reliable,
            "in_pdf_page": 0 <= x <= 1 and 0 <= y <= 1,
        },
    )


async def clear_seed(db):
    sessions = (await db.execute(select(Session.session_id).where(Session.session_id.like(f"{SEED_PREFIX}%")))).scalars().all()
    if sessions:
        await db.execute(delete(TrackingPoint).where(TrackingPoint.session_id.in_(sessions)))
        await db.execute(delete(Session).where(Session.session_id.in_(sessions)))
    await db.flush()


def ensure_seed_allowed() -> None:
    if not is_production_env():
        return
    if os.getenv("ALLOW_PRODUCTION_DEV_SEED", "").strip().lower() == "true":
        return
    raise RuntimeError(
        "Refusing to seed analytics data while APP_ENV=production. "
        "Set ALLOW_PRODUCTION_DEV_SEED=true only for an explicit one-off override."
    )


async def seed():
    ensure_seed_allowed()
    async with AsyncSessionLocal() as db:
        await clear_seed(db)
        pdf_lesson = await db.scalar(select(PDFLesson).where(PDFLesson.course_item_id == "CI_C001_1785744588055"))
        if not pdf_lesson:
            raise RuntimeError("Missing target PDF lesson CI_C001_1785744588055")

        user = await db.scalar(select(User).where(User.user_id == "U_sv002"))
        if not user:
            db.add(User(user_id="U_sv002", role="student", full_name="Sinh viên 002", student_code="sv002", is_active=True))
            await db.flush()
            db.add(CourseEnrollment(student_id="U_sv002", course_id="C001", enrolled_by=None, status="active"))
            await db.flush()

        version_a = pdf_lesson.storage_key
        version_b = f"{version_a}.v2"

        base_start = datetime.now(timezone.utc) - timedelta(hours=1)
        sessions = [
            Session(
                session_id=f"{SEED_PREFIX}S1",
                user_id="U_sv001",
                course_id="C001",
                course_item_id="CI_C001_1785744588055",
                pdf_lesson_id=pdf_lesson.pdf_lesson_id,
                pdf_document_version=version_a,
                session_type="student_learning",
                created_by_role="student",
                status="finished",
                started_at=base_start,
                ended_at=base_start + timedelta(minutes=6),
            ),
            Session(
                session_id=f"{SEED_PREFIX}S2",
                user_id="U_sv002",
                course_id="C001",
                course_item_id="CI_C001_1785744588055",
                pdf_lesson_id=pdf_lesson.pdf_lesson_id,
                pdf_document_version=version_a,
                session_type="student_learning",
                created_by_role="student",
                status="finished",
                started_at=base_start + timedelta(minutes=10),
                ended_at=base_start + timedelta(minutes=17),
            ),
            Session(
                session_id=f"{SEED_PREFIX}S3",
                user_id="U_sv001",
                course_id="C001",
                course_item_id="CI_C001_1785744588055",
                pdf_lesson_id=pdf_lesson.pdf_lesson_id,
                pdf_document_version=version_b,
                session_type="student_learning",
                created_by_role="student",
                status="finished",
                started_at=base_start + timedelta(minutes=30),
                ended_at=base_start + timedelta(minutes=35),
            ),
        ]
        for row in sessions:
            db.add(row)

        points = [
            point(f"{SEED_PREFIX}S1", "U_sv001", "C001", "CI_C001_1785744588055", pdf_lesson.pdf_lesson_id, version_a, 1, 0.2, 0.2, 0),
            point(f"{SEED_PREFIX}S1", "U_sv001", "C001", "CI_C001_1785744588055", pdf_lesson.pdf_lesson_id, version_a, 1, 0.3, 0.25, 120),
            point(f"{SEED_PREFIX}S1", "U_sv001", "C001", "CI_C001_1785744588055", pdf_lesson.pdf_lesson_id, version_a, 2, 0.5, 0.4, 240),
            point(f"{SEED_PREFIX}S1", "U_sv001", "C001", "CI_C001_1785744588055", pdf_lesson.pdf_lesson_id, version_a, 1, 0.4, 0.3, 360),
            point(f"{SEED_PREFIX}S2", "U_sv002", "C001", "CI_C001_1785744588055", pdf_lesson.pdf_lesson_id, version_a, 1, 0.6, 0.45, 0),
            point(f"{SEED_PREFIX}S2", "U_sv002", "C001", "CI_C001_1785744588055", pdf_lesson.pdf_lesson_id, version_a, 2, 0.55, 0.5, 150),
            point(f"{SEED_PREFIX}S2", "U_sv002", "C001", "CI_C001_1785744588055", pdf_lesson.pdf_lesson_id, version_a, 3, 0.45, 0.55, 300, confidence=0.6),
            point(f"{SEED_PREFIX}S2", "U_sv002", "C001", "CI_C001_1785744588055", pdf_lesson.pdf_lesson_id, version_a, 3, 1.2, 0.5, 420),
            point(f"{SEED_PREFIX}S3", "U_sv001", "C001", "CI_C001_1785744588055", pdf_lesson.pdf_lesson_id, version_b, 2, 0.25, 0.25, 0),
            point(f"{SEED_PREFIX}S3", "U_sv001", "C001", "CI_C001_1785744588055", pdf_lesson.pdf_lesson_id, version_b, 3, 0.35, 0.35, 150, confidence=0.95),
            point(f"{SEED_PREFIX}S3", "U_sv001", "C001", "CI_C001_1785744588055", pdf_lesson.pdf_lesson_id, version_b, 3, 0.36, 0.37, 300, transitioning=True),
        ]
        for row in points:
            db.add(row)
        await db.commit()
        print({
            "ok": True,
            "course_id": "C001",
            "lesson_id": "CI_C001_1785744588055",
            "document_versions": [version_a, version_b],
            "sessions": [row.session_id for row in sessions],
            "points": len(points),
        })


if __name__ == "__main__":
    asyncio.run(seed())
