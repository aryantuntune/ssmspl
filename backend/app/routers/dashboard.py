import asyncio
import json
import logging

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.database import get_db, AsyncSessionLocal
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.models.user import User
from app.services.dashboard_service import get_dashboard_stats

logger = logging.getLogger("ssmspl")

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get(
    "/stats",
    summary="Get dashboard statistics",
    description="Returns aggregated dashboard stats: ticket count, today's revenue, active ferries, active branches.",
)
async def stats(
    current_user: User = Depends(
        require_roles(
            UserRole.SUPER_ADMIN,
            UserRole.ADMIN,
            UserRole.MANAGER,
            UserRole.BILLING_OPERATOR,
            UserRole.TICKET_CHECKER,
        )
    ),
    db: AsyncSession = Depends(get_db),
):
    return await get_dashboard_stats(db)


async def _authenticate_ws(websocket: WebSocket) -> User | None:
    """Authenticate a WebSocket connection via cookie or query param token."""
    # Try cookie first (sent automatically with upgrade request)
    token = websocket.cookies.get("ssmspl_access_token")
    # Fall back to query param for clients that can't send cookies
    if not token:
        token = websocket.query_params.get("token")
    if not token:
        return None
    try:
        payload = decode_token(token)
        if payload.get("type") != "access":
            return None
        user_id = payload.get("sub")
        if not user_id:
            return None
    except JWTError:
        return None

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()
        if user is None or not user.is_active:
            return None
        return user


@router.websocket("/ws")
async def dashboard_ws(websocket: WebSocket):
    user = await _authenticate_ws(websocket)
    if user is None:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    try:
        while True:
            async with AsyncSessionLocal() as db:
                data = await get_dashboard_stats(db)
            await websocket.send_text(json.dumps(data))
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.debug("Dashboard WebSocket closed for user %s", user.id)
