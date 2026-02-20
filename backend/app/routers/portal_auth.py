from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.schemas.auth import TokenResponse, RefreshRequest
from app.schemas.portal_user import PortalUserLogin, PortalUserRegister, PortalUserRead, PortalUserMeResponse
from app.services import portal_auth_service
from app.dependencies import get_current_portal_user
from app.models.portal_user import PortalUser

router = APIRouter(prefix="/api/portal/auth", tags=["Portal Authentication"])


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Authenticate portal user (customer)",
    description="Validate email & password and return a JWT access token and refresh token for a customer.",
    responses={
        200: {"description": "Successfully authenticated"},
        401: {"description": "Invalid email or password"},
    },
)
async def login(body: PortalUserLogin, db: AsyncSession = Depends(get_db)):
    return await portal_auth_service.login(db, body.email, body.password)


@router.post(
    "/register",
    response_model=PortalUserRead,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new portal user (customer)",
    description="Create a new customer account for ferry booking.",
    responses={
        201: {"description": "Account created successfully"},
        409: {"description": "Email already registered"},
    },
)
async def register(body: PortalUserRegister, db: AsyncSession = Depends(get_db)):
    return await portal_auth_service.register(db, body)


@router.post(
    "/refresh",
    response_model=TokenResponse,
    summary="Refresh portal user access token",
    description="Exchange a valid refresh token for a new access/refresh token pair.",
    responses={
        200: {"description": "New token pair issued"},
        401: {"description": "Invalid or expired refresh token"},
    },
)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    return await portal_auth_service.refresh_access_token(db, body.refresh_token)


@router.get(
    "/me",
    response_model=PortalUserMeResponse,
    summary="Get current portal user profile",
    description="Returns the authenticated customer's profile.",
    responses={
        200: {"description": "Current portal user profile"},
        401: {"description": "Missing or invalid Bearer token"},
    },
)
async def me(current_user: PortalUser = Depends(get_current_portal_user)):
    return PortalUserMeResponse(
        id=current_user.id,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        email=current_user.email,
        mobile=current_user.mobile,
        created_at=current_user.created_at,
        full_name=f"{current_user.first_name} {current_user.last_name}",
    )


@router.post(
    "/logout",
    summary="Logout portal user",
    description="Client-side logout. JWT is stateless — the client should discard stored tokens.",
    responses={
        200: {"description": "Logout acknowledged"},
    },
)
async def logout():
    return {"message": "Logged out successfully"}
