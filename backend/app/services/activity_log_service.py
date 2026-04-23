"""Lightweight activity logging service.

Logs user actions to user_activity_logs table using its own DB session
(fire-and-forget) so it never blocks or delays the calling endpoint.
"""
import logging
import uuid

from app.database import AsyncSessionLocal
from app.models.user_activity_log import UserActivityLog

logger = logging.getLogger("ssmspl.activity")


class ActivityAction:
    """Constants for action_type column."""
    TICKET_CREATE = "TICKET_CREATE"
    TICKET_BATCH = "TICKET_BATCH"
    TICKET_VIEW = "TICKET_VIEW"
    TICKET_CANCEL = "TICKET_CANCEL"
    REPORT_VIEW = "REPORT_VIEW"
    REPORT_PDF = "REPORT_PDF"
    REPORT_XLSX = "REPORT_XLSX"
    SETTINGS_CHANGE = "SETTINGS_CHANGE"
    BRANCH_SWITCH = "BRANCH_SWITCH"


async def log_activity(
    session_id: str | None,
    user_id: uuid.UUID,
    action_type: str,
    metadata: dict | None = None,
) -> None:
    """Insert an activity log row. Fire-and-forget — failures are logged, never raised."""
    if not session_id:
        return
    try:
        async with AsyncSessionLocal() as db:
            db.add(UserActivityLog(
                session_id=session_id,
                user_id=user_id,
                action_type=action_type,
                metadata_=metadata,
            ))
            await db.commit()
    except Exception:
        logger.debug("Failed to log activity %s for session %s", action_type, session_id, exc_info=True)
