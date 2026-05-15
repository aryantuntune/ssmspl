"""Backup-events log.

A separate laptop-side PowerShell script collects backup artifacts from both
servers (db_dump + snapshot tarballs), then POSTs one event per attempt to
``/api/backups/events`` so the SuperAdmin mobile app can render a unified
backup-history view across both deployments.

- ``occurred_at`` is set by the laptop (client clock) — when the backup
  actually finished there. ``received_at`` is server-side. Both are kept so
  clock skew or delayed retries don't lose information.
- ``(server_id, file_name, sha256)`` is the dedupe key (sha256 must be
  non-null) — the laptop may retry the POST on network failure and we don't
  want duplicate rows.
- Composite indexes match the two read patterns the mobile app uses:
  recent-events-per-server feed and recent-failures-cross-server.
"""
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Index, String, Text, column, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class BackupEvent(Base):
    __tablename__ = "backup_events"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    server_id: Mapped[str] = mapped_column(String(60), nullable=False)
    backup_type: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    file_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    sha256: Mapped[str | None] = mapped_column(String(64), nullable=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )

    # The DESC-ordered indexes on (server_id, occurred_at) and
    # (status, occurred_at) are created by the migration, not derived from
    # this model — SQLAlchemy's declarative Index can't express column-level
    # ORDER BY direction portably. We declare the columns here so a future
    # `alembic --autogenerate` recognises the indexes exist and doesn't
    # propose dropping them; the actual sort direction lives in the
    # migration file.
    __table_args__ = (
        Index("ix_backup_events_server_occurred", "server_id", column("occurred_at")),
        Index("ix_backup_events_status_occurred", "status", column("occurred_at")),
    )

    def __repr__(self) -> str:  # pragma: no cover - debug only
        return (
            f"<BackupEvent id={self.id} server={self.server_id} "
            f"type={self.backup_type} status={self.status}>"
        )
