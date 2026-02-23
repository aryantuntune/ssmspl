from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, create_password_reset_token, decode_token
from app.core.rbac import ROLE_MENU_ITEMS
from app.models.user import User
from app.services import token_service


async def authenticate_user(db: AsyncSession, username: str, password: str) -> User | None:
    result = await db.execute(select(User).where(User.username == username, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user or not verify_password(password, user.hashed_password):
        return None
    return user


async def login(db: AsyncSession, username: str, password: str) -> dict:
    from fastapi import HTTPException, status
    user = await authenticate_user(db, username, password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    # Update last_login
    user.last_login = datetime.now(timezone.utc)

    extra = {"role": user.role.value}
    access_token = create_access_token(subject=str(user.id), extra_claims=extra)
    refresh_token = create_refresh_token(subject=str(user.id))

    # Store refresh token in DB
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await token_service.store_refresh_token(db, refresh_token, expires_at, user_id=user.id)

    # Cleanup old expired tokens (fire-and-forget, ignore count)
    await token_service.cleanup_expired(db)

    await db.commit()
    return {"access_token": access_token, "refresh_token": refresh_token}


async def refresh_access_token(db: AsyncSession, refresh_token: str) -> dict:
    from fastapi import HTTPException, status
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

    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    # Revoke the old token
    await token_service.revoke_token(db, refresh_token)

    # Issue new pair
    extra = {"role": user.role.value}
    new_access = create_access_token(subject=str(user.id), extra_claims=extra)
    new_refresh = create_refresh_token(subject=str(user.id))

    # Store new refresh token
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await token_service.store_refresh_token(db, new_refresh, expires_at, user_id=user.id)

    await db.commit()
    return {"access_token": new_access, "refresh_token": new_refresh}


async def logout(db: AsyncSession, refresh_token: str | None) -> None:
    """Revoke the refresh token if provided. Graceful no-op if None."""
    if refresh_token:
        await token_service.revoke_token(db, refresh_token)
        await db.commit()


async def forgot_password(db: AsyncSession, email: str) -> str | None:
    """Generate a password reset token for an admin user. Returns token or None if user not found."""
    result = await db.execute(select(User).where(User.email == email, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        return None
    return create_password_reset_token(subject=str(user.id), user_type="admin")


async def reset_password(db: AsyncSession, token: str, new_password: str) -> None:
    """Validate reset token and update the user's password."""
    from fastapi import HTTPException, status
    from jose import JWTError
    try:
        payload = decode_token(token)
        if payload.get("type") != "password_reset" or payload.get("user_type") != "admin":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token")
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    result = await db.execute(select(User).where(User.id == user_id, User.is_active == True))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.hashed_password = get_password_hash(new_password)
    await db.commit()
