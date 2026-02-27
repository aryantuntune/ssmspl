from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token
from app.models.portal_user import PortalUser
from app.schemas.portal_user import PortalUserRegister
from app.services import token_service
from app.services import otp_service


async def authenticate_portal_user(db: AsyncSession, email: str, password: str) -> PortalUser | None:
    result = await db.execute(select(PortalUser).where(PortalUser.email == email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.password):
        return None
    return user


async def login(db: AsyncSession, email: str, password: str) -> dict:
    user = await authenticate_portal_user(db, email, password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Email not verified. Please verify your email before logging in.",
        )

    extra = {"role": "PORTAL_USER"}
    access_token = create_access_token(subject=str(user.id), extra_claims=extra)
    refresh_token = create_refresh_token(subject=str(user.id))

    # Store refresh token in DB
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await token_service.store_refresh_token(db, refresh_token, expires_at, portal_user_id=user.id)

    await db.commit()
    return {"access_token": access_token, "refresh_token": refresh_token}


async def register(db: AsyncSession, data: PortalUserRegister) -> tuple[PortalUser, str]:
    """Register a new portal user. Returns (user, raw_otp) — caller sends the email."""
    # Check if email already exists
    result = await db.execute(select(PortalUser).where(PortalUser.email == data.email))
    existing = result.scalar_one_or_none()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists",
        )

    portal_user = PortalUser(
        first_name=data.first_name,
        last_name=data.last_name,
        email=data.email,
        password=get_password_hash(data.password),
        mobile=data.mobile,
        is_verified=False,
    )
    db.add(portal_user)
    await db.flush()

    # Generate OTP
    raw_otp = await otp_service.create_otp(db, data.email, "registration")
    await db.commit()
    await db.refresh(portal_user)

    return portal_user, raw_otp


async def verify_registration_otp(db: AsyncSession, email: str, otp: str) -> None:
    """Verify the registration OTP and mark the user as verified."""
    await otp_service.verify_otp(db, email, "registration", otp)

    result = await db.execute(select(PortalUser).where(PortalUser.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    user.is_verified = True
    await db.commit()


async def resend_otp(db: AsyncSession, email: str, purpose: str) -> tuple[str, str, str] | None:
    """Generate a new OTP. Returns (email, otp, first_name) or None if user not found."""
    result = await db.execute(select(PortalUser).where(PortalUser.email == email))
    user = result.scalar_one_or_none()
    if not user:
        return None  # Silent — prevent email enumeration

    if purpose == "registration" and user.is_verified:
        return None  # Already verified, no need to send OTP

    raw_otp = await otp_service.create_otp(db, email, purpose)
    await db.commit()

    return email, raw_otp, user.first_name


async def refresh_access_token(db: AsyncSession, refresh_token: str) -> dict:
    from jose import JWTError
    try:
        payload = decode_token(refresh_token)
        if payload.get("type") != "refresh":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    # Validate token exists in DB and is not revoked
    stored = await token_service.validate_refresh_token(db, refresh_token)
    if stored is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Refresh token revoked or not found")

    result = await db.execute(select(PortalUser).where(PortalUser.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Revoke old token
    await token_service.revoke_token(db, refresh_token)

    # Issue new pair
    extra = {"role": "PORTAL_USER"}
    new_access = create_access_token(subject=str(user.id), extra_claims=extra)
    new_refresh = create_refresh_token(subject=str(user.id))

    # Store new refresh token
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await token_service.store_refresh_token(db, new_refresh, expires_at, portal_user_id=user.id)

    await db.commit()
    return {"access_token": new_access, "refresh_token": new_refresh}


async def logout(db: AsyncSession, refresh_token: str | None) -> None:
    """Revoke the refresh token if provided. Graceful no-op if None."""
    if refresh_token:
        await token_service.revoke_token(db, refresh_token)
        await db.commit()


async def forgot_password(db: AsyncSession, email: str) -> tuple[str, str, str] | None:
    """Generate an OTP for password reset. Returns (email, otp, first_name) or None if user not found."""
    result = await db.execute(select(PortalUser).where(PortalUser.email == email))
    user = result.scalar_one_or_none()
    if not user:
        return None  # Silent — prevent email enumeration

    raw_otp = await otp_service.create_otp(db, email, "password_reset")
    await db.commit()

    return email, raw_otp, user.first_name


async def reset_password(db: AsyncSession, email: str, otp: str, new_password: str) -> None:
    """Verify OTP and update the portal user's password."""
    await otp_service.verify_otp(db, email, "password_reset", otp)

    result = await db.execute(select(PortalUser).where(PortalUser.email == email))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.password = get_password_hash(new_password)
    await db.commit()
