from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.auth import LoginRequest, TokenResponse, RefreshRequest
from app.schemas.user import UserMeResponse
from app.services import auth_service
from app.dependencies import get_current_user
from app.core.rbac import ROLE_MENU_ITEMS
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate user",
    description="Validate username & password and return a JWT access token and refresh token.",
    responses={
        200: {"description": "Successfully authenticated"},
        401: {"description": "Invalid username or password"},
    },
)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    return await auth_service.login(db, body.username, body.password)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh access token",
    description="Exchange a valid refresh token for a new access/refresh token pair.",
    responses={
        200: {"description": "New token pair issued"},
        401: {"description": "Invalid or expired refresh token"},
    },
)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    return await auth_service.refresh_access_token(db, body.refresh_token)


@router.get(
    "/me",
    response_model=UserMeResponse,
    summary="Get current user profile",
    description="Returns the authenticated user's profile including role-based menu items for the frontend sidebar.",
    responses={
        200: {"description": "Current user profile with menu items"},
        401: {"description": "Missing or invalid Bearer token"},
    },
)
async def me(current_user: User = Depends(get_current_user)):
    menu = ROLE_MENU_ITEMS.get(current_user.role, [])
    data = UserMeResponse.model_validate(current_user)
    data.menu_items = menu
    return data


@router.post(
    "/logout",
    summary="Logout user",
    description="Client-side logout. JWT is stateless — the client should discard stored tokens.",
    responses={
        200: {"description": "Logout acknowledged"},
    },
)
async def logout():
    return {"message": "Logged out successfully"}
