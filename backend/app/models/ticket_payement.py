from sqlalchemy import BigInteger, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import AuditMixin


class TicketPayement(AuditMixin, Base):
    __tablename__ = "ticket_payement"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tickets.id"), nullable=False)
    payment_mode_id: Mapped[int] = mapped_column(Integer, ForeignKey("payment_modes.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    ref_no: Mapped[str | None] = mapped_column(String(30), nullable=True)

    def __repr__(self) -> str:
        return f"<TicketPayement id={self.id} ticket_id={self.ticket_id} payment_mode_id={self.payment_mode_id}>"
