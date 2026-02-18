import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.schemas.user import UserCreate, UserRead, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/api/users", tags=["Users"])

# Only Super Admin and Admin can manage users
_admin_roles = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


@router.get(
    "/",
    response_model=list[UserRead],
    summary="List all users",
    description="Paginated list of all users. Requires **Super Admin** or **Admin** role.",
    responses={
        200: {"description": "List of users returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def list_users(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(50, ge=1, le=200, description="Maximum number of records to return"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_admin_roles),
):
    return await user_service.get_all_users(db, skip, limit)


@router.post(
    "/",
    response_model=UserRead,
    status_code=201,
    summary="Create a new user",
    description="Register a new user with email, username, password, and role. Requires **Super Admin** or **Admin** role.",
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
    _=Depends(_admin_roles),
):
    return await user_service.create_user(db, body)


@router.get(
    "/{user_id}",
    response_model=UserRead,
    summary="Get user by ID",
    description="Fetch a single user by their UUID. Requires **Super Admin** or **Admin** role.",
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
    _=Depends(_admin_roles),
):
    return await user_service.get_user_by_id(db, user_id)


@router.patch(
    "/{user_id}",
    response_model=UserRead,
    summary="Update user details",
    description="Partially update a user's profile (name, email, role, active status). Requires **Super Admin** or **Admin** role.",
    responses={
        200: {"description": "User updated successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "User not found"},
    },
)
async def update_user(
    user_id: uuid.UUID,
    body: UserUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(_admin_roles),
):
    return await user_service.update_user(db, user_id, body)


@router.delete(
    "/{user_id}",
    response_model=UserRead,
    summary="Deactivate a user",
    description="Soft-delete a user by setting `is_active=false`. Requires **Super Admin** role only.",
    responses={
        200: {"description": "User deactivated successfully"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role — Super Admin required"},
        404: {"description": "User not found"},
    },
)
async def deactivate_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    _=Depends(require_roles(UserRole.SUPER_ADMIN)),
):
    return await user_service.deactivate_user(db, user_id)
