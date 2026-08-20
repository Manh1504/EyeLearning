from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.auth import User
from app.models.course import Course, CourseTeacher
from app.models.profile import TeacherProfile, UserProfile
from app.schemas.course import CourseTeacherOut, TeacherAssignIn, TeacherDirectoryOut

router = APIRouter(prefix="/admin", tags=["admin"])


async def _course_or_404(db: AsyncSession, course_id: str) -> Course:
    course = await db.get(Course, course_id)
    if course is None or course.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khóa học")
    return course


async def _teacher_or_404(db: AsyncSession, teacher_id: str) -> TeacherProfile:
    teacher = await db.get(TeacherProfile, teacher_id)
    if teacher is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, detail="Tài khoản không phải giáo viên"
        )
    return teacher


@router.get("/teachers", response_model=list[TeacherDirectoryOut])
async def list_teachers(
    q: str | None = None,
    _: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Danh mục giáo viên (id, tên, mã, khoa) để phân công vào khóa học."""
    stmt = (
        select(User, UserProfile, TeacherProfile)
        .outerjoin(UserProfile, UserProfile.user_id == User.id)
        .join(TeacherProfile, TeacherProfile.user_id == User.id)
        .where(User.deleted_at.is_(None), User.status.has(code="active"))
        .order_by(UserProfile.full_name)
        .limit(500)
    )
    if q and q.strip():
        like = f"%{q.strip()}%"
        stmt = stmt.where(
            UserProfile.full_name.ilike(like) | User.email.ilike(like)
        )
    rows = (await db.execute(stmt)).all()
    return [
        TeacherDirectoryOut(
            id=u.id,
            name=p.full_name if p else u.email,
            code=tp.teacher_code,
            email=u.email,
            department=tp.department,
        )
        for u, p, tp in rows
    ]


@router.get("/courses/{course_id}/teachers", response_model=list[CourseTeacherOut])
async def list_course_teachers(
    course_id: str,
    _: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    course = await _course_or_404(db, course_id)

    assigned_ids_stmt = select(CourseTeacher.teacher_id).where(
        CourseTeacher.course_id == course_id
    )
    assigned_ids = set((await db.execute(assigned_ids_stmt)).scalars().all())

    all_ids = assigned_ids | {course.teacher_id}
    if not all_ids:
        return []

    stmt = (
        select(User, UserProfile, TeacherProfile)
        .join(TeacherProfile, TeacherProfile.user_id == User.id)
        .outerjoin(UserProfile, UserProfile.user_id == User.id)
        .where(User.id.in_(all_ids))
    )
    rows = (await db.execute(stmt)).all()
    by_id = {u.id: (u, p, tp) for u, p, tp in rows}

    out: list[CourseTeacherOut] = []
    owner = by_id.get(course.teacher_id)
    if owner:
        u, p, tp = owner
        out.append(
            CourseTeacherOut(
                teacher_id=u.id,
                name=p.full_name if p else u.email,
                code=tp.teacher_code,
                email=u.email,
                is_owner=True,
            )
        )
    for tid in sorted(assigned_ids):
        if tid == course.teacher_id or tid not in by_id:
            continue
        u, p, tp = by_id[tid]
        out.append(
            CourseTeacherOut(
                teacher_id=u.id,
                name=p.full_name if p else u.email,
                code=tp.teacher_code,
                email=u.email,
                is_owner=False,
            )
        )
    return out


@router.post("/courses/{course_id}/teachers", status_code=201)
async def assign_teachers(
    course_id: str,
    body: TeacherAssignIn,
    user: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    course = await _course_or_404(db, course_id)
    ids = list(dict.fromkeys(body.teacher_ids))
    if not ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Chưa chọn giáo viên")

    existing_stmt = select(CourseTeacher.teacher_id).where(
        CourseTeacher.course_id == course_id
    )
    existing = set((await db.execute(existing_stmt)).scalars().all())

    added = 0
    for tid in ids:
        if tid == course.teacher_id or tid in existing:
            continue
        await _teacher_or_404(db, tid)
        db.add(CourseTeacher(course_id=course_id, teacher_id=tid, assigned_by=user.id))
        existing.add(tid)
        added += 1
    await db.commit()
    return {"ok": True, "assigned": list(ids), "added": added}


@router.delete("/courses/{course_id}/teachers/{teacher_id}")
async def unassign_teacher(
    course_id: str,
    teacher_id: str,
    _: User = Depends(require_roles("admin")),
    db: AsyncSession = Depends(get_db),
):
    course = await _course_or_404(db, course_id)
    if teacher_id == course.teacher_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            detail="Không thể gỡ chủ khóa học khỏi danh sách giảng viên",
        )
    assignment = (
        await db.execute(
            select(CourseTeacher).where(
                CourseTeacher.course_id == course_id,
                CourseTeacher.teacher_id == teacher_id,
            )
        )
    ).scalar_one_or_none()
    if assignment is None:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND, detail="Giáo viên chưa được phân công"
        )
    await db.delete(assignment)
    await db.commit()
    return {"ok": True}