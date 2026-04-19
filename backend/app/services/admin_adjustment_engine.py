"""
Item-deletion adjustment engine for D Drive Process Reconciliation.
Separate from admin_rate_reduction_engine.py (the rate/levy mutation engine, reserved for future sub-screen).
Full implementation in Task 3.
"""

import uuid
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession


async def dry_run(
    db: AsyncSession,
    branch_id: int,
    date_start: date,
    date_end: date,
    adjustment_amount: float,
    created_by: uuid.UUID,
) -> dict:
    raise NotImplementedError("Implemented in Task 3")


async def commit(
    db: AsyncSession,
    batch_id: str,
    plan_choice: str,
    confirmed_by: uuid.UUID,
) -> dict:
    raise NotImplementedError("Implemented in Task 3")
