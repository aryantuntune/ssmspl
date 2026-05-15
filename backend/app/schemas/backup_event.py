"""Pydantic schemas for the backup-events API.

The contract is shared with:
- a laptop-side PowerShell script that POSTs ``BackupEventCreate`` to
  ``/api/backups/events`` (header ``X-Backup-Ingest-Secret``); and
- the SuperAdmin mobile app that GETs ``BackupEventRead`` lists and the
  ``/summary`` dashboard tile.

Keep field names and enum values in lockstep with those two consumers.
"""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


BackupTypeLiteral = Literal["db_dump", "snapshot"]
BackupStatusLiteral = Literal["success", "failed", "partial"]


class BackupEventCreate(BaseModel):
    """Ingest payload — POSTed by the laptop collector."""

    server_id: str = Field(..., min_length=1, max_length=60)
    backup_type: BackupTypeLiteral
    status: BackupStatusLiteral
    file_name: str | None = Field(None, max_length=255)
    file_size_bytes: int | None = Field(None, ge=0)
    sha256: str | None = Field(None, min_length=64, max_length=64, pattern=r"^[0-9a-fA-F]{64}$")
    message: str | None = None
    occurred_at: datetime


class BackupEventIngestResponse(BaseModel):
    """Returned from POST /api/backups/events."""

    id: int
    received_at: datetime


class BackupEventRead(BaseModel):
    """Full event object returned by GET /api/backups/events."""

    id: int
    server_id: str
    backup_type: str
    status: str
    file_name: str | None
    file_size_bytes: int | None
    sha256: str | None
    message: str | None
    occurred_at: datetime
    received_at: datetime

    model_config = {"from_attributes": True}


class BackupSummaryRow(BaseModel):
    """One row of GET /api/backups/events/summary — keyed by (server_id, backup_type)."""

    server_id: str
    backup_type: str
    latest_success_at: datetime | None
    latest_attempt_at: datetime | None
    latest_status: str | None
    latest_size_bytes: int | None
    freshness_hours: float | None
