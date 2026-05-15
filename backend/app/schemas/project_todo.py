"""Pydantic schemas for the project-todo API.

Keep the enum values (status, priority) duplicated here as Pydantic
``Literal`` so OpenAPI consumers (and the mobile client) get strict
validation, while the DB column remains a plain VARCHAR + CHECK.
Expanding the set later is two edits: this file + a one-line ALTER on
the CHECK constraint.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field

TodoStatus = Literal["open", "in_progress", "done", "wont_do"]
TodoPriority = Literal["low", "medium", "high"]


class ProjectTodoCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    priority: TodoPriority = "medium"
    tags: list[str] = Field(default_factory=list, max_length=20)

    model_config = {"str_strip_whitespace": True}


class ProjectTodoUpdate(BaseModel):
    """Partial update — every field optional. ``None`` means 'leave as-is'.

    To clear a nullable field (description/notes), send an empty string;
    the router treats that as a no-op set rather than a NULL so callers
    must explicitly send the field. Status transitions involving 'done'
    flip ``completed_at`` server-side.
    """

    title: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = None
    status: TodoStatus | None = None
    priority: TodoPriority | None = None
    tags: list[str] | None = Field(None, max_length=20)
    notes: str | None = None

    model_config = {"str_strip_whitespace": True}


class ProjectTodoRead(BaseModel):
    id: int
    title: str
    description: str | None
    status: TodoStatus
    priority: TodoPriority
    tags: list[str]
    created_at: datetime
    updated_at: datetime
    created_by: UUID | None
    completed_at: datetime | None
    notes: str | None

    model_config = {"from_attributes": True}


class ProjectTodoListResponse(BaseModel):
    items: list[ProjectTodoRead]
    total: int


class ProjectTodoStats(BaseModel):
    open: int
    in_progress: int
    done: int
    wont_do: int
    high_priority_open: int
    oldest_open_days: float | None
