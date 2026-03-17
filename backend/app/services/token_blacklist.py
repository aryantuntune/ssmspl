"""Redis-based access token blacklist for instant logout enforcement.

When a user logs out, their access token's JTI is added to Redis with a TTL
matching the token's remaining lifetime. On every authenticated request,
the JTI is checked against the blacklist before granting access.

If Redis is unavailable or REDIS_URL is empty, the blacklist is disabled
and the system falls back to the existing session-ID enforcement.
"""
import logging
from datetime import datetime, timezone

import redis.asyncio as redis

from app.config import settings

logger = logging.getLogger(__name__)

_redis_client: redis.Redis | None = None


async def init_blacklist() -> None:
    """Initialize the Redis connection for token blacklisting."""
    global _redis_client
    if not settings.REDIS_URL:
        logger.info("REDIS_URL not set — token blacklist disabled")
        return
    try:
        _redis_client = redis.from_url(settings.REDIS_URL, decode_responses=True)
        await _redis_client.ping()
        logger.info("Token blacklist connected to Redis")
    except Exception as e:
        logger.warning("Failed to connect to Redis for token blacklist: %s", e)
        _redis_client = None


async def close_blacklist() -> None:
    """Close the Redis connection."""
    global _redis_client
    if _redis_client:
        await _redis_client.aclose()
        _redis_client = None


async def blacklist_token(jti: str, exp: int) -> None:
    """Add a token's JTI to the blacklist with TTL = remaining lifetime."""
    if not _redis_client:
        return
    try:
        now = int(datetime.now(timezone.utc).timestamp())
        ttl = max(exp - now, 0)
        if ttl > 0:
            await _redis_client.setex(f"bl:{jti}", ttl, "1")
    except Exception as e:
        logger.warning("Failed to blacklist token: %s", e)


async def is_blacklisted(jti: str) -> bool:
    """Check if a token's JTI is in the blacklist."""
    if not _redis_client:
        return False
    try:
        return await _redis_client.exists(f"bl:{jti}") > 0
    except Exception as e:
        logger.warning("Failed to check token blacklist: %s", e)
        return False  # Fail open -- session-ID enforcement is the backup
