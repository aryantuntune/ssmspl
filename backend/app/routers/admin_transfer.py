import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.models.ticket import Ticket, TicketItem
from app.models.payment_mode import PaymentMode
from app.models.item import Item
from app.models.item_rate import ItemRate
from app.services import admin_transfer_engine

router = APIRouter(prefix="/api/admin/d-drive/transfer", tags=["Admin D Drive Transfer"])

_admin_or_super = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


@router.get("/scope")
async def scope_data(
    branch_id: int = Query(...),
    date_start: date = Query(...),
    date_end: date = Query(...),
    from_item_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    """Return total quantity + representative rate/levy for the FROM item in scope."""
    if from_item_id is None:
        return {"total_quantity": 0, "from_rate": None, "from_levy": None, "routes": []}

    # Total quantity + total levy across scope
    totals_q = (
        select(
            func.coalesce(func.sum(TicketItem.quantity), 0).label("qty"),
            func.coalesce(func.sum(TicketItem.levy * TicketItem.quantity), 0).label("levy_total"),
        )
        .select_from(TicketItem)
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id == branch_id,
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            TicketItem.item_id == from_item_id,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
            func.upper(PaymentMode.description) == "CASH",
        )
    )
    row = (await db.execute(totals_q)).one()
    total_qty = int(row.qty or 0)
    levy_total = float(row.levy_total or 0)

    # Routes in scope — for display / multi-route warning
    routes_q = (
        select(Ticket.route_id, func.count(TicketItem.id).label("count"))
        .select_from(TicketItem)
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id == branch_id,
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            TicketItem.item_id == from_item_id,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
            func.upper(PaymentMode.description) == "CASH",
        )
        .group_by(Ticket.route_id)
    )
    routes = [{"route_id": r.route_id, "count": int(r.count)} for r in (await db.execute(routes_q)).all()]

    # Representative FROM levy: pick the most common levy value
    mode_q = (
        select(TicketItem.levy, func.count().label("c"))
        .select_from(TicketItem)
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id == branch_id,
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            TicketItem.item_id == from_item_id,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
            func.upper(PaymentMode.description) == "CASH",
        )
        .group_by(TicketItem.levy)
        .order_by(func.count().desc())
        .limit(1)
    )
    mode_row = (await db.execute(mode_q)).first()
    from_levy_representative = float(mode_row[0]) if mode_row else None

    return {
        "total_quantity": total_qty,
        "from_levy_total": levy_total,
        "from_levy_representative": from_levy_representative,
        "routes": routes,
    }


@router.get("/to-master-preview")
async def to_master_preview(
    to_item_id: int = Query(...),
    route_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    """Preview TO item's CURRENT rate + levy for the given route (for UI T2 display)."""
    q = select(ItemRate.rate, ItemRate.levy).where(
        ItemRate.item_id == to_item_id,
        ItemRate.route_id == route_id,
        ItemRate.is_active == True,
    ).limit(1)
    row = (await db.execute(q)).first()
    if row is None:
        return {"rate": None, "levy": None, "total": None}
    rate = float(row[0]) if row[0] is not None else None
    levy = float(row[1]) if row[1] is not None else None
    total = (rate or 0) + (levy or 0) if (rate is not None or levy is not None) else None
    return {"rate": rate, "levy": levy, "total": total}


# Back-compat alias (frontend may still call /to-levy-preview)
@router.get("/to-levy-preview")
async def to_levy_preview_legacy(
    to_item_id: int = Query(...),
    route_id: int = Query(...),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    data = await to_master_preview(to_item_id=to_item_id, route_id=route_id, db=db, current_user=current_user)
    return {"levy": data.get("levy")}


class DryRunRequest(BaseModel):
    branch_id: int
    date_start: date
    date_end: date
    from_item_id: int
    to_item_id: int
    input_mode: str  # "percentage" or "quantity"
    input_value: float


class CommitRequest(BaseModel):
    batch_id: str


@router.post("/dry-run")
async def transfer_dry_run(
    body: DryRunRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    return await admin_transfer_engine.dry_run(
        db,
        branch_id=body.branch_id,
        date_start=body.date_start,
        date_end=body.date_end,
        from_item_id=body.from_item_id,
        to_item_id=body.to_item_id,
        input_mode=body.input_mode,
        input_value=body.input_value,
        created_by=current_user.id,
    )


@router.post("/commit")
async def transfer_commit(
    body: CommitRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    return await admin_transfer_engine.commit(db, body.batch_id, current_user.id)
