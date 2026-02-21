from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, Integer, Numeric, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import AuditMixin


class Ticket(AuditMixin, Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    branch_id: Mapped[int] = mapped_column(Integer, ForeignKey("branches.id"), nullable=False)
    ticket_no: Mapped[int] = mapped_column(Integer, nullable=False)
    ticket_date: Mapped[object] = mapped_column(Date, nullable=False)
    departure: Mapped[object | None] = mapped_column(Time, nullable=True)
    route_id: Mapped[int] = mapped_column(Integer, ForeignKey("routes.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    discount: Mapped[float | None] = mapped_column(Numeric(9, 2), nullable=True)
    payment_mode_id: Mapped[int] = mapped_column(Integer, ForeignKey("payment_modes.id"), nullable=False)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    net_amount: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)

    def __repr__(self) -> str:
        return f"<Ticket id={self.id} ticket_no={self.ticket_no} branch_id={self.branch_id}>"


class TicketItem(AuditMixin, Base):
    __tablename__ = "ticket_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tickets.id"), nullable=False)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("items.id"), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    levy: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    vehicle_no: Mapped[str | None] = mapped_column(String(15), nullable=True)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    def __repr__(self) -> str:
        return f"<TicketItem id={self.id} ticket_id={self.ticket_id} item_id={self.item_id}>"
