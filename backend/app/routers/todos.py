"""Project-todo API for the SuperAdmin mobile app.

Persistent todo list for the owner to capture follow-ups ("remember to
fix X / add Y") while working on unrelated things. Available on both
deployments so the app works against whichever backend is reachable,
but every endpoint is RBAC-gated to ADMIN / SUPER_ADMIN.
"""
from __future__ import annotations

import logging
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.models.user import User
from app.schemas.project_todo import (
    ProjectTodoCreate,
    ProjectTodoListResponse,
    ProjectTodoRead,
    ProjectTodoStats,
    ProjectTodoUpdate,
)
from app.services import project_todo_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/todos", tags=["Project Todos"])

_admin_or_super = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


@router.post(
    "",
    response_model=ProjectTodoRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_todo(
    body: ProjectTodoCreate,
    current_user: Annotated[User, Depends(_admin_or_super)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    todo = await project_todo_service.create_todo(db, body, created_by=current_user.id)
    return todo


@router.get("", response_model=ProjectTodoListResponse)
async def list_todos(
    _user: Annotated[User, Depends(_admin_or_super)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status_: Annotated[
        str | None,
        Query(
            alias="status",
            description="Single value or comma-separated list (e.g. 'open,in_progress')",
        ),
    ] = None,
    priority: str | None = Query(None, pattern=r"^(low|medium|high)$"),
    tag: str | None = Query(None, max_length=40),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    items, total = await project_todo_service.list_todos(
        db,
        status_filter=status_,
        priority=priority,
        tag=tag,
        limit=limit,
        offset=offset,
    )
    return ProjectTodoListResponse(items=items, total=total)


@router.get("/stats", response_model=ProjectTodoStats)
async def get_stats(
    _user: Annotated[User, Depends(_admin_or_super)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await project_todo_service.get_stats(db)


@router.get("/{todo_id}", response_model=ProjectTodoRead)
async def get_todo(
    todo_id: int,
    _user: Annotated[User, Depends(_admin_or_super)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await project_todo_service.get_todo(db, todo_id)


@router.patch("/{todo_id}", response_model=ProjectTodoRead)
async def update_todo(
    todo_id: int,
    body: ProjectTodoUpdate,
    _user: Annotated[User, Depends(_admin_or_super)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    return await project_todo_service.update_todo(db, todo_id, body)


@router.delete("/{todo_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_todo(
    todo_id: int,
    _user: Annotated[User, Depends(_admin_or_super)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    await project_todo_service.delete_todo(db, todo_id)
