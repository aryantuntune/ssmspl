from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, decode_token
from app.models.portal_user import PortalUser
from app.schemas.auth import TokenResponse
from app.schemas.portal_user import PortalUserRegister
from app.services import token_service


async def authenticate_portal_user(db: AsyncSession, email: str, password: str) -> PortalUser | None:
    result = await db.execute(select(PortalUser).where(PortalUser.email == email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.password):
        return None
    return user


async def login(db: AsyncSession, email: str, password: str) -> TokenResponse:
    user = await authenticate_portal_user(db, email, password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    extra = {"role": "PORTAL_USER"}
    access_token = create_access_token(subject=str(user.id), extra_claims=extra)
    refresh_token = create_refresh_token(subject=str(user.id))

    # Store refresh token in DB
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await token_service.store_refresh_token(db, refresh_token, expires_at, portal_user_id=user.id)

    # Cleanup old expired tokens
    await token_service.cleanup_expired(db)

    await db.commit()
    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


async def register(db: AsyncSession, data: PortalUserRegister) -> PortalUser:
    # Check if email already exists
    result = await db.execute(select(PortalUser).where(PortalUser.email == data.email))
    if result.scalar_one_or_none():
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
    )
    db.add(portal_user)
    await db.commit()
    await db.refresh(portal_user)
    return portal_user


async def refresh_access_token(db: AsyncSession, refresh_token: str) -> TokenResponse:
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
    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


async def logout(db: AsyncSession, refresh_token: str | None) -> None:
    """Revoke the refresh token if provided. Graceful no-op if None."""
    if refresh_token:
        await token_service.revoke_token(db, refresh_token)
        await db.commit()
