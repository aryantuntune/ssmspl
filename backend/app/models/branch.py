from sqlalchemy import Boolean, Integer, Numeric, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Branch(Base):
    __tablename__ = "branches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(15), unique=True, nullable=False)
    address: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_nos: Mapped[str | None] = mapped_column(String(255), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Numeric(21, 15), nullable=True)
    longitude: Mapped[float | None] = mapped_column(Numeric(21, 15), nullable=True)
    sf_after: Mapped[object | None] = mapped_column(Time, nullable=True)
    sf_before: Mapped[object | None] = mapped_column(Time, nullable=True)
    last_ticket_no: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    def __repr__(self) -> str:
        return f"<Branch id={self.id} name={self.name}>"
