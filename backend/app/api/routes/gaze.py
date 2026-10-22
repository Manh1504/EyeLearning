from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core import rediscache
from app.core.config import settings
from app.core.ratelimit import rate_limit
from app.db.session import get_db
from app.models.auth import User
from app.models.calibration import CalibrationParam, Device
from app.models.course import Enrollment, Lesson, LessonContent, Module
from app.models.gaze import GazeEvent, GazeSessionStat, GazeSlideStat, LearningSession
from app.schemas.gaze import (
    GazeBatchIn,
    GazeBatchOut,
    GazeSampleIn,
    LearningSessionCreateIn,
    LearningSessionEndIn,
    LearningSessionOut,
)
from app.services import analytics, mastery

router = APIRouter(tags=["gaze"])

DEFAULT_FINGERPRINT = "web-default"


async def _upsert_device(
    db: AsyncSession,
    *,
    user_id: str,
    fingerprint: str,
    screen_width_px: int | None,
    screen_height_px: int | None,
) -> Device:
    stmt = (
        select(Device)
        .where(Device.user_id == user_id, Device.device_fingerprint == fingerprint)
        .with_for_update()
    )
    device = (await db.execute(stmt)).scalar_one_or_none()
    if device is None:
        device = Device(
            user_id=user_id,
            device_fingerprint=fingerprint,
            screen_width_px=screen_width_px,
            screen_height_px=screen_height_px,
        )
        db.add(device)
        await db.flush()
    else:
        if screen_width_px:
            device.screen_width_px = screen_width_px
        if screen_height_px:
            device.screen_height_px = screen_height_px
    return device


async def _active_param(
    db: AsyncSession, user_id: str, device_id: str
) -> CalibrationParam | None:
    stmt = select(CalibrationParam).where(
        CalibrationParam.user_id == user_id,
        CalibrationParam.device_id == device_id,
        CalibrationParam.is_active.is_(True),
    )
    return (await db.execute(stmt)).scalar_one_or_none()


@router.post("/api/learning-sessions", response_model=LearningSessionOut, status_code=201)
async def create_learning_session(
    body: LearningSessionCreateIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    enrollment = await db.get(Enrollment, body.enrollment_id)
    if enrollment is None or enrollment.student_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy đăng ký")
    lesson = await db.get(Lesson, body.lesson_id)
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài học")

    device = await _upsert_device(
        db,
        user_id=user.id,
        fingerprint=body.device_fingerprint,
        screen_width_px=body.screen_width_px,
        screen_height_px=body.screen_height_px,
    )
    params = await _active_param(db, user.id, device.id)

    # Xác định chế độ học dựa trên các phiên trước.
    # - Chưa từng học bài này → "first" (tracking gaze).
    # - Đã có phiên trước → "continue": dùng lại phiên cũ đang mở để ghi tiếp gaze,
    #   tránh tạo phiên trùng.
    existing = (
        await db.execute(
            select(LearningSession)
            .where(
                LearningSession.enrollment_id == enrollment.id,
                LearningSession.lesson_id == lesson.id,
            )
            .order_by(LearningSession.started_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if existing is not None:
        # Học tiếp: tái sử dụng phiên cũ nếu nó vẫn mở; nếu đã đóng thì mở lại.
        if existing.status != "in_progress":
            existing.status = "in_progress"
            existing.ended_at = None
            await db.commit()
            await db.refresh(existing)
        return LearningSessionOut(
            id=existing.id,
            enrollment_id=existing.enrollment_id,
            lesson_id=existing.lesson_id,
            device_id=existing.device_id,
            calibrated=existing.calibration_param_id is not None,
            status=existing.status,
            tracking_consent=existing.tracking_consent,
            mode="continue",
        )

    session = LearningSession(
        enrollment_id=enrollment.id,
        lesson_id=lesson.id,
        device_id=device.id,
        calibration_param_id=params.id if params else None,
        tracking_consent=body.tracking_consent,
    )
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return LearningSessionOut(
        id=session.id,
        enrollment_id=session.enrollment_id,
        lesson_id=session.lesson_id,
        device_id=session.device_id,
        calibrated=bool(params and params.has_model),
        status=session.status,
        tracking_consent=session.tracking_consent,
        mode="first",
    )


@router.patch("/api/learning-sessions/{session_id}", response_model=LearningSessionOut)
async def end_learning_session(
    session_id: str,
    body: LearningSessionEndIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(LearningSession, session_id)
    if session is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiên học")
    enrollment = await db.get(Enrollment, session.enrollment_id)
    if enrollment is None or enrollment.student_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    session.status = body.status
    session.ended_at = datetime.now(timezone.utc)
    await db.commit()
    return LearningSessionOut(
        id=session.id,
        enrollment_id=session.enrollment_id,
        lesson_id=session.lesson_id,
        device_id=session.device_id,
        calibrated=session.calibration_param_id is not None,
        status=session.status,
        tracking_consent=session.tracking_consent,
    )


def _ts_to_datetime(ts_ms: float) -> datetime:
    now = datetime.now(timezone.utc)
    try:
        dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
    except (OverflowError, OSError, ValueError):
        return now
    if dt > now or (now - dt).total_seconds() > 86400:
        return now
    return dt


def _quiz_gaze_batch(
    samples: list[GazeSampleIn], session_id: str, min_interval_ms: float
) -> tuple[list[GazeEvent], int, int, int]:
    """Chuẩn hoá một batch gaze của BÀI TẬP TRẮC NGHIỆM (không có slide).

    Toạ độ giữ nguyên theo VIEWPORT (AI service trả về), ghi `surface='quiz'` và
    `lesson_content_id=NULL`. Sample "ngoài màn hình" (-1,-1 do no_face) vẫn đếm
    vào `total`/`on_screen` nhưng không tạo dòng gaze_events (giống bài giảng).

    Trả về (events, total_samples, on_screen_samples, view_ms).
    """
    ordered = sorted(samples, key=lambda s: s.ts)
    events: list[GazeEvent] = []
    kept_ts: list[float] = []
    on_screen = 0
    last_kept = float("-inf")
    for s in ordered:
        if not (0.0 <= s.x <= 1.0 and 0.0 <= s.y <= 1.0):
            continue
        on_screen += 1
        if s.ts - last_kept >= min_interval_ms:
            last_kept = s.ts
            kept_ts.append(s.ts)
            events.append(
                GazeEvent(
                    learning_session_id=session_id,
                    lesson_content_id=None,
                    event_time=_ts_to_datetime(s.ts),
                    gaze_x=s.x,
                    gaze_y=s.y,
                    surface="quiz",
                )
            )
    total = len(ordered)
    if not kept_ts:
        return events, total, on_screen, 0
    span = kept_ts[-1] - kept_ts[0]
    if span <= 0:
        span = min_interval_ms
    return events, total, on_screen, int(span)


async def _upsert_session_stats(
    db: AsyncSession,
    session_id: str,
    total: int,
    on_screen: int,
    view_ms: int,
) -> None:
    """Cộng dồn tổng hợp gaze mức PHIÊN (dùng cho bài không có slide)."""
    stmt = pg_insert(GazeSessionStat).values(
        learning_session_id=session_id,
        total_samples=total,
        on_screen_samples=on_screen,
        view_ms=view_ms,
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=[GazeSessionStat.learning_session_id],
        set_=dict(
            total_samples=GazeSessionStat.total_samples + total,
            on_screen_samples=GazeSessionStat.on_screen_samples + on_screen,
            view_ms=GazeSessionStat.view_ms + view_ms,
            updated_at=func.now(),
        ),
    )
    await db.execute(stmt)


@router.post(
    "/api/lessons/{lesson_id}/gaze-samples",
    response_model=GazeBatchOut,
    dependencies=[Depends(rate_limit(60, 60, "gaze"))],
)
async def post_gaze_samples(
    lesson_id: str,
    body: GazeBatchIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài học")

    if body.source == "simulated":
        # Chặn dữ liệu mô phỏng làm nhiễu heatmap/engagement — chỉ cho real
        return GazeBatchOut(ok=True, inserted=0)

    if len(body.samples) > settings.gaze_batch_max:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Batch quá lớn")

    session: LearningSession | None = None
    if body.learning_session_id:
        session = await db.get(LearningSession, body.learning_session_id)
        if session is None or session.lesson_id != lesson_id:
            raise HTTPException(
                status.HTTP_404_NOT_FOUND, detail="Không tìm thấy phiên học"
            )
        enrollment = await db.get(Enrollment, session.enrollment_id)
        if enrollment is None or enrollment.student_id != user.id:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Không có quyền")
    else:
        stmt = (
            select(LearningSession)
            .join(Enrollment, Enrollment.id == LearningSession.enrollment_id)
            .where(
                LearningSession.lesson_id == lesson_id,
                Enrollment.student_id == user.id,
                LearningSession.status == "in_progress",
            )
            .order_by(LearningSession.started_at.desc())
        )
        session = (await db.execute(stmt)).scalars().first()
        if session is None:
            module = await db.get(Module, lesson.module_id)
            enrollment = (
                await db.execute(
                    select(Enrollment).where(
                        Enrollment.course_id == module.course_id,
                        Enrollment.student_id == user.id,
                    )
                )
            ).scalar_one_or_none()
            if enrollment is None:
                raise HTTPException(
                    status.HTTP_403_FORBIDDEN, detail="Chưa đăng ký khóa học"
                )
            device = await _upsert_device(
                db,
                user_id=user.id,
                fingerprint=DEFAULT_FINGERPRINT,
                screen_width_px=None,
                screen_height_px=None,
            )
            session = LearningSession(
                enrollment_id=enrollment.id,
                lesson_id=lesson_id,
                device_id=device.id,
            )
            db.add(session)
            await db.flush()

    if not session.tracking_consent:
        return GazeBatchOut(ok=True, inserted=0)

    min_interval_ms = 1000.0 / max(settings.gaze_downsample_hz, 0.1)

    if lesson.kind == "quiz":
        # Bài tập trắc nghiệm: không có slide để map toạ độ/AOI/heatmap. Ghi gaze
        # thô theo viewport (surface='quiz') + tổng hợp mức phiên; bỏ qua
        # mastery/engagement/heatmap vì không có nội dung để gắn vào.
        events, total, on_screen, view_ms = _quiz_gaze_batch(
            body.samples, session.id, min_interval_ms
        )
        if events:
            db.add_all(events)
        if total:
            await _upsert_session_stats(db, session.id, total, on_screen, view_ms)
        await db.commit()
        return GazeBatchOut(ok=True, inserted=len(events))

    content_ids = {s.lesson_content_id for s in body.samples}
    valid_ids = set(
        (
            await db.execute(
                select(LessonContent.id).where(
                    LessonContent.lesson_id == lesson_id,
                    LessonContent.id.in_(content_ids),
                )
            )
        ).scalars().all()
    )

    by_content: dict[str, list] = {}
    raw_counts: dict[str, int] = {}
    on_slide_counts: dict[str, int] = {}
    for s in body.samples:
        if s.lesson_content_id not in valid_ids:
            continue
        bucket = by_content.setdefault(s.lesson_content_id, [])
        raw_counts[s.lesson_content_id] = raw_counts.get(s.lesson_content_id, 0) + 1
        if 0.0 <= s.x <= 1.0 and 0.0 <= s.y <= 1.0:
            on_slide_counts[s.lesson_content_id] = (
                on_slide_counts.get(s.lesson_content_id, 0) + 1
            )
        bucket.append(s)

    events: list[GazeEvent] = []
    kept_points: dict[str, list[tuple[float, float, float]]] = {}
    view_ms_by_content: dict[str, int] = {}
    nominal_dwell = int(1000.0 / max(settings.gaze_downsample_hz, 0.1))
    for content_id, bucket in by_content.items():
        bucket.sort(key=lambda s: s.ts)
        kept: list[tuple[float, float, float]] = []
        last_kept = float("-inf")
        for s in bucket:
            # Chỉ ghi gaze_events cho điểm hợp lệ trong [0,1]; sample "ngoài màn
            # hình" (AI báo no_face → -1,-1) vẫn đếm vào total/on_slide để tỷ lệ
            # on_slide phản ánh đúng, nhưng không thêm chấm làm nhiễu heatmap.
            if not (0.0 <= s.x <= 1.0 and 0.0 <= s.y <= 1.0):
                continue
            if s.ts - last_kept >= min_interval_ms:
                last_kept = s.ts
                kept.append((s.x, s.y, s.ts))
        if kept:
            kept_points[content_id] = kept
            events.extend(
                GazeEvent(
                    learning_session_id=session.id,
                    lesson_content_id=content_id,
                    event_time=_ts_to_datetime(ts),
                    gaze_x=x,
                    gaze_y=y,
                    surface="slide",
                )
                for x, y, ts in kept
            )
            span = kept[-1][2] - kept[0][2]
            if span <= 0:
                span = min_interval_ms
            view_ms_by_content[content_id] = int(span)

    if events:
        db.add_all(events)

    # Cộng dồn dwell vào aoi_dwell_stats cho từng AOI (chỉ dữ liệu thật).
    if session and session.tracking_consent:
        for content_id, kept in kept_points.items():
            dwell_points: list[tuple[float, float, int]] = []
            for i, (x, y, ts) in enumerate(kept):
                if i + 1 < len(kept):
                    d = min(kept[i + 1][2] - ts, settings.mastery_max_dwell_ms)
                else:
                    d = nominal_dwell
                dwell_points.append((x, y, int(d)))
            await mastery.accumulate_dwell(db, session.id, content_id, dwell_points)

    for content_id, raw in raw_counts.items():
        stmt = pg_insert(GazeSlideStat).values(
            learning_session_id=session.id,
            lesson_content_id=content_id,
            total_samples=raw,
            on_slide_samples=on_slide_counts.get(content_id, 0),
            view_ms=view_ms_by_content.get(content_id, 0),
        )
        stmt = stmt.on_conflict_do_update(
            constraint="uq_gaze_slide_stats",
            set_=dict(
                total_samples=GazeSlideStat.total_samples + raw,
                on_slide_samples=GazeSlideStat.on_slide_samples
                + on_slide_counts.get(content_id, 0),
                view_ms=GazeSlideStat.view_ms + view_ms_by_content.get(content_id, 0),
            ),
        )
        await db.execute(stmt)

    await db.commit()

    # Tự cập nhật heatmap_aggregates + engagement_scores + mastery GẦN THỜI GIAN
    # THỰC để dashboard giáo viên thấy số mới ngay, không cần recompute thủ công.
    # Throttle bằng Redis lock để không chạy lại aggregates ở mỗi batch (~4Hz).
    if session and session.tracking_consent and raw_counts:
        if await rediscache.try_acquire_lock(
            f"agg:throttle:{lesson_id}", settings.aggregate_refresh_throttle_seconds
        ):
            await analytics.refresh_aggregates(
                db,
                lesson_id,
                content_ids=sorted(raw_counts.keys()),
                enrollment_id=session.enrollment_id,
            )
            await mastery.refresh_mastery(db, lesson_id, session.enrollment_id)
            await db.commit()

    # Dữ liệu gaze mới → heatmap cache của lesson đã cũ (bump generation).
    await analytics.invalidate_heatmap_cache(lesson_id)

    return GazeBatchOut(ok=True, inserted=len(events))
