import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.db.session import get_db
from app.models.auth import User
from app.models.course import Course, Enrollment, Lesson, Module

router = APIRouter(tags=["media"])

# Chỉ cho phép filename dạng slide_001.jpg và version 12 hex
_SLIDE_RE = re.compile(r"^slide_\d{3}\.jpg$")
_VERSION_RE = re.compile(r"^[0-9a-f]{12}$")


def _ensure_media_in_root(path: Path) -> Path:
    # Ngăn path traversal: path phải nằm trong media_path
    try:
        path.resolve().relative_to(settings.media_path.resolve())
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy file")
    return path


@router.get("/media/lessons/{lesson_id}/{version}/{filename}")
async def get_lesson_slide(
    lesson_id: str,
    version: str,
    filename: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate UUID và format để tránh traversal
    try:
        uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài học")
    if not _VERSION_RE.match(version) or not _SLIDE_RE.match(filename):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy file")

    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài học")
    module = await db.get(Module, lesson.module_id)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài học")
    course = await db.get(Course, module.course_id)
    if course is None or course.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khóa học")

    # Quyền: giống get_lesson_contents — owner/assigned hoặc đã enroll
    from app.api.deps import can_access_course

    is_owner = await can_access_course(db, course, user)
    enrolled = None
    if not is_owner:
        enrolled = (
            await db.execute(
                select(Enrollment).where(
                    Enrollment.course_id == course.id, Enrollment.student_id == user.id, Enrollment.status != "dropped"
                )
            )
        ).scalar_one_or_none()
        if enrolled is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Chưa đăng ký khóa học")

    file_path = settings.media_path / "lessons" / lesson_id / version / filename
    file_path = _ensure_media_in_root(file_path)
    if not file_path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy file")
    return FileResponse(str(file_path), media_type="image/jpeg")


# Fallback cho dữ liệu cũ: image_url dạng /media/lessons/{id}/slide_xxx.jpg (không có version)
# Nếu file legacy tồn tại thì phục vụ luôn, nếu không thì quét các version con để tìm file.
@router.get("/media/lessons/{lesson_id}/{filename}")
async def get_lesson_slide_legacy(
    lesson_id: str,
    filename: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        uuid.UUID(lesson_id)
    except ValueError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài học")
    if not _SLIDE_RE.match(filename):
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy file")

    lesson = await db.get(Lesson, lesson_id)
    if lesson is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài học")
    module = await db.get(Module, lesson.module_id)
    if module is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy bài học")
    course = await db.get(Course, module.course_id)
    if course is None or course.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy khóa học")

    from app.api.deps import can_access_course

    is_owner = await can_access_course(db, course, user)
    if not is_owner:
        enrolled = (
            await db.execute(
                select(Enrollment).where(
                    Enrollment.course_id == course.id, Enrollment.student_id == user.id, Enrollment.status != "dropped"
                )
            )
        ).scalar_one_or_none()
        if enrolled is None:
            raise HTTPException(status.HTTP_403_FORBIDDEN, detail="Chưa đăng ký khóa học")

    # 1. Thử file legacy trực tiếp: media/lessons/{id}/slide_*.jpg
    legacy_path = settings.media_path / "lessons" / lesson_id / filename
    legacy_path = _ensure_media_in_root(legacy_path)
    if legacy_path.is_file():
        return FileResponse(str(legacy_path), media_type="image/jpeg")

    # 2. Quét các thư mục version con (12 hex) để tìm file — lấy bản mới nhất
    lesson_dir = settings.media_path / "lessons" / lesson_id
    lesson_dir = _ensure_media_in_root(lesson_dir)
    if lesson_dir.is_dir():
        candidates: list[Path] = []
        for child in lesson_dir.iterdir():
            if child.is_dir() and _VERSION_RE.match(child.name):
                p = child / filename
                if p.is_file():
                    candidates.append(p)
        if candidates:
            # Ưu tiên file mới nhất (mtime lớn nhất) để khớp version hiện tại trong DB
            candidates.sort(key=lambda p: p.stat().st_mtime, reverse=True)
            return FileResponse(str(candidates[0]), media_type="image/jpeg")

    raise HTTPException(status.HTTP_404_NOT_FOUND, detail="Không tìm thấy file")
