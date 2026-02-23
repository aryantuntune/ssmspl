import uuid

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.core.security import get_password_hash, verify_password
from app.core.rbac import UserRole
from app.models.user import User
from app.models.route import Route
from app.models.branch import Branch
from app.schemas.user import UserCreate, UserUpdate


async def _resolve_route_name(db: AsyncSession, route_id: int | None) -> str | None:
    if route_id is None:
        return None
    BranchOne = Branch.__table__.alias("b1")
    BranchTwo = Branch.__table__.alias("b2")
    result = await db.execute(
        select(BranchOne.c.name, BranchTwo.c.name)
        .select_from(Route.__table__
            .join(BranchOne, BranchOne.c.id == Route.branch_id_one)
            .join(BranchTwo, BranchTwo.c.id == Route.branch_id_two))
        .where(Route.id == route_id)
    )
    row = result.one_or_none()
    if not row:
        return None
    return f"{row[0]} - {row[1]}"


async def _resolve_route_branches(db: AsyncSession, route_id: int | None) -> list[dict]:
    if route_id is None:
        return []
    BranchOne = Branch.__table__.alias("b1")
    BranchTwo = Branch.__table__.alias("b2")
    result = await db.execute(
        select(
            Route.branch_id_one, BranchOne.c.name,
            Route.branch_id_two, BranchTwo.c.name,
        )
        .select_from(Route.__table__
            .join(BranchOne, BranchOne.c.id == Route.branch_id_one)
            .join(BranchTwo, BranchTwo.c.id == Route.branch_id_two))
        .where(Route.id == route_id)
    )
    row = result.one_or_none()
    if not row:
        return []
    return [
        {"branch_id": row[0], "branch_name": row[1]},
        {"branch_id": row[2], "branch_name": row[3]},
    ]


def _user_with_route_name(user: User, route_name: str | None) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "full_name": user.full_name,
        "role": user.role,
        "route_id": user.route_id,
        "is_active": user.is_active,
        "is_verified": user.is_verified,
        "route_name": route_name,
        "last_login": user.last_login,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


async def get_user_by_id(db: AsyncSession, user_id: uuid.UUID, current_user: User | None = None) -> dict:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    # Non-SUPER_ADMIN cannot view SUPER_ADMIN users
    if current_user and user.role == UserRole.SUPER_ADMIN and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    route_name = await _resolve_route_name(db, user.route_id)
    return _user_with_route_name(user, route_name)


def _apply_filters(
    query,
    search: str | None = None,
    status: str | None = None,
    search_column: str = "all",
    match_type: str = "contains",
    role_filter: str | None = None,
):
    if search:
        if match_type == "starts_with":
            pattern = f"{search}%"
        elif match_type == "ends_with":
            pattern = f"%{search}"
        else:
            pattern = f"%{search}%"

        if search_column == "username":
            query = query.where(User.username.ilike(pattern))
        elif search_column == "email":
            query = query.where(User.email.ilike(pattern))
        elif search_column == "full_name":
            query = query.where(User.full_name.ilike(pattern))
        else:
            query = query.where(or_(
                User.username.ilike(pattern),
                User.email.ilike(pattern),
                User.full_name.ilike(pattern),
            ))

    if status == "active":
        query = query.where(User.is_active == True)
    elif status == "inactive":
        query = query.where(User.is_active == False)

    if role_filter:
        query = query.where(User.role == role_filter)

    return query


async def count_users(
    db: AsyncSession,
    search: str | None = None,
    status: str | None = None,
    search_column: str = "all",
    match_type: str = "contains",
    role_filter: str | None = None,
    current_user: User | None = None,
) -> int:
    query = select(func.count()).select_from(User)
    query = _apply_filters(query, search, status, search_column, match_type, role_filter)
    # Non-SUPER_ADMIN users never see SUPER_ADMIN accounts
    if current_user and current_user.role != UserRole.SUPER_ADMIN:
        query = query.where(User.role != UserRole.SUPER_ADMIN)
    result = await db.execute(query)
    return result.scalar()


SORTABLE_COLUMNS = {
    "id": User.id,
    "username": User.username,
    "email": User.email,
    "full_name": User.full_name,
    "role": User.role,
    "is_active": User.is_active,
    "created_at": User.created_at,
}


async def get_all_users(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    search: str | None = None,
    status: str | None = None,
    search_column: str = "all",
    match_type: str = "contains",
    role_filter: str | None = None,
    current_user: User | None = None,
) -> list[dict]:
    column = SORTABLE_COLUMNS.get(sort_by, User.created_at)
    order = column.desc() if sort_order == "desc" else column.asc()

    BranchOne = Branch.__table__.alias("b1")
    BranchTwo = Branch.__table__.alias("b2")

    query = (
        select(
            User,
            BranchOne.c.name.label("branch_one_name"),
            BranchTwo.c.name.label("branch_two_name"),
        )
        .outerjoin(Route, Route.id == User.route_id)
        .outerjoin(BranchOne, BranchOne.c.id == Route.branch_id_one)
        .outerjoin(BranchTwo, BranchTwo.c.id == Route.branch_id_two)
    )
    query = _apply_filters(query, search, status, search_column, match_type, role_filter)
    # Non-SUPER_ADMIN users never see SUPER_ADMIN accounts
    if current_user and current_user.role != UserRole.SUPER_ADMIN:
        query = query.where(User.role != UserRole.SUPER_ADMIN)
    result = await db.execute(query.order_by(order).offset(skip).limit(limit))
    rows = result.all()
    return [
        _user_with_route_name(
            row[0],
            f"{row[1]} - {row[2]}" if row[1] and row[2] else None,
        )
        for row in rows
    ]


async def create_user(db: AsyncSession, user_in: UserCreate, current_user: User | None = None) -> dict:
    # Only SUPER_ADMIN can create SUPER_ADMIN users
    if user_in.role == UserRole.SUPER_ADMIN and (not current_user or current_user.role != UserRole.SUPER_ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Insufficient permissions.",
        )

    # Check uniqueness
    existing = await db.execute(
        select(User).where((User.email == user_in.email) | (User.username == user_in.username))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email or username already registered")

    user = User(
        email=user_in.email,
        username=user_in.username,
        full_name=user_in.full_name,
        hashed_password=get_password_hash(user_in.password),
        role=user_in.role,
        route_id=user_in.route_id,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    route_name = await _resolve_route_name(db, user.route_id)
    return _user_with_route_name(user, route_name)


async def update_user(db: AsyncSession, user_id: uuid.UUID, user_in: UserUpdate, current_user: User | None = None) -> dict:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Non-SUPER_ADMIN cannot edit a SUPER_ADMIN user
    if current_user and user.role == UserRole.SUPER_ADMIN and current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Insufficient permissions.")

    update_data = user_in.model_dump(exclude_unset=True)

    # Non-SUPER_ADMIN cannot change a user's role TO SUPER_ADMIN
    if "role" in update_data and update_data["role"] == UserRole.SUPER_ADMIN:
        if not current_user or current_user.role != UserRole.SUPER_ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied. Insufficient permissions.")

    # Check uniqueness if email is being updated
    if "email" in update_data:
        existing = await db.execute(
            select(User).where(User.email == update_data["email"], User.id != user_id)
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Email already registered",
            )

    for field, value in update_data.items():
        setattr(user, field, value)
    await db.commit()
    await db.refresh(user)
    route_name = await _resolve_route_name(db, user.route_id)
    return _user_with_route_name(user, route_name)


async def change_password(db: AsyncSession, user: User, current_password: str, new_password: str) -> User:
    if not verify_password(current_password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    user.hashed_password = get_password_hash(new_password)
    await db.commit()
    await db.refresh(user)
    return user


async def deactivate_user(db: AsyncSession, user_id: uuid.UUID, current_user: User | None = None) -> dict:
    # Prevent deactivating yourself
    if current_user and current_user.id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot deactivate your own account.")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    user.is_active = False
    await db.commit()
    await db.refresh(user)
    route_name = await _resolve_route_name(db, user.route_id)
    return _user_with_route_name(user, route_name)
