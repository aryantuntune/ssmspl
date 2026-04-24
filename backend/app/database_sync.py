"""
Secondary DB engine for read-only diagnostics against ssmspl_sync
(the logical-replication subscriber that mirrors ssmspl_db_prod).

This engine is used ONLY by the sync-check service. It must NEVER issue
writes — ssmspl_sync is downstream from a publisher, and local writes would
silently diverge from the upstream truth.
"""
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

sync_engine = None
SyncSessionLocal = None

if settings.SYNC_DATABASE_URL:
    sync_engine = create_async_engine(
        settings.SYNC_DATABASE_URL,
        echo=False,
        pool_pre_ping=True,
        # Frontend sync-check runs up to 4 workers concurrently. Pool size 4 + overflow 4
        # gives 2 slots of headroom so a duplicate tab or leftover session never starves workers.
        pool_size=4,
        max_overflow=4,
        pool_recycle=300,
        pool_timeout=15,
    )

    SyncSessionLocal = async_sessionmaker(
        sync_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )


def is_sync_configured() -> bool:
    """True when SYNC_DATABASE_URL is set and the engine is initialized."""
    return SyncSessionLocal is not None
