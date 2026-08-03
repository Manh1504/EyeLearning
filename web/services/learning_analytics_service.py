from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from math import erfc, sqrt
from statistics import median

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from web.models import AOIDefinition, Lesson, Session, TrackingPoint, User

ANALYTICS_VERSION = "learning_analytics_slide_lsa_v1"
OUTSIDE_AOI = "OUTSIDE_AOI"
MAX_SAMPLE_STEP_MS = 1000
MAX_FIXATION_GAP_MS = 1500
MIN_FIXATION_DURATION_MS = 80
MIN_VALID_TRANSITIONS = 8
MIN_CONTRIBUTING_STUDENTS = 2
MIN_EXPECTED_COUNT = 1
MIN_TRACKING_COVERAGE = 0.35
FDR_ALPHA = 0.05


@dataclass(frozen=True)
class FixationEvent:
    student_id: str
    session_id: str
    lesson_id: str
    slide_id: str
    slide_version: str
    exposure_id: int
    fixation_id: str
    aoi_key: str
    started_at_ms: int
    duration_ms: int
    valid_sample_count: int
    sample_count: int
    tracking_coverage: float


def _meta(point: TrackingPoint) -> dict:
    return point.metadata_json or {}


def _is_learning_session(session: Session) -> bool:
    return (session.session_type or "student_learning") == "student_learning"


def _is_valid_content_sample(point: TrackingPoint) -> bool:
    metadata = _meta(point)
    if metadata.get("is_transitioning") is True:
        return False
    if metadata.get("ui_interaction") is True:
        return False
    if metadata.get("in_reliable_region") is False:
        return False
    if point.confidence is not None and point.confidence < 0.5:
        return False
    return bool(metadata.get("slide_id"))


def _sample_duration(points: list[TrackingPoint], index: int) -> int:
    if index >= len(points) - 1:
        return 100
    dt = int(points[index + 1].timestamp_ms - points[index].timestamp_ms)
    if dt <= 0:
        return 0
    return min(dt, MAX_SAMPLE_STEP_MS)


def _aoi_key(point: TrackingPoint, aoi_key_by_id: dict[str, str]) -> str:
    metadata = _meta(point)
    if point.aoi_id and point.aoi_id in aoi_key_by_id:
        return aoi_key_by_id[point.aoi_id]
    target_zone = metadata.get("target_zone")
    if target_zone:
        return str(target_zone)
    return OUTSIDE_AOI


def _slide_version(point: TrackingPoint, session: Session, lesson_layout_version: str = "v1") -> str:
    metadata = _meta(point)
    return str(metadata.get("slide_version") or metadata.get("layout_version") or lesson_layout_version or "v1")


def build_fixations_for_session(
    session: Session,
    points: list[TrackingPoint],
    aoi_key_by_id: dict[str, str] | None = None,
    lesson_layout_version: str = "v1",
) -> tuple[list[FixationEvent], dict]:
    """Build analytics-only fixation events without changing gaze inference output."""
    aoi_key_by_id = aoi_key_by_id or {}
    sorted_points = sorted(points, key=lambda point: point.timestamp_ms)
    if not sorted_points:
        return [], {
            "total_samples": 0,
            "valid_content_samples": 0,
            "tracking_coverage": 0,
            "excluded_samples": 0,
        }

    total_samples = len(sorted_points)
    valid_points = [point for point in sorted_points if _is_valid_content_sample(point)]
    valid_content_samples = len(valid_points)
    tracking_coverage = valid_content_samples / total_samples if total_samples else 0

    fixations: list[FixationEvent] = []
    current: dict | None = None
    exposure_by_slide: defaultdict[str, int] = defaultdict(int)
    previous_slide_id: str | None = None

    def flush() -> None:
        nonlocal current
        if not current:
            return
        if current["duration_ms"] >= MIN_FIXATION_DURATION_MS:
            fixations.append(
                FixationEvent(
                    student_id=session.user_id,
                    session_id=session.session_id,
                    lesson_id=session.lesson_id,
                    slide_id=current["slide_id"],
                    slide_version=current["slide_version"],
                    exposure_id=current["exposure_id"],
                    fixation_id=f"FX_{session.session_id}_{len(fixations) + 1}",
                    aoi_key=current["aoi_key"],
                    started_at_ms=current["started_at_ms"],
                    duration_ms=current["duration_ms"],
                    valid_sample_count=current["valid_sample_count"],
                    sample_count=current["sample_count"],
                    tracking_coverage=tracking_coverage,
                )
            )
        current = None

    valid_set = {point.point_id for point in valid_points}
    for index, point in enumerate(sorted_points):
        if point.point_id not in valid_set:
            flush()
            continue

        metadata = _meta(point)
        slide_id = str(metadata.get("slide_id"))
        if slide_id != previous_slide_id:
            exposure_by_slide[slide_id] += 1
            previous_slide_id = slide_id
            flush()

        step_ms = _sample_duration(sorted_points, index)
        if step_ms <= 0:
            continue

        event_aoi_key = _aoi_key(point, aoi_key_by_id)
        slide_version = _slide_version(point, session, lesson_layout_version)
        exposure_id = exposure_by_slide[slide_id]
        same_group = bool(
            current
            and current["slide_id"] == slide_id
            and current["slide_version"] == slide_version
            and current["exposure_id"] == exposure_id
            and current["aoi_key"] == event_aoi_key
            and point.timestamp_ms - current["last_at_ms"] <= MAX_FIXATION_GAP_MS
        )
        if not same_group:
            flush()
            current = {
                "slide_id": slide_id,
                "slide_version": slide_version,
                "exposure_id": exposure_id,
                "aoi_key": event_aoi_key,
                "started_at_ms": point.timestamp_ms,
                "last_at_ms": point.timestamp_ms,
                "duration_ms": 0,
                "valid_sample_count": 0,
                "sample_count": 0,
            }

        current["duration_ms"] += step_ms
        current["last_at_ms"] = point.timestamp_ms
        current["valid_sample_count"] += 1
        current["sample_count"] += 1

    flush()
    return fixations, {
        "total_samples": total_samples,
        "valid_content_samples": valid_content_samples,
        "tracking_coverage": tracking_coverage,
        "excluded_samples": total_samples - valid_content_samples,
        "fixation_count": len(fixations),
    }


def benjamini_hochberg(p_values: list[float]) -> list[float]:
    if not p_values:
        return []
    indexed = sorted(enumerate(p_values), key=lambda item: item[1])
    adjusted = [1.0] * len(p_values)
    running = 1.0
    m = len(p_values)
    for rank, (index, p_value) in reversed(list(enumerate(indexed, start=1))):
        running = min(running, p_value * m / rank)
        adjusted[index] = min(1.0, running)
    return adjusted


def transition_matrix(fixations: list[FixationEvent], min_expected: float = MIN_EXPECTED_COUNT) -> dict:
    groups: defaultdict[tuple[str, str, str, str, int], list[FixationEvent]] = defaultdict(list)
    for fixation in fixations:
        groups[
            (
                fixation.student_id,
                fixation.session_id,
                fixation.slide_id,
                fixation.slide_version,
                fixation.exposure_id,
            )
        ].append(fixation)

    transitions = Counter()
    students_by_transition: defaultdict[tuple[str, str], set[str]] = defaultdict(set)
    sessions_by_transition: defaultdict[tuple[str, str], set[str]] = defaultdict(set)
    exposures_by_transition: defaultdict[tuple[str, str], set[tuple[str, int]]] = defaultdict(set)
    representative_sequences = Counter()

    for key, items in groups.items():
        sequence = [item.aoi_key for item in sorted(items, key=lambda fixation: fixation.started_at_ms)]
        collapsed = []
        for aoi_key in sequence:
            if not collapsed or collapsed[-1] != aoi_key:
                collapsed.append(aoi_key)
        if len(collapsed) >= 2:
            representative_sequences[tuple(collapsed[:6])] += 1
        for source, target in zip(collapsed, collapsed[1:]):
            pair = (source, target)
            transitions[pair] += 1
            students_by_transition[pair].add(key[0])
            sessions_by_transition[pair].add(key[1])
            exposures_by_transition[pair].add((key[2], key[4]))

    row_totals = Counter()
    col_totals = Counter()
    for (source, target), count in transitions.items():
        row_totals[source] += count
        col_totals[target] += count

    total = sum(transitions.values())
    rows = []
    p_values = []
    for (source, target), observed in sorted(transitions.items()):
        expected = (row_totals[source] * col_totals[target] / total) if total else 0
        row_prop = row_totals[source] / total if total else 0
        col_prop = col_totals[target] / total if total else 0
        denom = sqrt(expected * (1 - row_prop) * (1 - col_prop)) if expected else 0
        residual = (observed - expected) / denom if denom else 0
        p_value = erfc(abs(residual) / sqrt(2)) if denom else 1.0
        p_values.append(p_value)
        rows.append(
            {
                "source_aoi": source,
                "target_aoi": target,
                "observed_count": observed,
                "probability": observed / row_totals[source] if row_totals[source] else 0,
                "expected_count": expected,
                "adjusted_residual": residual,
                "p_value": p_value,
                "contributing_students": len(students_by_transition[(source, target)]),
                "contributing_sessions": len(sessions_by_transition[(source, target)]),
                "contributing_exposures": len(exposures_by_transition[(source, target)]),
                "passes_support": expected >= min_expected,
            }
        )

    adjusted = benjamini_hochberg(p_values)
    for index, adjusted_p in enumerate(adjusted):
        rows[index]["adjusted_p_value"] = adjusted_p
        rows[index]["significant"] = (
            rows[index]["passes_support"]
            and rows[index]["contributing_students"] >= MIN_CONTRIBUTING_STUDENTS
            and adjusted_p <= FDR_ALPHA
        )

    sequences = [
        {"sequence": list(sequence), "count": count}
        for sequence, count in representative_sequences.most_common(5)
    ]
    return {
        "algorithm_version": ANALYTICS_VERSION,
        "lag": 1,
        "total_transitions": total,
        "min_expected_count": min_expected,
        "min_contributing_students": MIN_CONTRIBUTING_STUDENTS,
        "alpha": FDR_ALPHA,
        "status": "ready" if total >= MIN_VALID_TRANSITIONS else "insufficient_data",
        "reason": None if total >= MIN_VALID_TRANSITIONS else "Chưa đủ dữ liệu transition hợp lệ.",
        "transitions": rows,
        "representative_sequences": sequences,
    }


def _slide_title(slide_id: str) -> str:
    if slide_id.startswith("slide-"):
        suffix = slide_id.split("-")[-1]
        if suffix.isdigit():
            return f"Slide {int(suffix)}"
    return slide_id


def summarize_slide_metrics(
    fixations: list[FixationEvent],
    quality_by_session: dict[str, dict],
    user_label_by_id: dict[str, str],
) -> dict:
    session_slide: defaultdict[tuple[str, str, str, int], dict] = defaultdict(
        lambda: {
            "valid_viewing_ms": 0,
            "fixation_count": 0,
            "aoi_keys": set(),
            "learning_dwell_ms": 0,
            "started_at_ms": None,
            "student_id": None,
            "tracking_coverage": 0,
        }
    )
    for fixation in fixations:
        key = (fixation.session_id, fixation.slide_id, fixation.slide_version, fixation.exposure_id)
        row = session_slide[key]
        row["student_id"] = fixation.student_id
        row["valid_viewing_ms"] += fixation.duration_ms
        row["fixation_count"] += 1
        row["aoi_keys"].add(fixation.aoi_key)
        if fixation.aoi_key != OUTSIDE_AOI:
            row["learning_dwell_ms"] += fixation.duration_ms
        row["started_at_ms"] = fixation.started_at_ms if row["started_at_ms"] is None else min(row["started_at_ms"], fixation.started_at_ms)
        row["tracking_coverage"] = quality_by_session.get(fixation.session_id, {}).get("tracking_coverage", 0)

    student_slide: defaultdict[tuple[str, str, str], list[dict]] = defaultdict(list)
    for (_, slide_id, slide_version, _), value in session_slide.items():
        student_slide[(value["student_id"], slide_id, slide_version)].append(value)

    student_rows = []
    by_slide_student: defaultdict[tuple[str, str], list[dict]] = defaultdict(list)
    for (student_id, slide_id, slide_version), exposures in student_slide.items():
        valid_viewing_values = [item["valid_viewing_ms"] for item in exposures]
        valid_viewing_ms = sum(valid_viewing_values)
        fixation_count = sum(item["fixation_count"] for item in exposures)
        learning_dwell_ms = sum(item["learning_dwell_ms"] for item in exposures)
        aoi_keys = set().union(*(item["aoi_keys"] for item in exposures))
        tracking_values = [item["tracking_coverage"] for item in exposures]
        row = {
            "student_id": student_id,
            "student_name": user_label_by_id.get(student_id, student_id),
            "slide_id": slide_id,
            "slide_title": _slide_title(slide_id),
            "slide_version": slide_version,
            "exposure_count": len(exposures),
            "valid_viewing_ms": valid_viewing_ms,
            "median_exposure_ms": median(valid_viewing_values) if valid_viewing_values else 0,
            "fixation_count": fixation_count,
            "aoi_coverage": len(aoi_keys),
            "important_aoi_dwell_share": (learning_dwell_ms / valid_viewing_ms) if valid_viewing_ms else 0,
            "tracking_coverage": median(tracking_values) if tracking_values else 0,
        }
        student_rows.append(row)
        by_slide_student[(slide_id, slide_version)].append(row)

    cohort_rows = []
    medians_by_slide = {}
    for (slide_id, slide_version), rows in by_slide_student.items():
        values = [row["valid_viewing_ms"] for row in rows if row["tracking_coverage"] >= MIN_TRACKING_COVERAGE]
        cohort_median = median(values) if values else 0
        medians_by_slide[(slide_id, slide_version)] = cohort_median
        cohort_rows.append(
            {
                "slide_id": slide_id,
                "slide_title": _slide_title(slide_id),
                "slide_version": slide_version,
                "valid_students": len(values),
                "cohort_median_valid_viewing_ms": cohort_median,
                "median_tracking_coverage": median([row["tracking_coverage"] for row in rows]) if rows else 0,
                "revisit_rate": sum(1 for row in rows if row["exposure_count"] > 1) / len(rows) if rows else 0,
                "median_aoi_coverage": median([row["aoi_coverage"] for row in rows]) if rows else 0,
            }
        )

    for row in student_rows:
        baseline = medians_by_slide.get((row["slide_id"], row["slide_version"]), 0)
        row["relative_viewing_time"] = (row["valid_viewing_ms"] / baseline) if baseline else None
        row["cohort_baseline_ms"] = baseline
        row["data_quality"] = "ok" if row["tracking_coverage"] >= MIN_TRACKING_COVERAGE else "low_tracking_coverage"

    return {
        "student_slide_rows": sorted(student_rows, key=lambda row: (row["student_name"], row["slide_id"])),
        "cohort_slide_rows": sorted(cohort_rows, key=lambda row: row["slide_id"]),
    }


def summarize_aoi_metrics(fixations: list[FixationEvent], aoi_label_by_key: dict[str, dict]) -> list[dict]:
    by_slide_aoi: defaultdict[tuple[str, str, str], dict] = defaultdict(
        lambda: {
            "dwell_ms": 0,
            "fixation_count": 0,
            "students": set(),
            "first_hit_values": [],
            "revisit_sessions": 0,
            "session_visits": defaultdict(int),
        }
    )
    starts: dict[tuple[str, str, str, int], int] = {}
    for fixation in fixations:
        exposure_key = (fixation.session_id, fixation.slide_id, fixation.slide_version, fixation.exposure_id)
        starts[exposure_key] = min(starts.get(exposure_key, fixation.started_at_ms), fixation.started_at_ms)

    for fixation in fixations:
        key = (fixation.slide_id, fixation.slide_version, fixation.aoi_key)
        row = by_slide_aoi[key]
        row["dwell_ms"] += fixation.duration_ms
        row["fixation_count"] += 1
        row["students"].add(fixation.student_id)
        exposure_key = (fixation.session_id, fixation.slide_id, fixation.slide_version, fixation.exposure_id)
        row["first_hit_values"].append(max(0, fixation.started_at_ms - starts.get(exposure_key, fixation.started_at_ms)))
        row["session_visits"][(fixation.session_id, fixation.exposure_id)] += 1

    rows = []
    for (slide_id, slide_version, aoi_key), value in by_slide_aoi.items():
        visits = list(value["session_visits"].values())
        label = aoi_label_by_key.get(aoi_key, {})
        rows.append(
            {
                "slide_id": slide_id,
                "slide_title": _slide_title(slide_id),
                "slide_version": slide_version,
                "aoi_key": aoi_key,
                "aoi_name": label.get("aoi_name") or ("Ngoài vùng AOI" if aoi_key == OUTSIDE_AOI else aoi_key),
                "aoi_type": label.get("aoi_type") or ("outside" if aoi_key == OUTSIDE_AOI else "content"),
                "is_learning_area": label.get("is_learning_area", aoi_key != OUTSIDE_AOI),
                "dwell_ms": value["dwell_ms"],
                "fixation_count": value["fixation_count"],
                "students_reached": len(value["students"]),
                "median_time_to_first_fixation_ms": median(value["first_hit_values"]) if value["first_hit_values"] else None,
                "revisit_rate": sum(1 for count in visits if count > 1) / len(visits) if visits else 0,
            }
        )
    return sorted(rows, key=lambda row: (row["slide_id"], -row["dwell_ms"]))


def generate_insights(cohort_rows: list[dict], aoi_rows: list[dict]) -> list[dict]:
    insights = []
    if not cohort_rows:
        return insights
    high_rvt_slide = max(cohort_rows, key=lambda row: row["cohort_median_valid_viewing_ms"])
    if high_rvt_slide["valid_students"] >= MIN_CONTRIBUTING_STUDENTS:
        insights.append(
            {
                "kind": "review_slide_time",
                "severity": "info",
                "title": f"{high_rvt_slide['slide_title']} có thời gian xem trung vị cao nhất",
                "evidence": f"N={high_rvt_slide['valid_students']} học sinh hợp lệ, median {round(high_rvt_slide['cohort_median_valid_viewing_ms'] / 1000, 1)}s.",
                "description": "Đây là tín hiệu để giáo viên kiểm tra lại độ dài hoặc độ khó của slide, không phải kết luận về mức tập trung.",
                "slide_id": high_rvt_slide["slide_id"],
            }
        )

    low_reach = [
        row
        for row in aoi_rows
        if row["is_learning_area"] and row["aoi_key"] != OUTSIDE_AOI and row["students_reached"] < MIN_CONTRIBUTING_STUDENTS
    ]
    if low_reach:
        row = low_reach[0]
        insights.append(
            {
                "kind": "low_aoi_reach",
                "severity": "warning",
                "title": f"{row['aoi_name']} trên {row['slide_title']} có ít học sinh quan sát",
                "evidence": f"{row['students_reached']} học sinh có fixation hợp lệ tại AOI này.",
                "description": "Nên kiểm tra bố cục hoặc cách đặt nội dung nếu đây là vùng học tập quan trọng.",
                "slide_id": row["slide_id"],
            }
        )
    return insights[:4]


async def build_lesson_analytics(db: AsyncSession, lesson_id: str) -> dict:
    lesson_result = await db.execute(select(Lesson).where(Lesson.lesson_id == lesson_id))
    lesson = lesson_result.scalar_one_or_none()
    lesson_layout_version = lesson.layout_version if lesson else "v1"
    session_result = await db.execute(
        select(Session)
        .where(Session.lesson_id == lesson_id)
        .where(Session.session_type == "student_learning")
        .order_by(Session.started_at)
    )
    sessions = list(session_result.scalars().all())
    session_ids = [session.session_id for session in sessions]
    if not session_ids:
        return _empty_payload(lesson_id, reason="Chưa có phiên học chính thức cho bài học này.")

    point_result = await db.execute(
        select(TrackingPoint)
        .where(TrackingPoint.session_id.in_(session_ids))
        .order_by(TrackingPoint.session_id, TrackingPoint.timestamp_ms)
    )
    points_by_session: defaultdict[str, list[TrackingPoint]] = defaultdict(list)
    for point in point_result.scalars().all():
        points_by_session[point.session_id].append(point)

    aoi_result = await db.execute(select(AOIDefinition).where(AOIDefinition.lesson_id == lesson_id))
    aoi_rows = list(aoi_result.scalars().all())
    aoi_key_by_id = {row.aoi_id: row.aoi_key for row in aoi_rows}
    aoi_label_by_key = {
        row.aoi_key: {"aoi_name": row.aoi_name, "aoi_type": row.aoi_type, "is_learning_area": row.is_learning_area}
        for row in aoi_rows
    }
    user_ids = {session.user_id for session in sessions}
    user_result = await db.execute(select(User).where(User.user_id.in_(user_ids)))
    user_label_by_id = {
        user.user_id: (f"{user.full_name} ({user.student_code})" if user.student_code else user.full_name or user.user_id)
        for user in user_result.scalars().all()
    }

    all_fixations: list[FixationEvent] = []
    quality_by_session = {}
    for session in sessions:
        if not _is_learning_session(session):
            continue
        fixations, quality = build_fixations_for_session(
            session,
            points_by_session.get(session.session_id, []),
            aoi_key_by_id,
            lesson_layout_version=lesson_layout_version,
        )
        all_fixations.extend(fixations)
        quality_by_session[session.session_id] = quality

    slide_summary = summarize_slide_metrics(all_fixations, quality_by_session, user_label_by_id)
    aoi_summary = summarize_aoi_metrics(all_fixations, aoi_label_by_key)
    lsa = transition_matrix(all_fixations)
    valid_sessions = sum(1 for quality in quality_by_session.values() if quality.get("tracking_coverage", 0) >= MIN_TRACKING_COVERAGE)
    total_samples = sum(quality.get("total_samples", 0) for quality in quality_by_session.values())
    valid_samples = sum(quality.get("valid_content_samples", 0) for quality in quality_by_session.values())
    payload = {
        "lesson_id": lesson_id,
        "algorithm_version": ANALYTICS_VERSION,
        "thresholds": {
            "min_tracking_coverage": MIN_TRACKING_COVERAGE,
            "min_valid_transitions": MIN_VALID_TRANSITIONS,
            "min_contributing_students": MIN_CONTRIBUTING_STUDENTS,
            "min_expected_count": MIN_EXPECTED_COUNT,
            "fdr_alpha": FDR_ALPHA,
        },
        "summary": {
            "sessions": len(sessions),
            "valid_sessions": valid_sessions,
            "students": len({session.user_id for session in sessions}),
            "valid_students": len({session.user_id for session in sessions if quality_by_session.get(session.session_id, {}).get("tracking_coverage", 0) >= MIN_TRACKING_COVERAGE}),
            "total_samples": total_samples,
            "valid_content_samples": valid_samples,
            "tracking_coverage": valid_samples / total_samples if total_samples else 0,
            "fixation_count": len(all_fixations),
        },
        **slide_summary,
        "aoi_rows": aoi_summary,
        "lsa": lsa,
        "insights": generate_insights(slide_summary["cohort_slide_rows"], aoi_summary),
        "data_quality": [
            {
                "session_id": session.session_id,
                "student_id": session.user_id,
                "student_name": user_label_by_id.get(session.user_id, session.user_id),
                **quality_by_session.get(session.session_id, {}),
            }
            for session in sessions
        ],
    }
    if not all_fixations:
        payload["empty_reason"] = "Có phiên học nhưng chưa có fixation hợp lệ trong vùng nội dung slide."
    return payload


async def build_session_analytics(db: AsyncSession, session_id: str) -> dict:
    result = await db.execute(select(Session).where(Session.session_id == session_id))
    session = result.scalar_one()
    lesson_payload = await build_lesson_analytics(db, session.lesson_id)
    student_rows = [row for row in lesson_payload["student_slide_rows"] if row["student_id"] == session.user_id]
    session_quality = [row for row in lesson_payload["data_quality"] if row["session_id"] == session_id]
    return {
        **lesson_payload,
        "session_id": session_id,
        "student_focus": student_rows,
        "session_quality": session_quality[0] if session_quality else None,
    }


def _empty_payload(lesson_id: str, reason: str) -> dict:
    return {
        "lesson_id": lesson_id,
        "algorithm_version": ANALYTICS_VERSION,
        "thresholds": {
            "min_tracking_coverage": MIN_TRACKING_COVERAGE,
            "min_valid_transitions": MIN_VALID_TRANSITIONS,
            "min_contributing_students": MIN_CONTRIBUTING_STUDENTS,
            "min_expected_count": MIN_EXPECTED_COUNT,
            "fdr_alpha": FDR_ALPHA,
        },
        "summary": {
            "sessions": 0,
            "valid_sessions": 0,
            "students": 0,
            "valid_students": 0,
            "total_samples": 0,
            "valid_content_samples": 0,
            "tracking_coverage": 0,
            "fixation_count": 0,
        },
        "student_slide_rows": [],
        "cohort_slide_rows": [],
        "aoi_rows": [],
        "lsa": transition_matrix([]),
        "insights": [],
        "data_quality": [],
        "empty_reason": reason,
    }
