import uuid
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, model_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.rbac import UserRole
from app.database import get_db
from app.dependencies import require_roles
from app.models.ticket import Ticket, TicketItem
from app.models.payment_mode import PaymentMode
from app.models.item import Item
from app.models.item_rate import ItemRate
from app.models.route import Route
from app.services import admin_transfer_engine

router = APIRouter(prefix="/api/admin/d-drive/transfer", tags=["Admin D Drive Transfer"])

_admin_or_super = require_roles(UserRole.SUPER_ADMIN, UserRole.ADMIN)


async def _resolve_scope_branch_ids(
    db: AsyncSession, branch_id: int | None, route_id: int | None
) -> list[int]:
    """
    Resolve the list of branch_ids the transfer should consider.

    - If `route_id` is provided: returns BOTH endpoint branches of that route.
      The route must exist and be active; both branches participate regardless
      of which one happens to be inactive (we still consider their tickets so
      that historical transfers remain possible).
    - If `branch_id` is provided: returns [branch_id] (legacy single-branch mode).
    - If neither: HTTP 400.
    - If both: HTTP 400 (mutually exclusive — caller must choose one mode).
    """
    if (branch_id is None) == (route_id is None):
        raise HTTPException(
            status_code=400,
            detail="Provide exactly one of `branch_id` or `route_id`.",
        )
    if branch_id is not None:
        return [int(branch_id)]
    route = (await db.execute(select(Route).where(Route.id == route_id))).scalar_one_or_none()
    if route is None:
        raise HTTPException(status_code=404, detail=f"Route {route_id} not found.")
    return [int(route.branch_id_one), int(route.branch_id_two)]


@router.get("/scope")
async def scope_data(
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    date_start: date = Query(...),
    date_end: date = Query(...),
    from_item_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    """Return total quantity + representative rate/levy for the FROM item in scope.

    Scope can be a single branch (`branch_id`) or a route (`route_id`, both
    endpoint branches).
    """
    branch_ids = await _resolve_scope_branch_ids(db, branch_id, route_id)

    if from_item_id is None:
        return {
            "total_quantity": 0,
            "from_rate": None,
            "from_levy": None,
            "routes": [],
            "branch_ids": branch_ids,
        }

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
            Ticket.branch_id.in_(branch_ids),
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
            Ticket.branch_id.in_(branch_ids),
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
            Ticket.branch_id.in_(branch_ids),
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
        "branch_ids": branch_ids,
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
    # Exactly one of branch_id / route_id must be provided. route_id scopes the
    # transfer to BOTH endpoint branches of the route.
    branch_id: int | None = None
    route_id: int | None = None
    date_start: date
    date_end: date
    from_item_id: int
    to_item_id: int
    input_mode: str  # "percentage" or "quantity"
    input_value: float

    @model_validator(mode="after")
    def _validate_scope(self):
        if (self.branch_id is None) == (self.route_id is None):
            raise ValueError("Provide exactly one of `branch_id` or `route_id`.")
        return self


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
        route_id=body.route_id,
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
