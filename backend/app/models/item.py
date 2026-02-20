from sqlalchemy import Boolean, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    short_name: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    online_visibility: Mapped[bool | None] = mapped_column("online_visiblity", Boolean, default=True, nullable=True)
    is_active: Mapped[bool | None] = mapped_column(Boolean, default=True, nullable=True)

    def __repr__(self) -> str:
        return f"<Item id={self.id} name={self.name}>"
