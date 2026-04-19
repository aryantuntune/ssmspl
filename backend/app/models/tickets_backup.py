import uuid
from datetime import datetime
from sqlalchemy import BigInteger, DateTime, ForeignKey, Index, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class TicketsBackup(Base):
    __tablename__ = "tickets_backup"
    __table_args__ = (
        Index("ix_tickets_backup_batch_ticket", "adjustment_batch_id", "ticket_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    adjustment_batch_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_adjustments_log.id"), nullable=False)
    ticket_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    original_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    backed_up_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
