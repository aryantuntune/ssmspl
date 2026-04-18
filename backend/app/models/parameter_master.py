import uuid
from datetime import datetime
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ParameterMaster(Base):
    __tablename__ = "parameter_master"
    __table_args__ = (
        CheckConstraint(
            "ticket_selection_order IN ('FIFO','LIFO','HIGHEST_VALUE','LOWEST_VALUE')",
            name="ck_pm_selection_order",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    priority_order: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    branch_scope: Mapped[int | None] = mapped_column(Integer, ForeignKey("branches.id"), nullable=True)
    item_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("items.id"), nullable=True)
    payment_mode: Mapped[str] = mapped_column(String(20), nullable=False, server_default="CASH")
    ticket_conditions: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    item_conditions: Mapped[dict] = mapped_column(JSONB, nullable=False, server_default="{}")
    ticket_selection_order: Mapped[str] = mapped_column(String(20), nullable=False, server_default="FIFO")
    max_adjustment_per_ticket: Mapped[float | None] = mapped_column(Numeric(9, 2), nullable=True)
    max_adjustment_per_item: Mapped[float | None] = mapped_column(Numeric(9, 2), nullable=True)
    max_total_adjustment_per_rule: Mapped[float | None] = mapped_column(Numeric(9, 2), nullable=True)
    stop_on_match: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    def __repr__(self) -> str:
        return f"<ParameterMaster priority={self.priority_order} active={self.is_active}>"
