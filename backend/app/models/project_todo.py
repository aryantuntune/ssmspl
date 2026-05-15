"""Persistent project-todo list for the SuperAdmin mobile app.

Captures "remember to fix X / add Y" ideas the owner jots down while
debugging something else. Admin/SuperAdmin only — never exposed to cashier
or customer-facing surfaces.

Status / priority intentionally stored as plain VARCHAR + CHECK constraint
rather than a Postgres ENUM (or Python enum-bound column) so adding a new
value later is a one-line ALTER instead of a code+migration round-trip.
"""
from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    ARRAY,
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class ProjectTodo(Base):
    __tablename__ = "project_todos"
    __table_args__ = (
        CheckConstraint(
            "status IN ('open','in_progress','done','wont_do')",
            name="ck_project_todos_status",
        ),
        CheckConstraint(
            "priority IN ('low','medium','high')",
            name="ck_project_todos_priority",
        ),
        # Composite index matches the default list ordering: status first
        # (for the WHERE status IN (...) clause), then priority + created_at
        # so the ORDER BY is fully index-covered.
        Index(
            "ix_project_todos_status_priority_created_at",
            "status",
            "priority",
            "created_at",
        ),
        # GIN index on tags ARRAY — created in the migration with
        # postgresql_using='gin'. The model only declares it so Alembic
        # autogenerate doesn't think it's drift.
        Index(
            "ix_project_todos_tags_gin",
            "tags",
            postgresql_using="gin",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, server_default="open"
    )
    priority: Mapped[str] = mapped_column(
        String(10), nullable=False, server_default="medium"
    )
    # Postgres ARRAY of short tag strings. server_default uses ARRAY[]::varchar[]
    # so newly-inserted rows without an explicit tags value get an empty array
    # rather than NULL — matches the NOT NULL DEFAULT [] contract.
    tags: Mapped[list[str]] = mapped_column(
        ARRAY(String(40)),
        nullable=False,
        server_default=text("ARRAY[]::varchar[]"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    def __repr__(self) -> str:
        return f"<ProjectTodo id={self.id} status={self.status} title={self.title!r}>"
