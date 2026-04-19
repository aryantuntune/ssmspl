from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import AuditMixin


class AdminScreenToggle(AuditMixin, Base):
    __tablename__ = "admin_screen_toggles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    screen_name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="true")

    def __repr__(self) -> str:
        return f"<AdminScreenToggle {self.screen_name}={self.is_enabled}>"
