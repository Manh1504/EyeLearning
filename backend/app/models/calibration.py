from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    REAL,
    SmallInteger,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    device_fingerprint: Mapped[str] = mapped_column(String(255))
    screen_width_px: Mapped[int | None] = mapped_column(Integer)
    screen_height_px: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )

    __table_args__ = (UniqueConstraint("user_id", "device_fingerprint"),)


class CalibrationSession(Base):
    __tablename__ = "calibration_sessions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"))
    num_points: Mapped[int] = mapped_column(SmallInteger)
    status: Mapped[str] = mapped_column(String(20), server_default=text("'completed'"))
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class CalibrationParam(Base):
    __tablename__ = "calibration_params"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False), primary_key=True, server_default=text("gen_random_uuid()")
    )
    calibration_session_id: Mapped[str] = mapped_column(
        ForeignKey("calibration_sessions.id", ondelete="CASCADE")
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    device_id: Mapped[str] = mapped_column(ForeignKey("devices.id", ondelete="CASCADE"))
    # Bộ 6 tham số hiệu chỉnh [a1, a2, b1, a3, a4, b2] trả về từ
    # POST /calibrate/fit của AI service (gaze-api) — dùng làm calibration
    # active cho (user, device). model_ubj giữ nullable cho dữ liệu cũ.
    params: Mapped[list[Decimal] | None] = mapped_column(ARRAY(Numeric))
    model_ubj: Mapped[bytes | None] = mapped_column(LargeBinary)
    mae_px: Mapped[float | None] = mapped_column(REAL)
    mapping_model_version: Mapped[str] = mapped_column(String(30))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    valid_from: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=text("now()")
    )
    valid_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    @property
    def has_params(self) -> bool:
        return bool(self.params)
