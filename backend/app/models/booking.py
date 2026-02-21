from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, Integer, Numeric, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import AuditMixin


class Booking(AuditMixin, Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    branch_id: Mapped[int] = mapped_column(Integer, ForeignKey("branches.id"), nullable=False)
    booking_no: Mapped[int] = mapped_column(BigInteger, nullable=False)
    travel_date: Mapped[object] = mapped_column(Date, nullable=False)
    departure: Mapped[object | None] = mapped_column(Time, nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    discount: Mapped[float | None] = mapped_column(Numeric(9, 2), nullable=True)
    payment_mode_id: Mapped[int] = mapped_column(Integer, ForeignKey("payment_modes.id"), nullable=False)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    net_amount: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    route_id: Mapped[int] = mapped_column(Integer, ForeignKey("routes.id"), nullable=False)
    portal_user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("portal_users.id"), nullable=True)

    def __repr__(self) -> str:
        return f"<Booking id={self.id} booking_no={self.booking_no} branch_id={self.branch_id}>"
