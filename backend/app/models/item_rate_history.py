import uuid
from datetime import datetime
from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ItemRateHistory(Base):
    """Historical record of item_rates changes. Table exists in ssmspl_admin;
    this model is added so the transfer engine can query historical levy values
    via SQLAlchemy. No DDL change — table is pre-existing."""
    __tablename__ = "item_rate_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    item_rate_id: Mapped[int] = mapped_column(Integer, nullable=False)
    item_id: Mapped[int] = mapped_column(Integer, nullable=False)
    route_id: Mapped[int] = mapped_column(Integer, nullable=False)
    old_rate: Mapped[float | None] = mapped_column(Numeric(38, 2), nullable=True)
    new_rate: Mapped[float | None] = mapped_column(Numeric(38, 2), nullable=True)
    old_levy: Mapped[float | None] = mapped_column(Numeric(38, 2), nullable=True)
    new_levy: Mapped[float | None] = mapped_column(Numeric(38, 2), nullable=True)
    old_is_active: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    new_is_active: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    change_type: Mapped[str] = mapped_column(String(20), nullable=False)
    changed_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
