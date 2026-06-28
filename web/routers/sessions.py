from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from uuid import UUID
from datetime import datetime, timezone

from database import get_db
from models import Session, User, Lecture

router = APIRouter(prefix="/sessions", tags=["sessions"])


# ---------- Schemas ----------

class SessionCreate(BaseModel):
    student_code:   str
    lecture_id:     Optional[UUID] = None
    screen_width:   Optional[int]  = None
    screen_height:  Optional[int]  = None

class SessionLoadLecture(BaseModel):
    lecture_id: UUID

class SessionOut(BaseModel):
    id:             UUID
    user_id:        UUID
    lecture_id:     Optional[UUID]
    status:         str
    screen_width:   Optional[int]
    screen_height:  Optional[int]
    started_at:     datetime

    class Config:
        from_attributes = True


# ---------- Endpoints ----------

@router.post("", response_model=SessionOut, summary="Tạo session mới khi user bắt đầu học")
async def create_session(body: SessionCreate, db: AsyncSession = Depends(get_db)):
    # Lấy hoặc tạo user theo student_code
    result = await db.execute(select(User).where(User.student_code == body.student_code))
    user = result.scalar_one_or_none()

    if not user:
        user = User(
            name=body.student_code,   # tạm dùng student_code làm name, user cập nhật sau
            student_code=body.student_code,
        )
        db.add(user)
        await db.flush()  # lấy user.id mà chưa commit

    # Tạo session mới
    session = Session(
        user_id=user.id,
        lecture_id=body.lecture_id,
        status="calibrating",
        screen_width=body.screen_width,
        screen_height=body.screen_height,
    )
    db.add(session)
    await db.flush()

    return session


@router.get("/{session_id}", response_model=SessionOut, summary="Lấy thông tin session")
async def get_session(session_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")
    return session


@router.patch("/{session_id}/load-lecture", response_model=SessionOut, summary="User bấm load bài giảng")
async def load_lecture(session_id: UUID, body: SessionLoadLecture, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")

    # Kiểm tra lecture tồn tại
    lec_result = await db.execute(select(Lecture).where(Lecture.id == body.lecture_id))
    if not lec_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Lecture không tồn tại")

    session.lecture_id = body.lecture_id
    session.status = "learning"
    return session


@router.patch("/{session_id}/finish", response_model=SessionOut, summary="User bấm Finish")
async def finish_session(session_id: UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Session).where(Session.id == session_id))
    session = result.scalar_one_or_none()
    if not session:
        raise HTTPException(status_code=404, detail="Session không tồn tại")
    if session.status == "finished":
        raise HTTPException(status_code=400, detail="Session đã kết thúc")

    session.status = "finished"
    session.finished_at = datetime.now(timezone.utc)
    return session