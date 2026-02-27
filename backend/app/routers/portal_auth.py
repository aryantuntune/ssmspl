import random

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.middleware.rate_limit import limiter
from app.schemas.auth import RefreshRequest
from app.schemas.portal_user import (
    PortalUserLogin,
    PortalUserRegister,
    PortalUserMeResponse,
    VerifyOtpRequest,
    ResendOtpRequest,
    ResetPasswordOtpRequest,
    PortalUserMobileLoginResponse,
    PortalUserProfileUpdate,
    PortalUserChangePassword,
    GoogleSignInRequest,
)
from app.services import portal_auth_service
from app.dependencies import get_current_portal_user
from app.core.cookies import set_auth_cookies, clear_auth_cookies
from app.models.portal_user import PortalUser

from app.services.email_service import send_otp_email
from app.services.token_service import cleanup_expired_background

router = APIRouter(prefix="/api/portal/auth", tags=["Portal Authentication"])


@router.post(
    "/login",
    summary="Authenticate portal user (customer)",
    description="Validate email & password and return a JWT access token and refresh token via HttpOnly cookies.",
    responses={
        200: {"description": "Successfully authenticated"},
        401: {"description": "Invalid email or password"},
        403: {"description": "Email not verified"},
    },
)
@limiter.limit("10/minute")
async def login(request: Request, body: PortalUserLogin, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    tokens = await portal_auth_service.login(db, body.email, body.password)
    # Probabilistic cleanup (~5% of logins) to avoid expired token buildup
    if random.random() < 0.05:
        background_tasks.add_task(cleanup_expired_background)
    response = JSONResponse(content={"message": "Login successful", "token_type": "bearer"})
    set_auth_cookies(
        response, tokens["access_token"], tokens["refresh_token"],
        cookie_prefix="ssmspl_portal",
        refresh_path="/api/portal/auth/refresh",
    )
    return response


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="Register a new portal user (customer)",
    description="Create a new customer account. A verification OTP will be sent to the provided email.",
    responses={
        201: {"description": "Account created, verification OTP sent"},
        409: {"description": "Email already registered"},
    },
)
@limiter.limit("10/minute")
async def register(request: Request, body: PortalUserRegister, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    user, raw_otp = await portal_auth_service.register(db, body)
    background_tasks.add_task(send_otp_email, user.email, raw_otp, user.first_name, "registration")
    return {"message": "A verification code has been sent to your email.", "email": user.email}


@router.post(
    "/verify-email",
    summary="Verify registration email with OTP",
    description="Submit the 6-digit OTP sent to the customer's email to verify the account.",
    responses={
        200: {"description": "Email verified successfully"},
        400: {"description": "Invalid or expired OTP"},
    },
)
@limiter.limit("10/minute")
async def verify_email(request: Request, body: VerifyOtpRequest, db: AsyncSession = Depends(get_db)):
    await portal_auth_service.verify_registration_otp(db, body.email, body.otp)
    return {"message": "Email verified successfully. You can now log in."}


@router.post(
    "/resend-otp",
    summary="Resend OTP for registration or password reset",
    description="Generate and send a new OTP. The purpose query param determines the flow.",
    responses={
        200: {"description": "OTP sent (or silently ignored if email not found)"},
    },
)
@limiter.limit("3/minute")
async def resend_otp(request: Request, body: ResendOtpRequest, background_tasks: BackgroundTasks, purpose: str = "registration", db: AsyncSession = Depends(get_db)):
    if purpose not in ("registration", "password_reset"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid purpose")
    result = await portal_auth_service.resend_otp(db, body.email, purpose)
    if result:
        email, raw_otp, first_name = result
        background_tasks.add_task(send_otp_email, email, raw_otp, first_name, purpose)
    return {"message": "If an account with that email exists, a new verification code has been sent."}


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
        is_verified=current_user.is_verified,
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


@router.post(
    "/forgot-password",
    summary="Request portal user password reset via OTP",
    description="Send a password reset OTP to the customer's registered email address.",
    responses={
        200: {"description": "OTP sent (or silently ignored if email not found)"},
    },
)
@limiter.limit("2/minute")
async def forgot_password(request: Request, body: ResendOtpRequest, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    result = await portal_auth_service.forgot_password(db, body.email)
    if result:
        email, raw_otp, first_name = result
        background_tasks.add_task(send_otp_email, email, raw_otp, first_name, "password_reset")
    return {"message": "If an account with that email exists, a verification code has been sent."}


@router.post(
    "/reset-password",
    summary="Reset portal user password with OTP",
    description="Verify the OTP and set a new password.",
    responses={
        200: {"description": "Password updated successfully"},
        400: {"description": "Invalid or expired OTP"},
    },
)
@limiter.limit("5/minute")
async def reset_password(request: Request, body: ResetPasswordOtpRequest, db: AsyncSession = Depends(get_db)):
    await portal_auth_service.reset_password(db, body.email, body.otp, body.new_password)
    return {"message": "Password has been reset successfully. You can now log in with your new password."}


@router.post(
    "/mobile-login",
    response_model=PortalUserMobileLoginResponse,
    summary="Mobile app login for portal user",
    description="Authenticate a customer for the mobile app. Returns tokens in JSON body (no cookies).",
    responses={
        200: {"description": "Successfully authenticated"},
        401: {"description": "Invalid email or password"},
        403: {"description": "Email not verified"},
    },
)
@limiter.limit("10/minute")
async def mobile_login(
    request: Request,
    body: PortalUserLogin,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    tokens = await portal_auth_service.login(db, body.email, body.password)
    if random.random() < 0.05:
        background_tasks.add_task(cleanup_expired_background)

    result = await db.execute(
        select(PortalUser).where(PortalUser.email == body.email)
    )
    user = result.scalar_one()

    return PortalUserMobileLoginResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user=PortalUserMeResponse(
            id=user.id,
            first_name=user.first_name,
            last_name=user.last_name,
            email=user.email,
            mobile=user.mobile,
            is_verified=user.is_verified,
            created_at=user.created_at,
            full_name=f"{user.first_name} {user.last_name}",
        ),
    )


@router.post(
    "/mobile-refresh",
    summary="Refresh portal user access token (mobile)",
    description="Exchange a refresh token for new tokens. Returns tokens in JSON body.",
    responses={
        200: {"description": "New token pair issued"},
        401: {"description": "Invalid or expired refresh token"},
    },
)
@limiter.limit("20/minute")
async def mobile_refresh(
    request: Request,
    body: RefreshRequest,
    db: AsyncSession = Depends(get_db),
):
    tokens = await portal_auth_service.refresh_access_token(db, body.refresh_token)
    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "token_type": "bearer",
    }


@router.put(
    "/profile",
    response_model=PortalUserMeResponse,
    summary="Update portal user profile",
)
async def update_profile(
    body: PortalUserProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    user = await portal_auth_service.update_profile(
        db, current_user.id, body.first_name, body.last_name, body.mobile
    )
    return PortalUserMeResponse(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        mobile=user.mobile,
        is_verified=user.is_verified,
        created_at=user.created_at,
        full_name=f"{user.first_name} {user.last_name}",
    )


@router.post(
    "/change-password",
    summary="Change portal user password",
)
async def change_password(
    body: PortalUserChangePassword,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    await portal_auth_service.change_password(
        db, current_user.id, body.old_password, body.new_password
    )
    return {"message": "Password changed successfully"}


@router.post(
    "/google-signin",
    response_model=PortalUserMobileLoginResponse,
    summary="Google Sign-In for mobile app",
)
@limiter.limit("10/minute")
async def google_signin(
    request: Request,
    body: GoogleSignInRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await portal_auth_service.google_signin(
        db, body.google_id, body.email, body.first_name, body.last_name
    )
    user = result["user"]
    return PortalUserMobileLoginResponse(
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
        user=PortalUserMeResponse(
            id=user.id,
            first_name=user.first_name,
            last_name=user.last_name,
            email=user.email,
            mobile=user.mobile,
            is_verified=user.is_verified,
            created_at=user.created_at,
            full_name=f"{user.first_name} {user.last_name}",
        ),
    )
