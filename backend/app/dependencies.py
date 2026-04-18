from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import decode_token
from app.core.rbac import UserRole
from app.config import settings
from app.database import get_db
from app.models.user import User
from app.models.portal_user import PortalUser
from app.services.token_blacklist import is_blacklisted

# auto_error=False so requests with cookies (no Bearer header) don't get 403
bearer_scheme = HTTPBearer(auto_error=False)


def _extract_token(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials],
    cookie_name: str,
) -> str:
    """Extract token from cookie first, then Bearer header."""
    token = request.cookies.get(cookie_name)
    if token:
        return token
    if credentials:
        return credentials.credentials
    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = _extract_token(request, credentials, "ssmspl_access_token")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exception
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Check if token is blacklisted (instant logout enforcement)
    jti = payload.get("jti")
    if jti and await is_blacklisted(jti):
        raise credentials_exception

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_exception

    # Single-session enforcement: verify JWT session matches the active session
    sid = payload.get("sid")
    if not sid or user.active_session_id != sid:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="session_expired_elsewhere",
        )

    # Server-side idle timeout: force-logout if no activity for configured duration
    # Skip for TICKET_CHECKER — mobile checker app has no heartbeat mechanism
    now = datetime.now(timezone.utc)
    idle_limit = settings.SESSION_IDLE_TIMEOUT_MINUTES * 60  # seconds
    if user.session_last_active and user.role != UserRole.TICKET_CHECKER:
        idle_seconds = (now - user.session_last_active).total_seconds()
        if idle_seconds > idle_limit:
            # Full session teardown — revoke all tokens so session cannot resume
            from app.services import user_session_service, token_service
            from app.services.token_blacklist import blacklist_token
            if user.active_session_id:
                await user_session_service.end_session(db, user.active_session_id, "idle_timeout")
            await token_service.revoke_all_for_user(db, user_id=user.id)
            if jti:
                exp = payload.get("exp", 0)
                await blacklist_token(jti, exp)
            user.active_session_id = None
            user.session_last_active = None
            await db.commit()
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="session_idle_timeout",
            )

    # Update session activity (throttle to every 30s to reduce DB writes)
    if not user.session_last_active or (now - user.session_last_active).total_seconds() > 30:
        user.session_last_active = now
        # Also update heartbeat in user_sessions table
        if user.active_session_id:
            from app.services.user_session_service import update_heartbeat
            await update_heartbeat(db, user.active_session_id)

    # Admin portal: ADMIN users must be explicitly granted access
    if settings.ADMIN_PORTAL_MODE and user.role == UserRole.ADMIN:
        if not hasattr(request.state, "admin_access_checked"):
            from app.services.admin_user_access_service import check_user_access
            granted = await check_user_access(db, user.id)
            request.state.admin_access_checked = granted
        if not request.state.admin_access_checked:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin portal access not granted. Contact your system administrator.",
            )

    return user


async def get_current_portal_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> PortalUser:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    token = _extract_token(request, credentials, "ssmspl_portal_access_token")
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            raise credentials_exception
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        if payload.get("role") != "PORTAL_USER":
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    # Check if token is blacklisted (instant logout enforcement)
    jti = payload.get("jti")
    if jti and await is_blacklisted(jti):
        raise credentials_exception

    result = await db.execute(select(PortalUser).where(PortalUser.id == int(user_id)))
    user = result.scalar_one_or_none()
    if user is None or not user.is_active:
        raise credentials_exception
    return user


def require_roles(*roles: UserRole):
    """Factory that returns a dependency checking the user has one of the given roles."""
    async def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. Insufficient permissions.",
            )
        return current_user
    return role_checker
