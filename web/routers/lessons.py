from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from web.database import get_db
from web.authz import current_user_from_cookie, ensure_student_can_access_lesson, normalize_role, require_admin_user, require_role, teacher_can_access_lesson
from web.models import AOIDefinition, Lesson, User
from web.schemas import AOIDefinitionOut
from web.services.page_snapshot_service import snapshot_paths

router = APIRouter(tags=["aois"])


DEMO_AOIS = [
    ("video_area", "Video Area", ".video-box", "video", True),
    ("transcript_panel", "Transcript Panel", ".transcript-panel", "text", True),
    ("quiz_area", "Quiz Area", ".quiz-box", "quiz", True),
    ("notes_panel", "Notes Panel", ".notes-panel", "notes", True),
    ("lesson_sidebar", "Lesson Sidebar", ".sidebar", "navigation", False),
    ("lesson_header", "Lesson Header", ".lesson-main h1", "header", False),
    ("top_nav", "Top Navigation", ".topbar", "navigation", False),
    ("tracking_panel", "Tracking Panel", ".status-chips", "control", False),
    ("completion_panel", "Completion Panel", ".finish-btn", "control", False),
]


def _demo_aoi_id(lesson_id: str, aoi_key: str) -> str:
    suffix = lesson_id.replace(" ", "_").upper()
    key = aoi_key.upper().replace("AREA", "").strip("_")
    return f"AOI_{key}_{suffix}"


async def _get_lesson_or_404(lesson_id: str, db: AsyncSession) -> Lesson:
    result = await db.execute(select(Lesson).where(Lesson.lesson_id == lesson_id))
    lesson = result.scalar_one_or_none()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson không tồn tại")
    return lesson


async def _table_exists(db: AsyncSession, table_name: str) -> bool:
    result = await db.execute(text("select to_regclass(:name) is not null"), {"name": f"public.{table_name}"})
    return bool(result.scalar_one())


async def _list_aois(lesson_id: str, db: AsyncSession) -> list[AOIDefinition]:
    await _get_lesson_or_404(lesson_id, db)
    result = await db.execute(
        select(AOIDefinition)
        .where(AOIDefinition.lesson_id == lesson_id)
        .where(AOIDefinition.is_active.is_(True))
        .order_by(AOIDefinition.layout_version, AOIDefinition.aoi_key)
    )
    return list(result.scalars().all())


async def _ensure_can_read_lesson(db: AsyncSession, user: User, lesson_id: str) -> None:
    role = normalize_role(user.role)
    if role == "admin":
        await _get_lesson_or_404(lesson_id, db)
        return
    if role == "teacher" and await teacher_can_access_lesson(db, user, lesson_id):
        return
    if role == "student":
        await ensure_student_can_access_lesson(db, user, lesson_id)
        return
    raise HTTPException(status_code=403, detail="Bạn không có quyền xem bài học này")


async def _seed_demo_aois(lesson_id: str, db: AsyncSession) -> list[AOIDefinition]:
    lesson = await _get_lesson_or_404(lesson_id, db)
    layout_version = lesson.layout_version or "v1"

    result = await db.execute(
        select(AOIDefinition).where(
            AOIDefinition.lesson_id == lesson_id,
            AOIDefinition.layout_version == layout_version,
        )
    )
    existing_by_key = {aoi.aoi_key: aoi for aoi in result.scalars().all()}

    for aoi_key, aoi_name, css_selector, aoi_type, is_learning_area in DEMO_AOIS:
        existing = existing_by_key.get(aoi_key)
        if existing:
            existing.aoi_name = aoi_name
            existing.css_selector = css_selector
            existing.aoi_type = aoi_type
            existing.is_learning_area = is_learning_area
            existing.is_active = True
            continue

        db.add(
            AOIDefinition(
                aoi_id=_demo_aoi_id(lesson_id, aoi_key),
                lesson_id=lesson_id,
                layout_version=layout_version,
                aoi_key=aoi_key,
                aoi_name=aoi_name,
                css_selector=css_selector,
                aoi_type=aoi_type,
                is_learning_area=is_learning_area,
                is_active=True,
            )
        )

    await db.flush()
    return await _list_aois(lesson_id, db)


@router.get("/lessons/{lesson_id}/aois", response_model=list[AOIDefinitionOut])
async def get_lesson_aois(
    lesson_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_can_read_lesson(db, user, lesson_id)
    return await _list_aois(lesson_id, db)


@router.post("/lessons/{lesson_id}/aois/seed-demo", response_model=list[AOIDefinitionOut])
async def seed_lesson_demo_aois(
    lesson_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    require_admin_user(user)
    return await _seed_demo_aois(lesson_id, db)


@router.get("/lectures/{lecture_id}/aois", response_model=list[AOIDefinitionOut])
async def get_lecture_aois_alias(
    lecture_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_can_read_lesson(db, user, lecture_id)
    return await _list_aois(lecture_id, db)


@router.post("/lectures/{lecture_id}/aois/seed-demo", response_model=list[AOIDefinitionOut])
async def seed_lecture_demo_aois_alias(
    lecture_id: str,
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    require_admin_user(user)
    return await _seed_demo_aois(lecture_id, db)


@router.get("/lessons/{lesson_id}/sessions")
async def list_lesson_sessions(
    lesson_id: str,
    include_test: bool = Query(default=False),
    q: str | None = Query(default=None, max_length=120),
    status: str | None = Query(default=None, pattern="^(open|finished)?$"),
    user: User = Depends(current_user_from_cookie),
    db: AsyncSession = Depends(get_db),
):
    await _get_lesson_or_404(lesson_id, db)
    role = require_role(user, {"teacher", "admin"})
    if role == "teacher" and not await teacher_can_access_lesson(db, user, lesson_id):
        raise HTTPException(status_code=403, detail="Bạn không có quyền xem danh sách phiên học")
    if role != "admin":
        include_test = False
    tracking_points_count = (
        "(select count(*) from tracking_points tp where tp.session_id = s.session_id)"
        if await _table_exists(db, "tracking_points")
        else "0"
    )
    metrics_count = (
        "(select count(*) from aoi_metrics am where am.session_id = s.session_id)"
        if await _table_exists(db, "aoi_metrics")
        else "0"
    )
    heatmaps_count = (
        "(select count(*) from heatmaps h where h.session_id = s.session_id)"
        if await _table_exists(db, "heatmaps")
        else "0"
    )
    result = await db.execute(
        text(
            f"""
            select
                s.session_id,
                s.user_id,
                u.full_name,
                u.student_code,
                s.started_at,
                s.ended_at,
                s.viewport_w,
                s.viewport_h,
                coalesce(s.session_type, 'legacy_unknown') as session_type,
                s.created_by_role,
                {tracking_points_count} as tracking_points_count,
                {metrics_count} as metrics_count,
                {heatmaps_count} as heatmaps_count
            from sessions s
            left join users u on u.user_id = s.user_id
            where s.lesson_id = :lesson_id
              and (:include_test or s.session_type = 'student_learning')
              and (
                :q = ''
                or lower(s.session_id) like :q_like
                or lower(coalesce(u.full_name, '')) like :q_like
                or lower(coalesce(u.student_code, '')) like :q_like
              )
              and (
                :status = ''
                or (:status = 'open' and s.ended_at is null)
                or (:status = 'finished' and s.ended_at is not null)
              )
            order by s.started_at desc nulls last
            limit 100
            """
        ),
        {
            "lesson_id": lesson_id,
            "include_test": include_test,
            "q": (q or "").strip().lower(),
            "q_like": f"%{(q or '').strip().lower()}%",
            "status": status or "",
        },
    )

    sessions = []
    for row in result.mappings().all():
        snapshot_image_path, snapshot_metadata_path = snapshot_paths(row["session_id"])
        sessions.append({
            **dict(row),
            "snapshot_captured": snapshot_image_path.is_file() and snapshot_metadata_path.is_file(),
        })
    return sessions
