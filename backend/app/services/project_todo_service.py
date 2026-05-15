"""DB query helpers for project_todos.

Layer is intentionally thin — the router stays declarative and the
service centralises the ordering / filter logic so multiple callers
(list endpoint, future widgets, exports) share the same query shape.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import and_, case, delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project_todo import ProjectTodo
from app.schemas.project_todo import (
    ProjectTodoCreate,
    ProjectTodoStats,
    ProjectTodoUpdate,
)

# Priority ranking used in ORDER BY: HIGH > MEDIUM > LOW.
# Encoded as a CASE expression so we don't depend on alphabetical order of
# the column (which would sort 'low' < 'medium' < 'high' wrong).
_PRIORITY_RANK = case(
    (ProjectTodo.priority == "high", 3),
    (ProjectTodo.priority == "medium", 2),
    (ProjectTodo.priority == "low", 1),
    else_=0,
)

# Status ranking — open + in_progress first, then done, then wont_do.
_STATUS_RANK = case(
    (ProjectTodo.status == "open", 0),
    (ProjectTodo.status == "in_progress", 0),
    (ProjectTodo.status == "done", 1),
    (ProjectTodo.status == "wont_do", 2),
    else_=3,
)


def _parse_status_filter(value: str | None) -> list[str] | None:
    """Accept ``status=open`` or ``status=open,in_progress`` — comma-separated."""
    if not value:
        return None
    parts = [p.strip() for p in value.split(",") if p.strip()]
    valid = {"open", "in_progress", "done", "wont_do"}
    bad = [p for p in parts if p not in valid]
    if bad:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status value(s): {', '.join(bad)}",
        )
    return parts or None


def _build_list_query(
    status_filter: str | None,
    priority: str | None,
    tag: str | None,
):
    """Build the base SELECT for list + count, sharing the WHERE clause."""
    q = select(ProjectTodo)
    statuses = _parse_status_filter(status_filter)
    if statuses:
        q = q.where(ProjectTodo.status.in_(statuses))
    if priority:
        if priority not in ("low", "medium", "high"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid priority: {priority}",
            )
        q = q.where(ProjectTodo.priority == priority)
    if tag:
        # Postgres ARRAY containment: tag = ANY(tags)
        # Using .any() emits `WHERE :tag = ANY(project_todos.tags)`
        q = q.where(ProjectTodo.tags.any(tag))
    return q


async def list_todos(
    db: AsyncSession,
    *,
    status_filter: str | None,
    priority: str | None,
    tag: str | None,
    limit: int,
    offset: int,
) -> tuple[list[ProjectTodo], int]:
    base = _build_list_query(status_filter, priority, tag)

    # Count: reuse the WHERE clause but drop ORDER BY / LIMIT / OFFSET.
    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar_one()

    items_q = (
        base
        .order_by(_STATUS_RANK.asc(), _PRIORITY_RANK.desc(), ProjectTodo.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = (await db.execute(items_q)).scalars().all()
    return list(rows), int(total)


async def get_todo(db: AsyncSession, todo_id: int) -> ProjectTodo:
    row = (
        await db.execute(select(ProjectTodo).where(ProjectTodo.id == todo_id))
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Todo not found")
    return row


async def create_todo(
    db: AsyncSession,
    body: ProjectTodoCreate,
    created_by: uuid.UUID,
) -> ProjectTodo:
    todo = ProjectTodo(
        title=body.title,
        description=body.description,
        priority=body.priority,
        tags=list(body.tags or []),
        created_by=created_by,
    )
    db.add(todo)
    await db.flush()
    await db.refresh(todo)
    return todo


async def update_todo(
    db: AsyncSession,
    todo_id: int,
    body: ProjectTodoUpdate,
) -> ProjectTodo:
    todo = await get_todo(db, todo_id)

    data = body.model_dump(exclude_unset=True)
    if not data:
        # Nothing to update — return current row as-is.
        return todo

    previous_status = todo.status

    if "title" in data:
        todo.title = data["title"]
    if "description" in data:
        todo.description = data["description"]
    if "priority" in data:
        todo.priority = data["priority"]
    if "tags" in data:
        todo.tags = list(data["tags"] or [])
    if "notes" in data:
        todo.notes = data["notes"]
    if "status" in data:
        new_status = data["status"]
        todo.status = new_status
        if new_status == "done" and previous_status != "done":
            todo.completed_at = datetime.now(timezone.utc)
        elif new_status != "done" and previous_status == "done":
            todo.completed_at = None

    await db.flush()
    await db.refresh(todo)
    return todo


async def delete_todo(db: AsyncSession, todo_id: int) -> None:
    # Verify the row exists first so callers get a clean 404 rather than
    # a silent "no rows affected".
    await get_todo(db, todo_id)
    await db.execute(delete(ProjectTodo).where(ProjectTodo.id == todo_id))


async def get_stats(db: AsyncSession) -> ProjectTodoStats:
    """Single round-trip aggregate for dashboard tile data."""
    # Counts per status via FILTER aggregates.
    stats_q = select(
        func.count().filter(ProjectTodo.status == "open").label("open"),
        func.count().filter(ProjectTodo.status == "in_progress").label("in_progress"),
        func.count().filter(ProjectTodo.status == "done").label("done"),
        func.count().filter(ProjectTodo.status == "wont_do").label("wont_do"),
        func.count()
        .filter(
            and_(
                ProjectTodo.status == "open",
                ProjectTodo.priority == "high",
            )
        )
        .label("high_priority_open"),
        # Age of oldest open row, in days. NULL when no open rows exist.
        func.min(ProjectTodo.created_at)
        .filter(ProjectTodo.status == "open")
        .label("oldest_open_created_at"),
    )
    row = (await db.execute(stats_q)).one()

    oldest_open_days: float | None = None
    if row.oldest_open_created_at is not None:
        delta = datetime.now(timezone.utc) - row.oldest_open_created_at
        oldest_open_days = round(delta.total_seconds() / 86400, 2)

    return ProjectTodoStats(
        open=int(row.open or 0),
        in_progress=int(row.in_progress or 0),
        done=int(row.done or 0),
        wont_do=int(row.wont_do or 0),
        high_priority_open=int(row.high_priority_open or 0),
        oldest_open_days=oldest_open_days,
    )
