import uuid
from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class AdminAdjustmentDetails(Base):
    __tablename__ = "admin_adjustment_details"
    __table_args__ = (
        CheckConstraint(
            "operation_type IN ('MODIFY','DELETE')",
            name="ck_adj_details_op_type",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    adjustment_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("admin_adjustments_log.id"), nullable=False)
    ticket_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    ticket_item_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    old_rate: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    old_levy: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    new_rate: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    new_levy: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    rate_delta: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    levy_delta: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    total_delta: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    matched_rule_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("parameter_master.id"), nullable=True)
    operation_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default="MODIFY")
