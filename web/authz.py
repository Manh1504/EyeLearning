import hashlib
from datetime import datetime, timezone

from fastapi import Cookie, Depends, HTTPException
from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from web.models import AuthSession, CourseEnrollment, CourseItem, Lesson, PDFLesson, Session, TeacherCourseAssignment, User
from web.database import get_db

SESSION_COOKIE_NAME = "ela_session"


def normalize_role(role: str | None) -> str:
    if role == "instructor":
        return "teacher"
    if role in {"student", "teacher", "admin"}:
        return role
    return ""


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


async def current_user_from_cookie(
    db: AsyncSession = Depends(get_db),
    ela_session: str | None = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> User:
    if not ela_session:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập")

    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(User)
        .join(AuthSession, AuthSession.user_id == User.user_id)
        .where(AuthSession.token_hash == token_hash(ela_session))
        .where(AuthSession.revoked_at.is_(None))
        .where(AuthSession.expires_at > now)
    )
    user = result.scalar_one_or_none()
    if not user or not user.is_active or not normalize_role(user.role):
        raise HTTPException(status_code=401, detail="Phiên đăng nhập không hợp lệ")
    return user


def require_role(user: User, allowed: set[str]) -> str:
    role = normalize_role(user.role)
    if role not in allowed:
        raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập")
    return role


def require_admin_user(user: User) -> User:
    require_role(user, {"admin"})
    return user


async def lesson_course_id(db: AsyncSession, lesson_id: str) -> str:
    result = await db.execute(select(Lesson.course_id).where(Lesson.lesson_id == lesson_id))
    course_id = result.scalar_one_or_none()
    if not course_id:
        raise HTTPException(status_code=404, detail="Lesson không tồn tại hoặc chưa thuộc khóa học")
    return course_id


async def ensure_student_can_access_lesson(db: AsyncSession, user: User, lesson_id: str) -> None:
    require_role(user, {"student"})
    course_id = await lesson_course_id(db, lesson_id)
    allowed = await db.scalar(
        select(
            exists().where(
                CourseEnrollment.student_id == user.user_id,
                CourseEnrollment.course_id == course_id,
                CourseEnrollment.status == "active",
            )
        )
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Bạn không có quyền học bài này")


async def ensure_student_can_access_course_item(db: AsyncSession, user: User, course_item_id: str) -> CourseItem:
    require_role(user, {"student"})
    result = await db.execute(select(CourseItem).where(CourseItem.course_item_id == course_item_id))
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="Course item không tồn tại")
    allowed = await db.scalar(
        select(
            exists().where(
                CourseEnrollment.student_id == user.user_id,
                CourseEnrollment.course_id == item.course_id,
                CourseEnrollment.status == "active",
            )
        )
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Bạn không có quyền học nội dung này")
    return item


async def ensure_can_read_pdf_lesson(db: AsyncSession, user: User, pdf_lesson_id: str) -> PDFLesson:
    result = await db.execute(select(PDFLesson).where(PDFLesson.pdf_lesson_id == pdf_lesson_id))
    pdf_lesson = result.scalar_one_or_none()
    if not pdf_lesson:
        raise HTTPException(status_code=404, detail="PDF lesson không tồn tại")
    item = await db.scalar(select(CourseItem).where(CourseItem.course_item_id == pdf_lesson.course_item_id))
    if not item:
        raise HTTPException(status_code=404, detail="Course item không tồn tại")
    role = normalize_role(user.role)
    if role == "admin":
        return pdf_lesson
    if role == "teacher":
        allowed = await db.scalar(
            select(
                exists().where(
                    TeacherCourseAssignment.teacher_id == user.user_id,
                    TeacherCourseAssignment.course_id == item.course_id,
                )
            )
        )
        if allowed:
            return pdf_lesson
    if role == "student":
        await ensure_student_can_access_course_item(db, user, item.course_item_id)
        return pdf_lesson
    raise HTTPException(status_code=403, detail="Bạn không có quyền truy cập PDF lesson này")


async def teacher_can_access_lesson(db: AsyncSession, user: User, lesson_id: str) -> bool:
    role = normalize_role(user.role)
    if role == "admin":
        return True
    if role != "teacher":
        return False
    course_id = await lesson_course_id(db, lesson_id)
    return bool(
        await db.scalar(
            select(
                exists().where(
                    TeacherCourseAssignment.teacher_id == user.user_id,
                    TeacherCourseAssignment.course_id == course_id,
                )
            )
        )
    )


async def ensure_can_read_session_analytics(db: AsyncSession, user: User, session_id: str) -> Session:
    role = normalize_role(user.role)
    if role == "student":
        raise HTTPException(status_code=403, detail="Học sinh không được truy cập analytics eye-tracking")

    result = await db.execute(select(Session).where(Session.session_id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    if role == "admin":
        return session
    if role == "teacher" and session.session_type == "student_learning":
        if await teacher_can_access_lesson(db, user, session.lesson_id):
            return session
    raise HTTPException(status_code=403, detail="Bạn không có quyền xem dữ liệu này")


async def ensure_student_owns_session(db: AsyncSession, user: User, session_id: str) -> Session:
    require_role(user, {"student", "admin"})
    result = await db.execute(select(Session).where(Session.session_id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")
    if normalize_role(user.role) == "admin" and session.session_type == "admin_test" and session.user_id == user.user_id:
        return session
    if session.session_type in {"student_learning", "profile_setup"} and session.user_id == user.user_id:
        return session
    raise HTTPException(status_code=403, detail="Bạn không có quyền thao tác với phiên này")
