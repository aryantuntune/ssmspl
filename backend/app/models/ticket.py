import uuid as uuid_mod

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Time, text
from sqlalchemy.dialects.postgresql import UUID
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
    status: Mapped[str] = mapped_column(
        String(20), default="CONFIRMED", server_default="CONFIRMED", nullable=False,
    )  # server_default mirrors DDL (ddl.sql:209) — no migration needed
    checked_in_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)
    verification_code: Mapped[uuid_mod.UUID | None] = mapped_column(UUID(as_uuid=True), default=uuid_mod.uuid4, nullable=True, unique=True)
    boat_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("boats.id"), nullable=True)
    ref_no: Mapped[str | None] = mapped_column(String(30), nullable=True)
    is_multi_ticket: Mapped[bool] = mapped_column(Boolean, default=False, server_default=text("false"), nullable=False)
    generated_at: Mapped[object | None] = mapped_column(DateTime(timezone=True), nullable=True)

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
    vehicle_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)
    last_adjustment_id: Mapped[uuid_mod.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("admin_adjustments_log.id"), nullable=True
    )

    def __repr__(self) -> str:
        return f"<TicketItem id={self.id} ticket_id={self.ticket_id} item_id={self.item_id}>"
