from sqlalchemy import BigInteger, Boolean, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import AuditMixin


class BookingItem(AuditMixin, Base):
    __tablename__ = "booking_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    booking_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("bookings.id"), nullable=False)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("items.id"), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    levy: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    vehicle_no: Mapped[str | None] = mapped_column(String(15), nullable=True)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    def __repr__(self) -> str:
        return f"<BookingItem id={self.id} booking_id={self.booking_id} item_id={self.item_id}>"
