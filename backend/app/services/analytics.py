from datetime import datetime, timezone

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.analytics import EngagementScore, HeatmapAggregate
from app.models.course import Enrollment, LessonContent
from app.models.gaze import GazeEvent, GazeSlideStat, LearningSession
from app.schemas.analytics import HotspotOut, SlideStatOut

FIXATION_RADIUS = 0.03
MIN_FIXATION_POINTS = 2
HOTSPOT_TOP_N = 5
GRID_CELLS = 24


async def _session_ids(
    db: AsyncSession, lesson_id: str, student_id: str | None
) -> list[str]:
    stmt = select(LearningSession.id).where(LearningSession.lesson_id == lesson_id)
    if student_id:
        stmt = stmt.join(Enrollment, Enrollment.id == LearningSession.enrollment_id).where(
            Enrollment.student_id == student_id
        )
    return list((await db.execute(stmt)).scalars().all())


async def compute_slide_stats(
    db: AsyncSession, lesson_id: str, student_id: str | None = None
) -> list[SlideStatOut]:
    session_ids = await _session_ids(db, lesson_id, student_id)
    slides = (
        await db.execute(
            select(LessonContent)
            .where(LessonContent.lesson_id == lesson_id)
            .order_by(LessonContent.order_index)
        )
    ).scalars().all()
    if not slides:
        return []

    empty = [
        SlideStatOut(idx=i, on_slide=0, fixations=0, view_sec=0, hotspots=[])
        for i in range(len(slides))
    ]
    if not session_ids:
        return empty

    stats_rows = (
        await db.execute(
            select(GazeSlideStat).where(
                GazeSlideStat.learning_session_id.in_(session_ids)
            )
        )
    ).scalars().all()
    stats_by_content: dict[str, list[GazeSlideStat]] = {}
    for row in stats_rows:
        stats_by_content.setdefault(row.lesson_content_id, []).append(row)

    events = (
        await db.execute(
            select(GazeEvent)
            .where(GazeEvent.learning_session_id.in_(session_ids))
            .order_by(
                GazeEvent.learning_session_id,
                GazeEvent.lesson_content_id,
                GazeEvent.event_time,
            )
        )
    ).scalars().all()
    events_by_content: dict[str, list[GazeEvent]] = {}
    for e in events:
        events_by_content.setdefault(e.lesson_content_id, []).append(e)

    out: list[SlideStatOut] = []
    for i, slide in enumerate(slides):
        stats = stats_by_content.get(slide.id, [])
        total = sum(s.total_samples for s in stats)
        on_slide = sum(s.on_slide_samples for s in stats)
        view_ms = sum(s.view_ms for s in stats)
        n_sessions = len(stats) or 1

        slide_events = events_by_content.get(slide.id, [])
        points = [(e.gaze_x, e.gaze_y) for e in slide_events]
        fixations = _count_fixations(slide_events)
        hotspots = _compute_hotspots(points)

        out.append(
            SlideStatOut(
                idx=i,
                on_slide=round(on_slide / total * 100, 1) if total else 0.0,
                fixations=fixations,
                view_sec=round(view_ms / 1000 / n_sessions, 1),
                hotspots=hotspots,
            )
        )
    return out


def _count_fixations(events: list[GazeEvent]) -> int:
    fixations = 0
    cluster: list[tuple[float, float]] = []

    def flush() -> int:
        return 1 if len(cluster) >= MIN_FIXATION_POINTS else 0

    for e in events:
        p = (e.gaze_x, e.gaze_y)
        if not cluster:
            cluster.append(p)
            continue
        cx = sum(q[0] for q in cluster) / len(cluster)
        cy = sum(q[1] for q in cluster) / len(cluster)
        if (p[0] - cx) ** 2 + (p[1] - cy) ** 2 <= FIXATION_RADIUS**2:
            cluster.append(p)
        else:
            fixations += flush()
            cluster = [p]
    fixations += flush()
    return fixations


def _compute_hotspots(points: list[tuple[float, float]]) -> list[HotspotOut]:
    if len(points) < 3:
        return []
    arr = np.array(points, dtype=np.float64)
    total = len(arr)

    hist, xedges, yedges = np.histogram2d(
        arr[:, 0], arr[:, 1], bins=GRID_CELLS, range=[[0.0, 1.0], [0.0, 1.0]]
    )
    if hist.max() <= 0:
        return []

    candidates = []
    for i in range(GRID_CELLS):
        for j in range(GRID_CELLS):
            w = hist[i, j]
            if w < max(3, total * 0.03):
                continue
            neighbors = hist[
                max(0, i - 1) : i + 2,
                max(0, j - 1) : j + 2,
            ]
            if w >= neighbors.max():
                cx = (xedges[i] + xedges[i + 1]) / 2
                cy = (yedges[j] + yedges[j + 1]) / 2
                candidates.append((cx, cy, w))

    candidates.sort(key=lambda c: -c[2])
    hotspots: list[HotspotOut] = []
    for cx, cy, _ in candidates:
        if any((cx - h.x) ** 2 + (cy - h.y) ** 2 < 0.12**2 for h in hotspots):
            continue
        mask = (arr[:, 0] - cx) ** 2 + (arr[:, 1] - cy) ** 2 <= 0.12**2
        cluster = arr[mask]
        if len(cluster) == 0:
            continue
        centroid = cluster.mean(axis=0)
        dists = np.sqrt(((cluster - centroid) ** 2).sum(axis=1))
        radius = float(np.clip(dists.mean() + dists.std(), 0.04, 0.18))
        hotspots.append(
            HotspotOut(
                x=round(float(centroid[0]), 4),
                y=round(float(centroid[1]), 4),
                r=round(radius, 4),
                w=round(len(cluster) / total, 4),
            )
        )
        if len(hotspots) >= HOTSPOT_TOP_N:
            break
    return hotspots


async def recompute_lesson_aggregates(
    db: AsyncSession, lesson_id: str
) -> int:
    slides = (
        await db.execute(
            select(LessonContent.id).where(LessonContent.lesson_id == lesson_id)
        )
    ).scalars().all()
    if not slides:
        return 0

    session_ids = await _session_ids(db, lesson_id, None)
    if not session_ids:
        return 0

    stats_rows = (
        await db.execute(
            select(GazeSlideStat).where(
                GazeSlideStat.learning_session_id.in_(session_ids)
            )
        )
    ).scalars().all()

    session_student = dict(
        (
            await db.execute(
                select(LearningSession.id, Enrollment.student_id)
                .join(Enrollment, Enrollment.id == LearningSession.enrollment_id)
                .where(LearningSession.id.in_(session_ids))
            )
        ).all()
    )

    per_student_slide: dict[tuple[str, str], list[GazeSlideStat]] = {}
    class_slide: dict[str, list[GazeSlideStat]] = {}
    for row in stats_rows:
        student = session_student.get(row.learning_session_id)
        if student:
            per_student_slide.setdefault((student, row.lesson_content_id), []).append(row)
        class_slide.setdefault(row.lesson_content_id, []).append(row)

    from sqlalchemy import delete

    await db.execute(
        delete(HeatmapAggregate).where(HeatmapAggregate.lesson_content_id.in_(slides))
    )

    now = datetime.now(timezone.utc)
    count = 0
    for content_id in slides:
        for scope, student_id, bucket in _scope_buckets(
            content_id, class_slide, per_student_slide
        ):
            total = sum(s.total_samples for s in bucket)
            if total == 0:
                continue
            on_slide = sum(s.on_slide_samples for s in bucket)
            view_ms = sum(s.view_ms for s in bucket)
            agg = HeatmapAggregate(
                lesson_content_id=content_id,
                scope=scope,
                student_id=student_id,
                sample_count=total,
                on_slide_ratio=on_slide / total,
                avg_view_ms=view_ms // len(bucket),
                fixation_count=0,
                hotspots=[],
                computed_at=now,
            )
            db.add(agg)
            count += 1

    await db.execute(
        delete(EngagementScore).where(EngagementScore.lesson_id == lesson_id)
    )
    per_enrollment: dict[str, list[float]] = {}
    session_enrollment = dict(
        (
            await db.execute(
                select(LearningSession.id, LearningSession.enrollment_id).where(
                    LearningSession.id.in_(session_ids)
                )
            )
        ).all()
    )
    for row in stats_rows:
        enrollment_id = session_enrollment.get(row.learning_session_id)
        if not enrollment_id or row.total_samples == 0:
            continue
        ratio = row.on_slide_samples / row.total_samples * 100
        per_enrollment.setdefault(enrollment_id, []).append(ratio)
    for enrollment_id, ratios in per_enrollment.items():
        db.add(
            EngagementScore(
                enrollment_id=enrollment_id,
                lesson_id=lesson_id,
                score=round(sum(ratios) / len(ratios), 2),
                on_slide_ratio=sum(ratios) / len(ratios) / 100,
            )
        )
    await db.flush()
    return count


def _scope_buckets(content_id, class_slide, per_student_slide):
    if content_id in class_slide:
        yield "class", None, class_slide[content_id]
    for (student, cid), bucket in per_student_slide.items():
        if cid == content_id:
            yield "student", student, bucket
