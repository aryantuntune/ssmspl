import uuid
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class TicketItemsBackup(Base):
    __tablename__ = "ticket_items_backup"
    __table_args__ = (
        Index("ix_ticket_items_backup_batch_item", "adjustment_batch_id", "ticket_item_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    adjustment_batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_adjustments_log.id"), nullable=False)
    ticket_item_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    ticket_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    original_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    backed_up_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
