"""Tính điểm hoàn thành bài học dựa trên độ bao phủ nội dung (AOI).

Ý tưởng chốt với người dùng:
  - Slide `is_key` (GV đánh dấu) chiếm 85% điểm, slide thường 15%.
  - Một AOI được xem là "đã đọc" khi tổng dwell >= mastery_min_aoi_dwell_ms.
  - Một trang "hoàn thành" khi độ bao phủ (tỷ lệ trọng số AOI đã đọc) >=
    mastery_coverage_threshold (0.85).
  - Điểm chỉ hiển thị cho giáo viên; SV vẫn hoàn thành bài theo cơ chế cũ
    (xem hết trang), không đổi.

Hai luồng ghi dữ liệu:
  - accumulate_dwell(): chạy trong post_gaze_samples, cộng dồn dwell từng AOI
    vào aoi_dwell_stats (chỉ dữ liệu thật — simulated đã bị chặn ở route).
  - refresh_mastery(): chạy định kỳ/incremental, đọc aoi_dwell_stats → tính
    coverage từng trang + điểm bài → ghi slide_coverage_stats, lesson_mastery_scores.
"""

from collections import defaultdict
from datetime import datetime, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.analytics import (
    AoiDwellStat,
    AoiRegion,
    LessonMasteryScore,
    SlideCoverageStat,
)
from app.models.course import Enrollment, Lesson, LessonContent, Module
from app.models.gaze import GazeSlideStat, LearningSession
from app.schemas.analytics import AoiOut, LessonMasteryOut, SlideCoverageOut


def _point_in_aoi(x: float, y: float, aois: list[AoiRegion], pad: float) -> str | None:
    for a in aois:
        if (a.x_min - pad) <= x <= (a.x_max + pad) and (a.y_min - pad) <= y <= (
            a.y_max + pad
        ):
            return a.id
    return None


async def accumulate_dwell(
    db: AsyncSession,
    session_id: str,
    content_id: str,
    points: list[tuple[float, float, int]],
) -> None:
    """Cộng dồn dwell vào aoi_dwell_stats cho danh sách điểm (x, y, dwell_ms)."""
    if not points:
        return
    aois = (
        (
            await db.execute(
                select(AoiRegion).where(AoiRegion.lesson_content_id == content_id)
            )
        )
        .scalars()
        .all()
    )
    if not aois:
        return
    pad = settings.mastery_aoi_padding
    accum: dict[str, list[int]] = {}
    for x, y, dwell in points:
        aoi_id = _point_in_aoi(x, y, aois, pad)
        if aoi_id is None:
            continue
        d, c = accum.get(aoi_id, [0, 0])
        accum[aoi_id] = [d + dwell, c + 1]

    if not accum:
        return
    rows = [
        {
            "learning_session_id": session_id,
            "aoi_region_id": aoi_id,
            "dwell_ms": d,
            "sample_count": c,
        }
        for aoi_id, (d, c) in accum.items()
    ]
    stmt = pg_insert(AoiDwellStat).values(rows)
    stmt = stmt.on_conflict_do_update(
        constraint="uq_aoi_dwell_stats",
        set_={
            "dwell_ms": AoiDwellStat.dwell_ms + stmt.excluded.dwell_ms,
            "sample_count": AoiDwellStat.sample_count + stmt.excluded.sample_count,
        },
    )
    await db.execute(stmt)


async def _session_ids(
    db: AsyncSession, lesson_id: str, enrollment_id: str
) -> list[str]:
    return list(
        (
            await db.execute(
                select(LearningSession.id).where(
                    LearningSession.lesson_id == lesson_id,
                    LearningSession.enrollment_id == enrollment_id,
                )
            )
        )
        .scalars()
        .all()
    )


async def refresh_mastery(
    db: AsyncSession, lesson_id: str, enrollment_id: str
) -> float:
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
        return 0.0

    content_ids = [c.id for c in contents]
    aois = (
        (
            await db.execute(
                select(AoiRegion).where(AoiRegion.lesson_content_id.in_(content_ids))
            )
        )
        .scalars()
        .all()
    )
    aoi_by_content: dict[str, list[AoiRegion]] = defaultdict(list)
    for a in aois:
        aoi_by_content[a.lesson_content_id].append(a)

    sessions = await _session_ids(db, lesson_id, enrollment_id)

    dwell_map: dict[str, tuple[int, int]] = {}
    on_slide_map: dict[str, float] = {}
    if sessions:
        dwell_rows = (
            await db.execute(
                select(
                    AoiDwellStat.aoi_region_id,
                    func.sum(AoiDwellStat.dwell_ms),
                    func.sum(AoiDwellStat.sample_count),
                )
                .where(AoiDwellStat.learning_session_id.in_(sessions))
                .group_by(AoiDwellStat.aoi_region_id)
            )
        ).all()
        dwell_map = {r[0]: (int(r[1] or 0), int(r[2] or 0)) for r in dwell_rows}

        slide_rows = (
            await db.execute(
                select(
                    GazeSlideStat.lesson_content_id,
                    func.sum(GazeSlideStat.on_slide_samples),
                    func.sum(GazeSlideStat.total_samples),
                )
                .where(GazeSlideStat.learning_session_id.in_(sessions))
                .group_by(GazeSlideStat.lesson_content_id)
            )
        ).all()
        for cid, on_slide, total in slide_rows:
            on_slide_map[cid] = (on_slide / total) if total else 0.0

    min_dwell = settings.mastery_min_aoi_dwell_ms
    threshold = settings.mastery_coverage_threshold

    coverages: dict[str, float] = {}
    stat_rows: list[tuple[str, float, int, bool]] = []
    for c in contents:
        slide_aois = aoi_by_content.get(c.id, [])
        if slide_aois:
            total_w = sum(a.weight for a in slide_aois)
            covered_w = sum(
                a.weight
                for a in slide_aois
                if dwell_map.get(a.id, (0, 0))[0] >= min_dwell
            )
            coverage = covered_w / total_w if total_w > 0 else 0.0
            dwell_total = sum(dwell_map.get(a.id, (0, 0))[0] for a in slide_aois)
        else:
            coverage = on_slide_map.get(c.id, 0.0)
            dwell_total = 0
        coverages[c.id] = coverage
        stat_rows.append((c.id, coverage, dwell_total, coverage >= threshold))

    await db.execute(
        delete(SlideCoverageStat).where(
            SlideCoverageStat.enrollment_id == enrollment_id,
            SlideCoverageStat.lesson_content_id.in_(content_ids),
        )
    )
    now = datetime.now(timezone.utc)
    for cid, coverage, dwell_total, complete in stat_rows:
        db.add(
            SlideCoverageStat(
                enrollment_id=enrollment_id,
                lesson_content_id=cid,
                coverage=round(coverage, 4),
                dwell_ms=dwell_total,
                is_complete=complete,
                computed_at=now,
            )
        )

    key_coverages = [coverages[c.id] for c in contents if c.is_key]
    normal_coverages = [coverages[c.id] for c in contents if not c.is_key]
    key_part = sum(key_coverages) / len(key_coverages) if key_coverages else None
    normal_part = (
        sum(normal_coverages) / len(normal_coverages) if normal_coverages else None
    )

    kw = settings.mastery_key_weight
    if key_part is not None and normal_part is not None:
        score = 100 * (kw * key_part + (1 - kw) * normal_part)
    elif key_part is not None:
        score = 100 * key_part
    else:
        score = 100 * normal_part if normal_part is not None else 0.0

    key_done = sum(1 for c in contents if c.is_key and coverages[c.id] >= threshold)
    key_total = sum(1 for c in contents if c.is_key)
    slides_done = sum(1 for c in contents if coverages[c.id] >= threshold)

    await db.execute(
        delete(LessonMasteryScore).where(
            LessonMasteryScore.enrollment_id == enrollment_id,
            LessonMasteryScore.lesson_id == lesson_id,
        )
    )
    db.add(
        LessonMasteryScore(
            enrollment_id=enrollment_id,
            lesson_id=lesson_id,
            score=round(score, 2),
            key_score=round(100 * key_part, 2) if key_part is not None else 0.0,
            normal_score=round(100 * normal_part, 2) if normal_part is not None else 0.0,
            key_done=key_done,
            key_total=key_total,
            slides_done=slides_done,
            slides_total=len(contents),
            computed_at=now,
        )
    )
    return round(score, 2)


async def recompute_lesson_mastery(db: AsyncSession, lesson_id: str) -> int:
    """Tính lại mastery cho mọi học viên của khóa học chứa bài (dùng cho recompute)."""
    course_id = (
        await db.execute(
            select(Module.course_id)
            .join(Lesson, Lesson.module_id == Module.id)
            .where(Lesson.id == lesson_id)
        )
    ).scalar_one_or_none()
    if course_id is None:
        return 0
    enrollment_ids = list(
        (
            await db.execute(
                select(Enrollment.id).where(
                    Enrollment.course_id == course_id, Enrollment.status != "dropped"
                )
            )
        )
        .scalars()
        .all()
    )
    for eid in enrollment_ids:
        await refresh_mastery(db, lesson_id, eid)
    return len(enrollment_ids)


async def get_lesson_mastery(
    db: AsyncSession, lesson_id: str, enrollment_id: str
) -> LessonMasteryOut | None:
    """Trả về breakdown điểm hoàn thành cho một học viên (dùng cho GV xem)."""
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
        return None

    content_ids = [c.id for c in contents]
    aois = (
        (
            await db.execute(
                select(AoiRegion).where(AoiRegion.lesson_content_id.in_(content_ids))
            )
        )
        .scalars()
        .all()
    )
    aoi_by_content: dict[str, list[AoiRegion]] = defaultdict(list)
    for a in aois:
        aoi_by_content[a.lesson_content_id].append(a)

    sessions = await _session_ids(db, lesson_id, enrollment_id)

    dwell_map: dict[str, int] = {}
    on_slide_map: dict[str, float] = {}
    if sessions:
        rows = (
            await db.execute(
                select(
                    AoiDwellStat.aoi_region_id, func.sum(AoiDwellStat.dwell_ms)
                )
                .where(AoiDwellStat.learning_session_id.in_(sessions))
                .group_by(AoiDwellStat.aoi_region_id)
            )
        ).all()
        dwell_map = {r[0]: int(r[1] or 0) for r in rows}

        slide_rows = (
            await db.execute(
                select(
                    GazeSlideStat.lesson_content_id,
                    func.sum(GazeSlideStat.on_slide_samples),
                    func.sum(GazeSlideStat.total_samples),
                )
                .where(GazeSlideStat.learning_session_id.in_(sessions))
                .group_by(GazeSlideStat.lesson_content_id)
            )
        ).all()
        for cid, on_slide, total in slide_rows:
            on_slide_map[cid] = (on_slide / total) if total else 0.0

    min_dwell = settings.mastery_min_aoi_dwell_ms
    threshold = settings.mastery_coverage_threshold

    slides: list[SlideCoverageOut] = []
    key_coverages: list[float] = []
    normal_coverages: list[float] = []
    key_done = key_total = 0
    slides_done = 0

    for c in contents:
        slide_aois = aoi_by_content.get(c.id, [])
        aoi_outs: list[AoiOut] = []
        if slide_aois:
            total_w = sum(a.weight for a in slide_aois)
            covered_w = 0.0
            dwell_total = 0
            for a in slide_aois:
                d = dwell_map.get(a.id, 0)
                dwell_total += d
                covered = d >= min_dwell
                if covered:
                    covered_w += a.weight
                aoi_outs.append(
                    AoiOut(
                        id=a.id,
                        name=a.name,
                        x_min=a.x_min,
                        y_min=a.y_min,
                        x_max=a.x_max,
                        y_max=a.y_max,
                        weight=a.weight,
                        char_count=a.char_count,
                        source=a.source,
                        covered=covered,
                        dwell_ms=d,
                    )
                )
            coverage = covered_w / total_w if total_w > 0 else 0.0
        else:
            dwell_total = 0
            coverage = on_slide_map.get(c.id, 0.0)

        is_complete = coverage >= threshold
        slides.append(
            SlideCoverageOut(
                content_id=c.id,
                order_index=c.order_index,
                is_key=c.is_key,
                coverage=round(coverage, 4),
                dwell_ms=dwell_total,
                is_complete=is_complete,
                aoi_count=len(slide_aois),
                aoi_source=c.aoi_source,
                aois=aoi_outs,
            )
        )
        (key_coverages if c.is_key else normal_coverages).append(coverage)
        if c.is_key:
            key_total += 1
            if is_complete:
                key_done += 1
        if is_complete:
            slides_done += 1

    key_part = sum(key_coverages) / len(key_coverages) if key_coverages else None
    normal_part = (
        sum(normal_coverages) / len(normal_coverages) if normal_coverages else None
    )
    kw = settings.mastery_key_weight
    if key_part is not None and normal_part is not None:
        score = 100 * (kw * key_part + (1 - kw) * normal_part)
    elif key_part is not None:
        score = 100 * key_part
    else:
        score = 100 * normal_part if normal_part is not None else 0.0

    return LessonMasteryOut(
        lesson_id=lesson_id,
        score=round(score, 2),
        key_score=round(100 * key_part, 2) if key_part is not None else 0.0,
        normal_score=round(100 * normal_part, 2) if normal_part is not None else 0.0,
        key_done=key_done,
        key_total=key_total,
        slides_done=slides_done,
        slides_total=len(contents),
        slides=slides,
    )