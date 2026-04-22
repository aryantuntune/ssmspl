import uuid
from datetime import datetime
from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AdminAdjustmentsLog(Base):
    __tablename__ = "admin_adjustments_log"
    __table_args__ = (
        CheckConstraint(
            "status IN ('DRY_RUN','IN_PROGRESS','COMMITTED','FAILED','ROLLED_BACK')",
            name="ck_adj_log_status",
        ),
        CheckConstraint(
            "plan_choice IS NULL OR plan_choice IN ('recommended','requested','transfer','closest')",
            name="ck_adj_log_plan_choice",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    branch_id: Mapped[int] = mapped_column(Integer, ForeignKey("branches.id"), nullable=False)
    date_range_start: Mapped[object] = mapped_column(Date, nullable=False)
    date_range_end: Mapped[object] = mapped_column(Date, nullable=False)
    adjustment_amount: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    dry_run_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    total_tickets_affected: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_items_affected: Mapped[int | None] = mapped_column(Integer, nullable=True)
    row_count_checked: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, server_default="DRY_RUN")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan_choice: Mapped[str | None] = mapped_column(String(15), nullable=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rolled_back_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rolled_back_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    def __repr__(self) -> str:
        return f"<AdminAdjustmentsLog id={self.id} status={self.status}>"
