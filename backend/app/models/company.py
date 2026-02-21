from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import AuditMixin


class Company(AuditMixin, Base):
    __tablename__ = "company"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    short_name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    reg_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    gst_no: Mapped[str | None] = mapped_column(String(15), nullable=True)
    pan_no: Mapped[str | None] = mapped_column(String(10), nullable=True)
    tan_no: Mapped[str | None] = mapped_column(String(10), nullable=True)
    cin_no: Mapped[str | None] = mapped_column(String(21), nullable=True)
    contact: Mapped[str | None] = mapped_column(String(255), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sf_item_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    def __repr__(self) -> str:
        return f"<Company id={self.id} name={self.name}>"
