from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=(settings.APP_ENV == "development"),
    pool_pre_ping=True,
    # Pool sizing: pool_size × gunicorn_workers must not exceed PG max_connections (default 100).
    # With workers = 2*CPU+1 (e.g. 5 on 2-core VPS): 5 × 15 = 75 connections max, safely under 100.
    pool_size=5,
    max_overflow=10,
    pool_recycle=300,       # Recycle connections every 5 min (prevents stale idle connections)
    pool_timeout=30,        # Wait max 30s for a connection from pool before erroring
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
