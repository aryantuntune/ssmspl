from sqlalchemy import Boolean, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import AuditMixin


class Route(AuditMixin, Base):
    __tablename__ = "routes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    branch_id_one: Mapped[int] = mapped_column(Integer, ForeignKey("branches.id"), nullable=False)
    branch_id_two: Mapped[int] = mapped_column(Integer, ForeignKey("branches.id"), nullable=False)
    is_active: Mapped[bool | None] = mapped_column(Boolean, default=True, nullable=True)

    def __repr__(self) -> str:
        return f"<Route id={self.id} branch_one={self.branch_id_one} branch_two={self.branch_id_two}>"
