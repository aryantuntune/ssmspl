import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.core.security import hash_token
from app.models.refresh_token import RefreshToken


async def store_refresh_token(
    db: AsyncSession,
    raw_token: str,
    expires_at: datetime,
    *,
    user_id: uuid.UUID | None = None,
    portal_user_id: int | None = None,
) -> RefreshToken:
    """Hash and store a refresh token. Exactly one of user_id or portal_user_id must be set."""
    token_hash = hash_token(raw_token)
    rt = RefreshToken(
        user_id=user_id,
        portal_user_id=portal_user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.add(rt)
    await db.flush()
    return rt


async def validate_refresh_token(
    db: AsyncSession,
    raw_token: str,
) -> RefreshToken | None:
    """Look up a refresh token by hash. Returns None if not found or already revoked."""
    token_hash = hash_token(raw_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,
        )
    )
    rt = result.scalar_one_or_none()
    if rt is None:
        return None
    # Check expiry
    if rt.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        return None
    return rt


async def revoke_token(db: AsyncSession, raw_token: str) -> bool:
    """Revoke a single refresh token by its raw value. Returns True if found and revoked."""
    token_hash = hash_token(raw_token)
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked == False,
        )
    )
    rt = result.scalar_one_or_none()
    if rt is None:
        return False
    rt.revoked = True
    await db.flush()
    return True


async def revoke_all_for_user(
    db: AsyncSession,
    *,
    user_id: uuid.UUID | None = None,
    portal_user_id: int | None = None,
) -> int:
    """Revoke all active refresh tokens for a given user. Returns count revoked."""
    query = select(RefreshToken).where(RefreshToken.revoked == False)
    if user_id is not None:
        query = query.where(RefreshToken.user_id == user_id)
    elif portal_user_id is not None:
        query = query.where(RefreshToken.portal_user_id == portal_user_id)
    else:
        return 0

    result = await db.execute(query)
    tokens = result.scalars().all()
    for t in tokens:
        t.revoked = True
    await db.flush()
    return len(tokens)


async def cleanup_expired(db: AsyncSession, older_than_days: int = 30) -> int:
    """Delete refresh tokens that expired more than `older_than_days` ago."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=older_than_days)
    result = await db.execute(
        delete(RefreshToken).where(RefreshToken.expires_at < cutoff)
    )
    await db.flush()
    return result.rowcount
