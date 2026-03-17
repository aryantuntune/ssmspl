import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.core.security import verify_password, get_password_hash, create_access_token, create_refresh_token, create_password_reset_token, decode_token
from app.core.rbac import ROLE_MENU_ITEMS
from app.models.user import User
from app.services import token_service

MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15

async def authenticate_user(db: AsyncSession, username: str, password: str) -> User | None:
    # Look up user (include inactive for lockout tracking — login will reject inactive)
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        return None

    # Check lockout
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        return None  # login() will raise generic error — don't reveal lockout to caller

    if not user.is_active:
        return None

    if not verify_password(password, user.hashed_password):
        # Increment failed attempts — commit immediately so the counter persists
        # even when login() raises HTTPException (which would rollback a flush)
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        await db.commit()
        return None

    # Successful auth — reset lockout counters
    user.failed_login_attempts = 0
    user.locked_until = None
    return user


def _start_session(user: User) -> str:
    """Generate a new session ID and stamp it on the user. Returns the session_id.
    Any previous session is implicitly invalidated — the old sid in existing JWTs
    will no longer match active_session_id, causing 401 on next request."""
    sid = str(uuid.uuid4())
    user.active_session_id = sid
    user.session_last_active = datetime.now(timezone.utc)
    return sid


async def login(db: AsyncSession, username: str, password: str) -> dict:
    from fastapi import HTTPException, status
    user = await authenticate_user(db, username, password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )

    # Start new session (overwrites any existing session — old JWTs become invalid)
    sid = _start_session(user)
    user.last_login = datetime.now(timezone.utc)

    extra = {"role": user.role.value, "sid": sid}
    access_token = create_access_token(subject=str(user.id), extra_claims=extra)
    refresh_token = create_refresh_token(subject=str(user.id))

    # Store refresh token in DB
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await token_service.store_refresh_token(db, refresh_token, expires_at, user_id=user.id)

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

    # Issue new pair — carry forward the user's current session ID
    extra = {"role": user.role.value}
    if user.active_session_id:
        extra["sid"] = user.active_session_id
    new_access = create_access_token(subject=str(user.id), extra_claims=extra)
    new_refresh = create_refresh_token(subject=str(user.id))

    # Store new refresh token
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await token_service.store_refresh_token(db, new_refresh, expires_at, user_id=user.id)

    await db.commit()
    return {"access_token": new_access, "refresh_token": new_refresh}


async def logout(db: AsyncSession, refresh_token: str | None, user: User | None = None, access_token: str | None = None) -> None:
    """Revoke the refresh token, clear active session, and blacklist access token."""
    if refresh_token:
        await token_service.revoke_token(db, refresh_token)
    if user:
        user.active_session_id = None
        user.session_last_active = None

    # Blacklist the access token for its remaining lifetime
    if access_token:
        try:
            payload = decode_token(access_token)
            jti = payload.get("jti")
            exp = payload.get("exp")
            if jti and exp:
                from app.services.token_blacklist import blacklist_token
                await blacklist_token(jti, exp)
        except Exception:
            pass  # Best-effort -- token may already be expired/invalid

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
