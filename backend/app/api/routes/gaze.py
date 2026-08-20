from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.auth import User
from app.models.calibration import CalibrationParam, Device
from app.models.course import Enrollment, Lesson, LessonContent, Module
from app.models.gaze import GazeEvent, GazeSlideStat, LearningSession
from app.schemas.gaze import (
    GazeBatchIn,
    GazeBatchOut,
    LearningSessionCreateIn,
    LearningSessionEndIn,
    LearningSessionOut,
)
from app.services import analytics

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
        calibrated=bool(params and params.has_params),
        status=session.status,
        tracking_consent=session.tracking_consent,
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


@router.post("/api/lessons/{lesson_id}/gaze-samples", response_model=GazeBatchOut)
async def post_gaze_samples(
    lesson_id: str,
    body: GazeBatchIn,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài học")

    if len(body.samples) > settings.gaze_batch_max:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Batch quá lớn")

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

    min_interval_ms = 1000.0 / max(settings.gaze_downsample_hz, 0.1)
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
    view_ms_by_content: dict[str, int] = {}
    for content_id, bucket in by_content.items():
        bucket.sort(key=lambda s: s.ts)
        kept_ts: list[float] = []
        last_kept = float("-inf")
        for s in bucket:
            # Chỉ ghi gaze_events cho điểm hợp lệ trong [0,1]; sample "ngoài màn
            # hình" (AI báo no_face → -1,-1) vẫn đếm vào total/on_slide để tỷ lệ
            # on_slide phản ánh đúng, nhưng không thêm chấm làm nhiễu heatmap.
            if not (0.0 <= s.x <= 1.0 and 0.0 <= s.y <= 1.0):
                continue
            if s.ts - last_kept >= min_interval_ms:
                last_kept = s.ts
                kept_ts.append(s.ts)
                events.append(
                    GazeEvent(
                        learning_session_id=session.id,
                        lesson_content_id=content_id,
                        event_time=_ts_to_datetime(s.ts),
                        gaze_x=s.x,
                        gaze_y=s.y,
                    )
                )
        if kept_ts:
            span = kept_ts[-1] - kept_ts[0]
            if span <= 0:
                span = min_interval_ms
            view_ms_by_content[content_id] = int(span)

    if events:
        db.add_all(events)

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

    # Tự cập nhật heatmap_aggregates + engagement_scores GẦN THỜI GIAN THỰC để
    # dashboard giáo viên thấy số mới ngay, không cần bấm recompute thủ công.
    if session and session.tracking_consent and raw_counts:
        await analytics.refresh_aggregates(
            db,
            lesson_id,
            content_ids=sorted(raw_counts.keys()),
            enrollment_id=session.enrollment_id,
        )
        await db.commit()

    return GazeBatchOut(ok=True, inserted=len(events))
