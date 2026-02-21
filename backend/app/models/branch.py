import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, Integer, Numeric, String, Time, func
from sqlalchemy.dialects.postgresql import UUID
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
    last_booking_no: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    is_active: Mapped[bool | None] = mapped_column(Boolean, nullable=True)

    # Audit columns — branches uses timestamp WITHOUT time zone
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), onupdate=func.now(), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    def __repr__(self) -> str:
        return f"<Branch id={self.id} name={self.name}>"
