from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.rate_limit import limiter
from app.schemas.auth import RefreshRequest
from app.schemas.portal_user import PortalUserLogin, PortalUserRegister, PortalUserRead, PortalUserMeResponse
from app.services import portal_auth_service
from app.dependencies import get_current_portal_user
from app.core.cookies import set_auth_cookies, clear_auth_cookies
from app.models.portal_user import PortalUser

router = APIRouter(prefix="/api/portal/auth", tags=["Portal Authentication"])


@router.post(
    "/login",
    summary="Authenticate portal user (customer)",
    description="Validate email & password and return a JWT access token and refresh token via HttpOnly cookies.",
    responses={
        200: {"description": "Successfully authenticated"},
        401: {"description": "Invalid email or password"},
    },
)
@limiter.limit("10/minute")
async def login(request: Request, body: PortalUserLogin, db: AsyncSession = Depends(get_db)):
    tokens = await portal_auth_service.login(db, body.email, body.password)
    response = JSONResponse(content={"message": "Login successful", "token_type": "bearer"})
    set_auth_cookies(
        response, tokens["access_token"], tokens["refresh_token"],
        cookie_prefix="ssmspl_portal",
        refresh_path="/api/portal/auth/refresh",
    )
    return response


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
@limiter.limit("10/minute")
async def register(request: Request, body: PortalUserRegister, db: AsyncSession = Depends(get_db)):
    return await portal_auth_service.register(db, body)


@router.post(
    "/refresh",
    summary="Refresh portal user access token",
    description="Exchange a valid refresh token for a new access/refresh token pair.",
    responses={
        200: {"description": "New token pair issued"},
        401: {"description": "Invalid or expired refresh token"},
    },
)
@limiter.limit("20/minute")
async def refresh(request: Request, body: RefreshRequest | None = None, db: AsyncSession = Depends(get_db)):
    refresh_token = request.cookies.get("ssmspl_portal_refresh_token")
    if not refresh_token and body:
        refresh_token = body.refresh_token
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token provided")

    tokens = await portal_auth_service.refresh_access_token(db, refresh_token)
    response = JSONResponse(content={"message": "Token refreshed", "token_type": "bearer"})
    set_auth_cookies(
        response, tokens["access_token"], tokens["refresh_token"],
        cookie_prefix="ssmspl_portal",
        refresh_path="/api/portal/auth/refresh",
    )
    return response


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
    description="Revoke the refresh token and clear portal auth cookies.",
    responses={
        200: {"description": "Logout acknowledged"},
    },
)
async def logout(request: Request, body: RefreshRequest | None = None, db: AsyncSession = Depends(get_db)):
    refresh_token = request.cookies.get("ssmspl_portal_refresh_token")
    if not refresh_token and body:
        refresh_token = body.refresh_token
    await portal_auth_service.logout(db, refresh_token)
    response = JSONResponse(content={"message": "Logged out successfully"})
    clear_auth_cookies(response, cookie_prefix="ssmspl_portal", refresh_path="/api/portal/auth/refresh")
    return response
