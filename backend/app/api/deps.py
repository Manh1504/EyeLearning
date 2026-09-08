from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.crud.user import get_user_by_id
from app.db.session import get_db
from app.models.auth import User

oauth2_scheme = HTTPBearer(auto_error=False)


async def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    # 2a: ưu tiên Authorization header (memory token), fallback httpOnly cookie access_token
    # Nếu auth qua cookie cho state-changing thì verify CSRF
    raw_token: str | None = None
    via_cookie = False
    if credentials is not None:
        raw_token = credentials.credentials
    else:
        raw_token = request.cookies.get("access_token")
        via_cookie = raw_token is not None
    if raw_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Chưa đăng nhập"
        )
    if via_cookie and request.method.upper() in ("POST", "PATCH", "PUT", "DELETE"):
        from app.core.csrf import verify_csrf

        verify_csrf(request)
    try:
        payload = decode_access_token(raw_token)
    except PyJWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token không hợp lệ"
        )
    if payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token không hợp lệ"
        )
    user = await get_user_by_id(db, payload["sub"])
    if user is None or user.deleted_at is not None or user.status.code != "active":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Tài khoản không hợp lệ"
        )
    return user


def require_roles(*roles: str):
    async def checker(user: User = Depends(get_current_user)) -> User:
        if not set(roles) & set(user.role_codes):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Không có quyền"
            )
        return user

    return checker


async def can_manage_course(db: AsyncSession, course, user: User) -> bool:
    """True nếu user là admin (toàn quyền) hoặc chủ khóa học (teacher_id):
    được tạo/sửa/xóa khóa học, chương, bài học, thêm học viên, chạy lại analytics."""
    if "admin" in user.role_codes:
        return True
    return getattr(course, "teacher_id", None) == user.id


async def can_access_course(db: AsyncSession, course, user: User) -> bool:
    """True nếu user là admin, chủ khóa học, hoặc giáo viên được admin phân công.
    Phân công cho quyền XEM nội dung/thống kê, thêm slide, và gỡ học viên."""
    if await can_manage_course(db, course, user):
        return True
    if "teacher" not in user.role_codes:
        return False

    from app.models.course import CourseTeacher

    stmt = select(CourseTeacher.course_id).where(
        CourseTeacher.course_id == course.id,
        CourseTeacher.teacher_id == user.id,
    )
    return (await db.execute(stmt)).scalar_one_or_none() is not None
