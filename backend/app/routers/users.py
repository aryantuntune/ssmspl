import uuid

from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_roles
from app.core.rbac import UserRole
from app.middleware.rate_limit import limiter
from app.models.user import User
from app.schemas.user import ChangePassword, UserCreate, UserRead, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/api/users", tags=["Users"])

# Only admin-level roles can manage users
_admin_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


@router.post(
    "/me/change-password",
    response_model=dict,
    summary="Change own password",
    description="Allows the currently logged-in user to change their password. Requires current password verification.",
    responses={
        200: {"description": "Password changed successfully"},
        400: {"description": "Current password is incorrect"},
        401: {"description": "Not authenticated"},
    },
)
@limiter.limit("5/minute")
async def change_password(
    request: Request,
    body: ChangePassword,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await user_service.change_password(db, current_user, body.current_password, body.new_password)
    return {"message": "Password changed successfully"}


@router.get(
    "/",
    response_model=list[UserRead],
    summary="List all users",
    description="Paginated list of all users with filtering, sorting, and search. Requires **Admin** role.",
    responses={
        200: {"description": "List of users returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def list_users(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(5, ge=1, le=200, description="Maximum number of records to return"),
    sort_by: str = Query("created_at", description="Column to sort by (id, username, email, full_name, role, is_active, created_at)"),
    sort_order: str = Query("desc", description="Sort direction (asc or desc)"),
    search: str | None = Query(None, description="Search by username, email, or full name (case-insensitive)"),
    search_column: str = Query("all", description="Column to search: all, username, email, or full_name"),
    match_type: str = Query("contains", description="Match type: contains, starts_with, or ends_with"),
    role_filter: str | None = Query(None, description="Filter by role (ADMIN, MANAGER, BILLING_OPERATOR, TICKET_CHECKER)"),
    status: str | None = Query(None, description="Filter by status: active, inactive, or all (default all)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    return await user_service.get_all_users(
        db, skip, limit, sort_by, sort_order, search, status, search_column, match_type, role_filter,
        current_user=current_user,
    )


@router.get(
    "/count",
    response_model=int,
    summary="Get total user count",
    description="Returns the total number of users matching filters. Requires **Admin** role.",
    responses={
        200: {"description": "Total count returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def count_users(
    search: str | None = Query(None, description="Search by username, email, or full name (case-insensitive)"),
    search_column: str = Query("all", description="Column to search: all, username, email, or full_name"),
    match_type: str = Query("contains", description="Match type: contains, starts_with, or ends_with"),
    role_filter: str | None = Query(None, description="Filter by role"),
    status: str | None = Query(None, description="Filter by status: active, inactive, or all (default all)"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    return await user_service.count_users(db, search, status, search_column, match_type, role_filter,
        current_user=current_user,
    )


@router.post(
    "/",
    response_model=UserRead,
    status_code=201,
    summary="Create a new user",
    description="Register a new user with email, username, password, and role. Requires **Admin** role.",
    responses={
        201: {"description": "User created successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        409: {"description": "Email or username already registered"},
    },
)
async def create_user(
    body: UserCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    return await user_service.create_user(db, body, current_user=current_user)


@router.get(
    "/{user_id}",
    response_model=UserRead,
    summary="Get user by ID",
    description="Fetch a single user by their UUID. Requires **Admin** role.",
    responses={
        200: {"description": "User details returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "User not found"},
    },
)
async def get_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    return await user_service.get_user_by_id(db, user_id, current_user=current_user)


@router.patch(
    "/{user_id}",
    response_model=UserRead,
    summary="Update user details",
    description="Partially update a user's profile (name, email, role, active status). Requires **Admin** role.",
    responses={
        200: {"description": "User updated successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "User not found"},
        409: {"description": "Email already registered"},
    },
)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_admin_roles),
):
    return await user_service.update_user(db, user_id, body, current_user=current_user)


@router.delete(
    "/{user_id}",
    response_model=UserRead,
    summary="Deactivate a user",
    description="Soft-delete a user by setting `is_active=false`. Restricted to authorized administrators.",
    responses={
        200: {"description": "User deactivated successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient permissions"},
        404: {"description": "User not found"},
    },
)
async def deactivate_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    return await user_service.deactivate_user(db, user_id, current_user=current_user)
