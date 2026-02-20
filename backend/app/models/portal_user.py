from datetime import datetime

from sqlalchemy import ARRAY, DateTime, Integer, LargeBinary, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class PortalUser(Base):
    __tablename__ = "portal_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    first_name: Mapped[str] = mapped_column(String(60), nullable=False)
    last_name: Mapped[str] = mapped_column(String(60), nullable=False)
    email: Mapped[str] = mapped_column(String(90), unique=True, nullable=False, index=True)
    password: Mapped[str] = mapped_column(String(60), nullable=False)
    mobile: Mapped[str] = mapped_column(String(60), nullable=False)
    remember_token: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=False), default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=False), onupdate=func.now(), nullable=True
    )
    profile_pic: Mapped[list[bytes] | None] = mapped_column(ARRAY(LargeBinary), nullable=True)

    def __repr__(self) -> str:
        return f"<PortalUser id={self.id} email={self.email}>"
