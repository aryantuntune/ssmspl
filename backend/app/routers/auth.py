from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.rate_limit import limiter
from app.schemas.auth import LoginRequest, RefreshRequest, ForgotPasswordRequest, ResetPasswordRequest
from app.schemas.user import UserMeResponse
from app.services import auth_service
from app.services.user_service import _resolve_route_name, _resolve_route_branches
from app.dependencies import get_current_user
from app.core.rbac import ROLE_MENU_ITEMS
from app.core.cookies import set_auth_cookies, clear_auth_cookies
from app.services.email_service import send_password_reset_email
from app.config import settings
from app.models.user import User

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post(
    "/login",
    summary="Authenticate user",
    description="Validate email & password and return a JWT access token and refresh token via HttpOnly cookies.",
    responses={
        200: {"description": "Successfully authenticated"},
        401: {"description": "Invalid email or password"},
    },
)
@limiter.limit("10/minute")
async def login(request: Request, body: LoginRequest, db: AsyncSession = Depends(get_db)):
    tokens = await auth_service.login(db, body.email, body.password)
    response = JSONResponse(content={"message": "Login successful", "token_type": "bearer"})
    set_auth_cookies(response, tokens["access_token"], tokens["refresh_token"])
    return response


@router.post(
    "/refresh",
    summary="Refresh access token",
    description="Exchange a valid refresh token for a new access/refresh token pair.",
    responses={
        200: {"description": "New token pair issued"},
        401: {"description": "Invalid or expired refresh token"},
    },
)
@limiter.limit("20/minute")
async def refresh(request: Request, body: RefreshRequest | None = None, db: AsyncSession = Depends(get_db)):
    refresh_token = request.cookies.get("ssmspl_refresh_token")
    if not refresh_token and body:
        refresh_token = body.refresh_token
    if not refresh_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No refresh token provided")

    tokens = await auth_service.refresh_access_token(db, refresh_token)
    response = JSONResponse(content={"message": "Token refreshed", "token_type": "bearer"})
    set_auth_cookies(response, tokens["access_token"], tokens["refresh_token"])
    return response


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
async def me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    menu = ROLE_MENU_ITEMS.get(current_user.role, [])
    route_name = await _resolve_route_name(db, current_user.route_id)
    route_branches = await _resolve_route_branches(db, current_user.route_id)
    data = UserMeResponse.model_validate(current_user)
    data.menu_items = menu
    data.route_name = route_name
    data.route_branches = route_branches
    return data


@router.post(
    "/logout",
    summary="Logout user",
    description="Revoke the refresh token and clear auth cookies.",
    responses={
        200: {"description": "Logout acknowledged"},
    },
)
async def logout(request: Request, body: RefreshRequest | None = None, db: AsyncSession = Depends(get_db)):
    refresh_token = request.cookies.get("ssmspl_refresh_token")
    if not refresh_token and body:
        refresh_token = body.refresh_token
    await auth_service.logout(db, refresh_token)
    response = JSONResponse(content={"message": "Logged out successfully"})
    clear_auth_cookies(response)
    return response


@router.post(
    "/forgot-password",
    summary="Request password reset",
    description="Send a password reset email to the admin user's registered email address.",
    responses={
        200: {"description": "Reset email sent (or silently ignored if email not found)"},
    },
)
@limiter.limit("5/minute")
async def forgot_password(request: Request, body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    token = await auth_service.forgot_password(db, body.email)
    if token:
        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        await send_password_reset_email(body.email, reset_link, "Admin User")
    # Always return success to prevent email enumeration
    return {"message": "If an account with that email exists, a password reset link has been sent."}


@router.post(
    "/reset-password",
    summary="Reset password with token",
    description="Set a new password using the token from the password reset email.",
    responses={
        200: {"description": "Password updated successfully"},
        400: {"description": "Invalid or expired reset token"},
    },
)
@limiter.limit("5/minute")
async def reset_password(request: Request, body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    await auth_service.reset_password(db, body.token, body.new_password)
    return {"message": "Password has been reset successfully. You can now log in with your new password."}
