from sqlalchemy import Boolean, Date, ForeignKey, Integer, Numeric
from sqlalchemy.orm import Mapped, mapped_column
from datetime import date as date_type

from app.database import Base
from app.models.mixins import AuditMixin


class ItemRate(AuditMixin, Base):
    __tablename__ = "item_rates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    applicable_from_date: Mapped[date_type | None] = mapped_column(Date, nullable=True)
    levy: Mapped[float | None] = mapped_column(Numeric(38, 2), nullable=True)
    rate: Mapped[float | None] = mapped_column(Numeric(38, 2), nullable=True)
    item_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("items.id"), nullable=True)
    route_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("routes.id"), nullable=True)
    is_active: Mapped[bool | None] = mapped_column(Boolean, default=True, nullable=True)

    def __repr__(self) -> str:
        return f"<ItemRate id={self.id} item_id={self.item_id} route_id={self.route_id}>"
