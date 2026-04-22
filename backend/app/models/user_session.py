import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class UserSession(Base):
    __tablename__ = "user_sessions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    ended_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_heartbeat: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    end_reason: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(45), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Branch/route context — set at login, branch_id updated on switch
    branch_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("branches.id"), nullable=True
    )
    route_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("routes.id"), nullable=True
    )

    # Enhanced geolocation from ip-api.com
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(10, 7), nullable=True)
    isp: Mapped[str | None] = mapped_column(String(150), nullable=True)

    # Which portal created this session: "admin" for admin.carferry.online,
    # NULL for sessions replicated from production carferry.online (the prod
    # backend doesn't write this column, so replicated rows stay NULL).
    portal: Mapped[str | None] = mapped_column(String(10), nullable=True)

    def __repr__(self) -> str:
        return f"<UserSession id={self.id} user_id={self.user_id} session_id={self.session_id}>"
