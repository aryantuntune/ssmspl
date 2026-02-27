import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.cookies import set_auth_cookies, clear_auth_cookies
from app.core.rbac import ROLE_MENU_ITEMS, UserRole
from app.core.security import create_access_token, create_refresh_token
from app.database import get_db
from app.dependencies import get_current_user
from app.middleware.rate_limit import limiter
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    MobileLoginResponse,
    MobileUserInfo,
    RefreshRequest,
    ResetPasswordRequest,
)
from app.schemas.user import UserMeResponse
from app.services import auth_service, token_service
from app.services.email_service import send_password_reset_email
from app.services.token_service import cleanup_expired_background
from app.services.user_service import _resolve_route_name, _resolve_route_branches

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
async def login(request: Request, body: LoginRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    tokens = await auth_service.login(db, body.email, body.password)
    # Probabilistic cleanup (~5% of logins) to avoid expired token buildup
    if random.random() < 0.05:
        background_tasks.add_task(cleanup_expired_background)
    response = JSONResponse(content={"message": "Login successful", "token_type": "bearer"})
    set_auth_cookies(response, tokens["access_token"], tokens["refresh_token"])
    return response


@router.post(
    "/mobile-login",
    response_model=MobileLoginResponse,
    summary="Mobile app login (TICKET_CHECKER only)",
    description="Authenticate a ticket checker for the mobile app. Returns tokens in JSON body (no cookies). Rejects non-TICKET_CHECKER roles.",
    responses={
        200: {"description": "Successfully authenticated"},
        401: {"description": "Invalid email or password"},
        403: {"description": "Not a ticket checker account"},
    },
)
@limiter.limit("10/minute")
async def mobile_login(
    request: Request,
    body: LoginRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    # Authenticate first
    user = await auth_service.authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    # Check role BEFORE generating tokens
    if user.role != UserRole.TICKET_CHECKER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This app is for ticket checkers only. Please use the web dashboard.",
        )
    # Generate tokens
    user.last_login = datetime.now(timezone.utc)
    extra = {"role": user.role.value}
    access_token = create_access_token(subject=str(user.id), extra_claims=extra)
    refresh_token = create_refresh_token(subject=str(user.id))
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await token_service.store_refresh_token(db, refresh_token, expires_at, user_id=user.id)
    await db.commit()

    # Probabilistic cleanup (~5% of logins) to avoid expired token buildup
    if random.random() < 0.05:
        background_tasks.add_task(cleanup_expired_background)

    route_name = await _resolve_route_name(db, user.route_id)
    return MobileLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=MobileUserInfo(
            id=str(user.id),
            full_name=user.full_name,
            email=user.email,
            role=user.role.value,
            route_id=user.route_id,
            route_name=route_name,
        ),
    )


@router.post(
    "/mobile-refresh",
    summary="Refresh tokens for mobile app",
    description="Exchange a valid refresh token for a new token pair. Returns tokens in JSON body.",
    responses={
        200: {"description": "New token pair issued"},
        401: {"description": "Invalid or expired refresh token"},
    },
)
@limiter.limit("20/minute")
async def mobile_refresh(request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    tokens = await auth_service.refresh_access_token(db, body.refresh_token)
    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "token_type": "bearer",
    }


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
async def forgot_password(request: Request, body: ForgotPasswordRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    token = await auth_service.forgot_password(db, body.email)
    if token:
        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={token}"
        background_tasks.add_task(send_password_reset_email, body.email, reset_link, "Admin User")
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
