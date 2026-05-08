import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class PushDevice(Base):
    __tablename__ = "push_devices"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    expo_push_token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    device_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    platform: Mapped[str] = mapped_column(String(20), nullable=False, default="android")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    user = relationship("User", lazy="select")

    def __repr__(self) -> str:
        return f"<PushDevice id={self.id} user={self.user_id} platform={self.platform}>"
