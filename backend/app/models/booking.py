import uuid as uuid_mod

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import AuditMixin


class Booking(AuditMixin, Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    branch_id: Mapped[int] = mapped_column(Integer, ForeignKey("branches.id"), nullable=False)
    booking_no: Mapped[int] = mapped_column(Integer, nullable=False)
    booking_date: Mapped[object] = mapped_column(Date, nullable=False)
    departure: Mapped[object | None] = mapped_column(Time, nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    discount: Mapped[float | None] = mapped_column(Numeric(9, 2), nullable=True)
    payment_mode_id: Mapped[int] = mapped_column(Integer, ForeignKey("payment_modes.id"), nullable=False)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    net_amount: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    route_id: Mapped[int] = mapped_column(Integer, ForeignKey("routes.id"), nullable=False)
    portal_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("portal_users.id"), nullable=False)
    travel_date: Mapped[object | None] = mapped_column(Date, nullable=True)
    checked_in_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False)
    verification_code: Mapped[uuid_mod.UUID | None] = mapped_column(UUID(as_uuid=True), default=uuid_mod.uuid4, nullable=True)

    def __repr__(self) -> str:
        return f"<Booking id={self.id} booking_no={self.booking_no} branch_id={self.branch_id}>"
