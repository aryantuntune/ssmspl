from sqlalchemy import ForeignKey, Integer, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import AuditMixin


class FerrySchedule(AuditMixin, Base):
    __tablename__ = "ferry_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    branch_id: Mapped[int] = mapped_column(Integer, ForeignKey("branches.id"), nullable=False)
    departure: Mapped[object] = mapped_column(Time, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    boat_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("boats.id"), nullable=True, index=True
    )

    def __repr__(self) -> str:
        return f"<FerrySchedule id={self.id} branch_id={self.branch_id} departure={self.departure}>"
