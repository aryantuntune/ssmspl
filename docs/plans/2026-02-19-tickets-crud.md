# Tickets CRUD (Master-Detail) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement full Tickets CRUD with master-detail (Ticket → Ticket Items) across backend and frontend, including auto-generated ticket numbers, rate lookups, and computed amounts.

**Architecture:** Backend follows existing layered pattern (Router → Service → Model) with Pydantic schemas. Frontend follows existing CRUD page pattern with a master-detail popup modal. Ticket numbers are auto-generated per branch using `last_ticket_no` with row-level locking. Amounts are computed on frontend for live UX, cross-checked on backend before save.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, PostgreSQL, Next.js 16, React 19, TypeScript, Tailwind CSS v4, Axios.

---

## Database Schema Reference

```sql
-- User must add route_id and ensure these tables exist in DB before running
CREATE TABLE IF NOT EXISTS tickets (
    id bigint NOT NULL PRIMARY KEY,
    branch_id integer NOT NULL,
    ticket_no integer NOT NULL,
    ticket_date date NOT NULL,
    departure time without time zone,
    route_id integer NOT NULL,
    amount numeric(9,2) NOT NULL,
    discount numeric(9,2),
    payment_mode_id integer NOT NULL,
    is_cancelled boolean NOT NULL DEFAULT false,
    net_amount numeric(9,2) NOT NULL
);

CREATE TABLE IF NOT EXISTS ticket_items (
    id bigint NOT NULL PRIMARY KEY,
    ticket_id bigint NOT NULL,
    item_id integer NOT NULL,
    rate numeric(9,2) NOT NULL,
    levy numeric(9,2) NOT NULL,
    vehicle_no character varying(15),
    is_cancelled boolean NOT NULL DEFAULT false,
    quantity integer NOT NULL
);

-- branches table needs last_ticket_no column:
ALTER TABLE branches ADD COLUMN IF NOT EXISTS last_ticket_no integer NOT NULL DEFAULT 0;
```

## Calculations

- **ticket_items.amount** (computed, NOT stored in DB): `rate * (quantity + levy)`
- **tickets.amount** (stored): sum of all active (non-cancelled) ticket_items amounts
- **tickets.net_amount** (stored): `amount - discount`
- Frontend computes for live display; backend cross-checks before save.

---

## Task 1: Add `last_ticket_no` to Branch Model

**Files:**
- Modify: `backend/app/models/branch.py:18` (add column before `is_active`)

**Step 1: Add the column to the Branch model**

Add after line 17 (`sf_before`), before line 18 (`is_active`):

```python
last_ticket_no: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
```

The full import line already includes `Integer`. No new imports needed.

**Step 2: Verify no breakage**

```bash
cd backend && python -c "from app.models.branch import Branch; print(Branch.__tablename__)"
```

Expected: `branches`

**Step 3: Commit**

```bash
git add backend/app/models/branch.py
git commit -m "feat(backend): add last_ticket_no to Branch model"
```

---

## Task 2: Create Ticket and TicketItem Models

**Files:**
- Create: `backend/app/models/ticket.py`
- Modify: `backend/app/models/__init__.py:1-10`

**Step 1: Create the models file**

Create `backend/app/models/ticket.py`:

```python
from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, Integer, Numeric, String, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Ticket(Base):
    __tablename__ = "tickets"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    branch_id: Mapped[int] = mapped_column(Integer, ForeignKey("branches.id"), nullable=False)
    ticket_no: Mapped[int] = mapped_column(Integer, nullable=False)
    ticket_date: Mapped[object] = mapped_column(Date, nullable=False)
    departure: Mapped[object | None] = mapped_column(Time, nullable=True)
    route_id: Mapped[int] = mapped_column(Integer, ForeignKey("routes.id"), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    discount: Mapped[float | None] = mapped_column(Numeric(9, 2), nullable=True)
    payment_mode_id: Mapped[int] = mapped_column(Integer, ForeignKey("payment_modes.id"), nullable=False)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    net_amount: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)

    def __repr__(self) -> str:
        return f"<Ticket id={self.id} ticket_no={self.ticket_no} branch_id={self.branch_id}>"


class TicketItem(Base):
    __tablename__ = "ticket_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    ticket_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tickets.id"), nullable=False)
    item_id: Mapped[int] = mapped_column(Integer, ForeignKey("items.id"), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    levy: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    vehicle_no: Mapped[str | None] = mapped_column(String(15), nullable=True)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    def __repr__(self) -> str:
        return f"<TicketItem id={self.id} ticket_id={self.ticket_id} item_id={self.item_id}>"
```

**Step 2: Register in models/__init__.py**

Replace the entire `backend/app/models/__init__.py` with:

```python
from app.models.user import User
from app.models.boat import Boat
from app.models.branch import Branch
from app.models.route import Route
from app.models.item import Item
from app.models.item_rate import ItemRate
from app.models.ferry_schedule import FerrySchedule
from app.models.payment_mode import PaymentMode
from app.models.ticket import Ticket, TicketItem

__all__ = ["User", "Boat", "Branch", "Route", "Item", "ItemRate", "FerrySchedule", "PaymentMode", "Ticket", "TicketItem"]
```

**Step 3: Verify imports**

```bash
cd backend && python -c "from app.models import Ticket, TicketItem; print(Ticket.__tablename__, TicketItem.__tablename__)"
```

Expected: `tickets ticket_items`

**Step 4: Commit**

```bash
git add backend/app/models/ticket.py backend/app/models/__init__.py
git commit -m "feat(backend): add Ticket and TicketItem models"
```

---

## Task 3: Create Ticket Schemas

**Files:**
- Create: `backend/app/schemas/ticket.py`

**Step 1: Create the schemas file**

Create `backend/app/schemas/ticket.py`:

```python
from pydantic import BaseModel, Field
from datetime import date, time


# ── Ticket Item schemas ──

class TicketItemCreate(BaseModel):
    item_id: int = Field(..., description="Item ID")
    rate: float = Field(..., ge=0, description="Rate fetched from item_rate")
    levy: float = Field(..., ge=0, description="Levy fetched from item_rate")
    quantity: int = Field(..., ge=1, description="Quantity")
    vehicle_no: str | None = Field(None, max_length=15, description="Vehicle number (optional)")

    model_config = {
        "json_schema_extra": {
            "examples": [{"item_id": 1, "rate": 150.00, "levy": 10.00, "quantity": 2, "vehicle_no": None}]
        }
    }


class TicketItemUpdate(BaseModel):
    id: int | None = Field(None, description="Item ID for existing items (null for new items)")
    item_id: int = Field(..., description="Item ID")
    rate: float = Field(..., ge=0, description="Rate")
    levy: float = Field(..., ge=0, description="Levy")
    quantity: int = Field(..., ge=1, description="Quantity")
    vehicle_no: str | None = Field(None, max_length=15, description="Vehicle number")
    is_cancelled: bool = Field(False, description="Set true to soft-delete this item")


class TicketItemRead(BaseModel):
    id: int = Field(..., description="Unique ticket item identifier")
    ticket_id: int = Field(..., description="Parent ticket ID")
    item_id: int = Field(..., description="Item ID")
    rate: float = Field(..., description="Rate")
    levy: float = Field(..., description="Levy")
    quantity: int = Field(..., description="Quantity")
    vehicle_no: str | None = Field(None, description="Vehicle number")
    is_cancelled: bool = Field(..., description="Whether this item is cancelled")
    amount: float = Field(..., description="Computed: rate * (quantity + levy)")
    item_name: str | None = Field(None, description="Item name for display")

    model_config = {"from_attributes": True}


# ── Ticket schemas ──

class TicketCreate(BaseModel):
    branch_id: int = Field(..., description="Branch ID")
    ticket_date: date = Field(..., description="Ticket date")
    departure: str | None = Field(None, description="Departure time HH:MM")
    route_id: int = Field(..., description="Route ID")
    payment_mode_id: int = Field(..., description="Payment mode ID")
    discount: float | None = Field(0, ge=0, description="Discount amount")
    amount: float = Field(..., ge=0, description="Total amount (sum of item amounts)")
    net_amount: float = Field(..., ge=0, description="Net amount (amount - discount)")
    items: list[TicketItemCreate] = Field(..., min_length=1, description="Ticket items (at least 1)")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "branch_id": 1,
                    "ticket_date": "2026-02-19",
                    "departure": "09:30",
                    "route_id": 1,
                    "payment_mode_id": 1,
                    "discount": 0,
                    "amount": 320.00,
                    "net_amount": 320.00,
                    "items": [
                        {"item_id": 1, "rate": 150.00, "levy": 10.00, "quantity": 2, "vehicle_no": None}
                    ],
                }
            ]
        }
    }


class TicketUpdate(BaseModel):
    departure: str | None = Field(None, description="Updated departure time HH:MM")
    route_id: int | None = Field(None, description="Updated route ID")
    payment_mode_id: int | None = Field(None, description="Updated payment mode ID")
    discount: float | None = Field(None, ge=0, description="Updated discount")
    amount: float | None = Field(None, ge=0, description="Updated total amount")
    net_amount: float | None = Field(None, ge=0, description="Updated net amount")
    is_cancelled: bool | None = Field(None, description="Set true to cancel the ticket")
    items: list[TicketItemUpdate] | None = Field(None, description="Updated ticket items")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {"discount": 50.00, "amount": 320.00, "net_amount": 270.00, "is_cancelled": False}
            ]
        }
    }


class TicketRead(BaseModel):
    id: int = Field(..., description="Unique ticket identifier")
    branch_id: int = Field(..., description="Branch ID")
    ticket_no: int = Field(..., description="Ticket number (unique per branch)")
    ticket_date: date = Field(..., description="Ticket date")
    departure: str | None = Field(None, description="Departure time")
    route_id: int = Field(..., description="Route ID")
    amount: float = Field(..., description="Total amount")
    discount: float | None = Field(None, description="Discount")
    payment_mode_id: int = Field(..., description="Payment mode ID")
    is_cancelled: bool = Field(..., description="Whether ticket is cancelled")
    net_amount: float = Field(..., description="Net amount")
    # Enriched display fields
    branch_name: str | None = Field(None, description="Branch name")
    route_name: str | None = Field(None, description="Route display name")
    payment_mode_name: str | None = Field(None, description="Payment mode description")
    items: list[TicketItemRead] | None = Field(None, description="Ticket items (only in detail view)")

    model_config = {"from_attributes": True}


# ── Rate lookup response ──

class RateLookupResponse(BaseModel):
    rate: float = Field(..., description="Current rate for the item")
    levy: float = Field(..., description="Current levy for the item")
    item_rate_id: int = Field(..., description="Item rate record ID")
```

**Step 2: Verify schema imports**

```bash
cd backend && python -c "from app.schemas.ticket import TicketCreate, TicketRead, TicketItemRead; print('OK')"
```

Expected: `OK`

**Step 3: Commit**

```bash
git add backend/app/schemas/ticket.py
git commit -m "feat(backend): add Pydantic schemas for tickets and ticket items"
```

---

## Task 4: Create Ticket Service

**Files:**
- Create: `backend/app/services/ticket_service.py`

**Step 1: Create the service file**

Create `backend/app/services/ticket_service.py`:

```python
import datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, text

from app.models.ticket import Ticket, TicketItem
from app.models.branch import Branch
from app.models.route import Route
from app.models.item import Item
from app.models.item_rate import ItemRate
from app.models.payment_mode import PaymentMode
from app.models.ferry_schedule import FerrySchedule
from app.schemas.ticket import TicketCreate, TicketUpdate


def _round2(value: float) -> float:
    """Round to 2 decimal places."""
    return float(Decimal(str(value)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _format_time(t: datetime.time | None) -> str | None:
    if t is None:
        return None
    return t.strftime("%H:%M")


def _parse_time(s: str) -> datetime.time:
    try:
        return datetime.datetime.strptime(s, "%H:%M").time()
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid time format: '{s}'. Expected HH:MM",
        )


# ── Enrichment helpers ──

async def _get_branch_name(db: AsyncSession, branch_id: int) -> str | None:
    result = await db.execute(select(Branch.name).where(Branch.id == branch_id))
    return result.scalar_one_or_none()


async def _get_route_display_name(db: AsyncSession, route_id: int) -> str | None:
    BranchOne = Branch.__table__.alias("b1")
    BranchTwo = Branch.__table__.alias("b2")
    result = await db.execute(
        select(
            BranchOne.c.name.label("branch_one_name"),
            BranchTwo.c.name.label("branch_two_name"),
        )
        .select_from(Route.__table__)
        .join(BranchOne, BranchOne.c.id == Route.branch_id_one)
        .join(BranchTwo, BranchTwo.c.id == Route.branch_id_two)
        .where(Route.id == route_id)
    )
    row = result.one_or_none()
    if not row:
        return None
    return f"{row.branch_one_name} - {row.branch_two_name}"


async def _get_payment_mode_name(db: AsyncSession, pm_id: int) -> str | None:
    result = await db.execute(select(PaymentMode.description).where(PaymentMode.id == pm_id))
    return result.scalar_one_or_none()


async def _get_item_name(db: AsyncSession, item_id: int) -> str | None:
    result = await db.execute(select(Item.name).where(Item.id == item_id))
    return result.scalar_one_or_none()


async def _enrich_ticket_item(db: AsyncSession, ti: TicketItem) -> dict:
    item_name = await _get_item_name(db, ti.item_id)
    rate = float(ti.rate) if ti.rate is not None else 0
    levy = float(ti.levy) if ti.levy is not None else 0
    quantity = ti.quantity or 0
    amount = _round2(rate * (quantity + levy))
    return {
        "id": ti.id,
        "ticket_id": ti.ticket_id,
        "item_id": ti.item_id,
        "rate": rate,
        "levy": levy,
        "quantity": quantity,
        "vehicle_no": ti.vehicle_no,
        "is_cancelled": ti.is_cancelled,
        "amount": amount,
        "item_name": item_name,
    }


async def _enrich_ticket(db: AsyncSession, ticket: Ticket, include_items: bool = False) -> dict:
    branch_name = await _get_branch_name(db, ticket.branch_id)
    route_name = await _get_route_display_name(db, ticket.route_id)
    pm_name = await _get_payment_mode_name(db, ticket.payment_mode_id)

    data = {
        "id": ticket.id,
        "branch_id": ticket.branch_id,
        "ticket_no": ticket.ticket_no,
        "ticket_date": ticket.ticket_date,
        "departure": _format_time(ticket.departure),
        "route_id": ticket.route_id,
        "amount": float(ticket.amount) if ticket.amount is not None else 0,
        "discount": float(ticket.discount) if ticket.discount is not None else 0,
        "payment_mode_id": ticket.payment_mode_id,
        "is_cancelled": ticket.is_cancelled,
        "net_amount": float(ticket.net_amount) if ticket.net_amount is not None else 0,
        "branch_name": branch_name,
        "route_name": route_name,
        "payment_mode_name": pm_name,
    }

    if include_items:
        result = await db.execute(
            select(TicketItem).where(TicketItem.ticket_id == ticket.id)
        )
        items = result.scalars().all()
        data["items"] = [await _enrich_ticket_item(db, ti) for ti in items]
    else:
        data["items"] = None

    return data


# ── Validation helpers ──

async def _validate_references(db: AsyncSession, branch_id: int, route_id: int, payment_mode_id: int):
    result = await db.execute(select(Branch.id).where(Branch.id == branch_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Branch ID {branch_id} not found")

    result = await db.execute(select(Route.id).where(Route.id == route_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Route ID {route_id} not found")

    result = await db.execute(select(PaymentMode.id).where(PaymentMode.id == payment_mode_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Payment Mode ID {payment_mode_id} not found")


async def _validate_items(db: AsyncSession, items: list) -> None:
    for item in items:
        result = await db.execute(select(Item.id).where(Item.id == item.item_id))
        if not result.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Item ID {item.item_id} not found",
            )


def _compute_amounts(items: list, discount: float | None) -> tuple[float, float]:
    """Compute total amount and net_amount from items list.
    Each item dict/object must have rate, quantity, levy, is_cancelled."""
    total = 0.0
    for item in items:
        cancelled = getattr(item, "is_cancelled", False) if hasattr(item, "is_cancelled") else item.get("is_cancelled", False)
        if cancelled:
            continue
        rate = float(getattr(item, "rate", 0) if hasattr(item, "rate") else item.get("rate", 0))
        quantity = int(getattr(item, "quantity", 0) if hasattr(item, "quantity") else item.get("quantity", 0))
        levy = float(getattr(item, "levy", 0) if hasattr(item, "levy") else item.get("levy", 0))
        total += rate * (quantity + levy)
    amount = _round2(total)
    disc = float(discount) if discount else 0
    net_amount = _round2(amount - disc)
    return amount, net_amount


def _cross_check_amounts(computed_amount: float, computed_net: float, submitted_amount: float, submitted_net: float):
    """Cross-check frontend-submitted amounts against backend computation."""
    if abs(computed_amount - submitted_amount) > 0.01:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Amount mismatch: expected {computed_amount}, got {submitted_amount}",
        )
    if abs(computed_net - submitted_net) > 0.01:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Net amount mismatch: expected {computed_net}, got {submitted_net}",
        )


# ── Rate lookup ──

async def get_current_rate(db: AsyncSession, item_id: int, route_id: int) -> dict:
    """Find the latest item_rate where applicable_from_date <= today for given item_id + route_id."""
    today = datetime.date.today()
    result = await db.execute(
        select(ItemRate)
        .where(
            ItemRate.item_id == item_id,
            ItemRate.route_id == route_id,
            ItemRate.is_active == True,
            ItemRate.applicable_from_date.is_not(None),
            ItemRate.applicable_from_date <= today,
        )
        .order_by(ItemRate.applicable_from_date.desc())
        .limit(1)
    )
    ir = result.scalar_one_or_none()
    if not ir:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active rate found for item {item_id} and route {route_id}",
        )
    return {
        "rate": float(ir.rate) if ir.rate is not None else 0,
        "levy": float(ir.levy) if ir.levy is not None else 0,
        "item_rate_id": ir.id,
    }


# ── Departure options ──

async def get_departure_options(db: AsyncSession, branch_id: int) -> list[dict]:
    """Get ferry schedules for a branch with departure >= current time, sorted ascending."""
    now = datetime.datetime.now().time()
    result = await db.execute(
        select(FerrySchedule)
        .where(
            FerrySchedule.branch_id == branch_id,
            FerrySchedule.departure >= now,
        )
        .order_by(FerrySchedule.departure.asc())
    )
    schedules = result.scalars().all()
    return [
        {"id": s.id, "departure": _format_time(s.departure)}
        for s in schedules
    ]


# ── Filters ──

def _apply_filters(
    query,
    status_filter: str | None = None,
    branch_filter: int | None = None,
    route_filter: int | None = None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
    ticket_no_filter: int | None = None,
):
    if id_filter is not None:
        if id_op == "between" and id_filter_end is not None:
            query = query.where(Ticket.id >= id_filter, Ticket.id <= id_filter_end)
        elif id_op == "lt":
            query = query.where(Ticket.id < id_filter)
        elif id_op == "gt":
            query = query.where(Ticket.id > id_filter)
        else:
            query = query.where(Ticket.id == id_filter)

    if branch_filter is not None:
        query = query.where(Ticket.branch_id == branch_filter)

    if route_filter is not None:
        query = query.where(Ticket.route_id == route_filter)

    if ticket_no_filter is not None:
        query = query.where(Ticket.ticket_no == ticket_no_filter)

    if date_from is not None:
        query = query.where(Ticket.ticket_date >= date_from)

    if date_to is not None:
        query = query.where(Ticket.ticket_date <= date_to)

    if status_filter == "active":
        query = query.where(Ticket.is_cancelled == False)
    elif status_filter == "cancelled":
        query = query.where(Ticket.is_cancelled == True)

    return query


# ── Count ──

async def count_tickets(
    db: AsyncSession,
    status_filter: str | None = None,
    branch_filter: int | None = None,
    route_filter: int | None = None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
    ticket_no_filter: int | None = None,
) -> int:
    query = select(func.count()).select_from(Ticket)
    query = _apply_filters(query, status_filter, branch_filter, route_filter, date_from, date_to, id_filter, id_op, id_filter_end, ticket_no_filter)
    result = await db.execute(query)
    return result.scalar()


# ── List ──

SORTABLE_COLUMNS = {
    "id": Ticket.id,
    "ticket_no": Ticket.ticket_no,
    "ticket_date": Ticket.ticket_date,
    "branch_id": Ticket.branch_id,
    "route_id": Ticket.route_id,
    "amount": Ticket.amount,
    "net_amount": Ticket.net_amount,
    "is_cancelled": Ticket.is_cancelled,
}


async def get_all_tickets(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
    sort_by: str = "id",
    sort_order: str = "desc",
    status_filter: str | None = None,
    branch_filter: int | None = None,
    route_filter: int | None = None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
    ticket_no_filter: int | None = None,
) -> list[dict]:
    column = SORTABLE_COLUMNS.get(sort_by, Ticket.id)
    order = column.desc() if sort_order == "desc" else column.asc()

    query = select(Ticket)
    query = _apply_filters(query, status_filter, branch_filter, route_filter, date_from, date_to, id_filter, id_op, id_filter_end, ticket_no_filter)
    result = await db.execute(query.order_by(order).offset(skip).limit(limit))
    tickets = result.scalars().all()

    return [await _enrich_ticket(db, t, include_items=False) for t in tickets]


# ── Get by ID ──

async def get_ticket_by_id(db: AsyncSession, ticket_id: int) -> dict:
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")
    return await _enrich_ticket(db, ticket, include_items=True)


# ── Create ──

async def create_ticket(db: AsyncSession, data: TicketCreate) -> dict:
    # Validate references
    await _validate_references(db, data.branch_id, data.route_id, data.payment_mode_id)
    await _validate_items(db, data.items)

    # Cross-check amounts
    computed_amount, computed_net = _compute_amounts(data.items, data.discount)
    _cross_check_amounts(computed_amount, computed_net, data.amount, data.net_amount)

    # Lock the branch row and generate ticket_no
    result = await db.execute(
        select(Branch).where(Branch.id == data.branch_id).with_for_update()
    )
    branch = result.scalar_one()
    next_ticket_no = (branch.last_ticket_no or 0) + 1

    # Get next ticket ID
    id_result = await db.execute(select(func.coalesce(func.max(Ticket.id), 0)))
    next_ticket_id = id_result.scalar() + 1

    # Parse departure time
    departure_time = _parse_time(data.departure) if data.departure else None

    # Create ticket
    ticket = Ticket(
        id=next_ticket_id,
        branch_id=data.branch_id,
        ticket_no=next_ticket_no,
        ticket_date=data.ticket_date,
        departure=departure_time,
        route_id=data.route_id,
        amount=computed_amount,
        discount=float(data.discount) if data.discount else 0,
        payment_mode_id=data.payment_mode_id,
        is_cancelled=False,
        net_amount=computed_net,
    )
    db.add(ticket)

    # Create ticket items
    item_id_result = await db.execute(select(func.coalesce(func.max(TicketItem.id), 0)))
    next_item_id = item_id_result.scalar() + 1

    for item_data in data.items:
        ti = TicketItem(
            id=next_item_id,
            ticket_id=next_ticket_id,
            item_id=item_data.item_id,
            rate=item_data.rate,
            levy=item_data.levy,
            quantity=item_data.quantity,
            vehicle_no=item_data.vehicle_no,
            is_cancelled=False,
        )
        db.add(ti)
        next_item_id += 1

    # Update branch last_ticket_no
    branch.last_ticket_no = next_ticket_no

    await db.flush()
    return await _enrich_ticket(db, ticket, include_items=True)


# ── Update ──

async def update_ticket(db: AsyncSession, ticket_id: int, data: TicketUpdate) -> dict:
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ticket not found")

    if ticket.is_cancelled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot update a cancelled ticket")

    update_data = data.model_dump(exclude_unset=True)

    # Handle cancellation
    if update_data.get("is_cancelled") is True:
        ticket.is_cancelled = True
        # Cancel all items too
        items_result = await db.execute(
            select(TicketItem).where(TicketItem.ticket_id == ticket_id)
        )
        for ti in items_result.scalars().all():
            ti.is_cancelled = True
        await db.flush()
        return await _enrich_ticket(db, ticket, include_items=True)

    # Validate route if changed
    if "route_id" in update_data:
        r = await db.execute(select(Route.id).where(Route.id == update_data["route_id"]))
        if not r.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Route ID {update_data['route_id']} not found")

    # Validate payment mode if changed
    if "payment_mode_id" in update_data:
        r = await db.execute(select(PaymentMode.id).where(PaymentMode.id == update_data["payment_mode_id"]))
        if not r.scalar_one_or_none():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Payment Mode ID {update_data['payment_mode_id']} not found")

    # Update departure
    if "departure" in update_data and update_data["departure"] is not None:
        ticket.departure = _parse_time(update_data["departure"])
    elif "departure" in update_data:
        ticket.departure = None

    # Update simple fields
    for field in ("route_id", "payment_mode_id", "discount"):
        if field in update_data:
            setattr(ticket, field, update_data[field])

    # Update items if provided
    if "items" in update_data and data.items is not None:
        await _validate_items(db, [i for i in data.items if not i.is_cancelled])

        # Get current items
        existing_result = await db.execute(
            select(TicketItem).where(TicketItem.ticket_id == ticket_id)
        )
        existing_items = {ti.id: ti for ti in existing_result.scalars().all()}

        # Get next item ID for new items
        item_id_result = await db.execute(select(func.coalesce(func.max(TicketItem.id), 0)))
        next_item_id = item_id_result.scalar() + 1

        for item_update in data.items:
            if item_update.id and item_update.id in existing_items:
                # Update existing item
                ti = existing_items[item_update.id]
                ti.item_id = item_update.item_id
                ti.rate = item_update.rate
                ti.levy = item_update.levy
                ti.quantity = item_update.quantity
                ti.vehicle_no = item_update.vehicle_no
                ti.is_cancelled = item_update.is_cancelled
            else:
                # Create new item
                ti = TicketItem(
                    id=next_item_id,
                    ticket_id=ticket_id,
                    item_id=item_update.item_id,
                    rate=item_update.rate,
                    levy=item_update.levy,
                    quantity=item_update.quantity,
                    vehicle_no=item_update.vehicle_no,
                    is_cancelled=item_update.is_cancelled,
                )
                db.add(ti)
                next_item_id += 1

        # Cross-check amounts
        computed_amount, computed_net = _compute_amounts(
            data.items, update_data.get("discount", ticket.discount)
        )
        if "amount" in update_data and "net_amount" in update_data:
            _cross_check_amounts(computed_amount, computed_net, update_data["amount"], update_data["net_amount"])
        ticket.amount = computed_amount
        ticket.net_amount = computed_net
    elif "discount" in update_data:
        # Recompute net_amount if only discount changed
        current_amount = float(ticket.amount)
        new_discount = float(update_data["discount"]) if update_data["discount"] else 0
        ticket.net_amount = _round2(current_amount - new_discount)
        if "net_amount" in update_data:
            _cross_check_amounts(current_amount, ticket.net_amount, update_data.get("amount", current_amount), update_data["net_amount"])

    await db.flush()
    return await _enrich_ticket(db, ticket, include_items=True)
```

**Step 2: Verify imports**

```bash
cd backend && python -c "from app.services import ticket_service; print('OK')"
```

Expected: `OK`

**Step 3: Commit**

```bash
git add backend/app/services/ticket_service.py
git commit -m "feat(backend): add ticket service with CRUD, rate lookup, and ticket_no generation"
```

---

## Task 5: Create Ticket Router

**Files:**
- Create: `backend/app/routers/tickets.py`

**Step 1: Create the router file**

Create `backend/app/routers/tickets.py`:

```python
from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.schemas.ticket import TicketCreate, TicketRead, TicketUpdate, RateLookupResponse
from app.services import ticket_service

router = APIRouter(prefix="/api/tickets", tags=["Tickets"])

# Ticketing is accessible to SUPER_ADMIN, ADMIN, MANAGER, BILLING_OPERATOR
_ticket_roles = require_roles(
    UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER, UserRole.BILLING_OPERATOR
)


@router.get(
    "/",
    response_model=list[TicketRead],
    summary="List all tickets",
    description="Paginated list of tickets. Requires **Super Admin**, **Admin**, **Manager**, or **Billing Operator** role.",
    responses={
        200: {"description": "List of tickets returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def list_tickets(
    skip: int = Query(0, ge=0, description="Number of records to skip"),
    limit: int = Query(5, ge=1, le=200, description="Maximum number of records to return"),
    sort_by: str = Query("id", description="Column to sort by (id, ticket_no, ticket_date, branch_id, route_id, amount, net_amount, is_cancelled)"),
    sort_order: str = Query("desc", description="Sort direction (asc or desc)"),
    status: str | None = Query(None, description="Filter by status: active, cancelled, or all (default all)"),
    branch_filter: int | None = Query(None, description="Filter by branch ID"),
    route_filter: int | None = Query(None, description="Filter by route ID"),
    date_from: date | None = Query(None, description="Filter tickets from this date"),
    date_to: date | None = Query(None, description="Filter tickets to this date"),
    id_filter: int | None = Query(None, ge=1, description="Filter by ticket ID"),
    id_op: str = Query("eq", description="ID comparison operator: eq, lt, gt, or between"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    ticket_no_filter: int | None = Query(None, description="Filter by ticket number"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_ticket_roles),
):
    return await ticket_service.get_all_tickets(
        db, skip, limit, sort_by, sort_order,
        status, branch_filter, route_filter, date_from, date_to,
        id_filter, id_op, id_filter_end, ticket_no_filter,
    )


@router.get(
    "/count",
    response_model=int,
    summary="Get total ticket count",
    description="Returns the total number of tickets matching filters.",
    responses={
        200: {"description": "Total count returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def count_tickets(
    status: str | None = Query(None, description="Filter by status: active, cancelled, or all"),
    branch_filter: int | None = Query(None, description="Filter by branch ID"),
    route_filter: int | None = Query(None, description="Filter by route ID"),
    date_from: date | None = Query(None, description="Filter tickets from this date"),
    date_to: date | None = Query(None, description="Filter tickets to this date"),
    id_filter: int | None = Query(None, ge=1, description="Filter by ticket ID"),
    id_op: str = Query("eq", description="ID comparison operator"),
    id_filter_end: int | None = Query(None, ge=1, description="Range end for between operator"),
    ticket_no_filter: int | None = Query(None, description="Filter by ticket number"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_ticket_roles),
):
    return await ticket_service.count_tickets(
        db, status, branch_filter, route_filter, date_from, date_to,
        id_filter, id_op, id_filter_end, ticket_no_filter,
    )


@router.get(
    "/rate-lookup",
    response_model=RateLookupResponse,
    summary="Look up current rate for an item + route",
    description="Returns the latest applicable rate and levy for the given item and route.",
    responses={
        200: {"description": "Rate and levy returned"},
        404: {"description": "No active rate found"},
    },
)
async def rate_lookup(
    item_id: int = Query(..., description="Item ID"),
    route_id: int = Query(..., description="Route ID"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_ticket_roles),
):
    return await ticket_service.get_current_rate(db, item_id, route_id)


@router.get(
    "/departure-options",
    summary="Get departure times for a branch",
    description="Returns ferry schedules for the given branch with departure >= current time.",
    responses={
        200: {"description": "List of departure options"},
    },
)
async def departure_options(
    branch_id: int = Query(..., description="Branch ID"),
    db: AsyncSession = Depends(get_db),
    _=Depends(_ticket_roles),
):
    return await ticket_service.get_departure_options(db, branch_id)


@router.post(
    "/",
    response_model=TicketRead,
    status_code=201,
    summary="Create a new ticket",
    description="Create a ticket with items. Ticket number is auto-generated per branch. Requires **Super Admin**, **Admin**, **Manager**, or **Billing Operator** role.",
    responses={
        201: {"description": "Ticket created successfully"},
        400: {"description": "Amount mismatch or validation error"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Referenced entity not found"},
    },
)
async def create_ticket(
    body: TicketCreate,
    db: AsyncSession = Depends(get_db),
    _=Depends(_ticket_roles),
):
    return await ticket_service.create_ticket(db, body)


@router.get(
    "/{ticket_id}",
    response_model=TicketRead,
    summary="Get ticket by ID",
    description="Fetch a single ticket with its items by ID.",
    responses={
        200: {"description": "Ticket details with items returned"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Ticket not found"},
    },
)
async def get_ticket(
    ticket_id: int,
    db: AsyncSession = Depends(get_db),
    _=Depends(_ticket_roles),
):
    return await ticket_service.get_ticket_by_id(db, ticket_id)


@router.patch(
    "/{ticket_id}",
    response_model=TicketRead,
    summary="Update ticket",
    description="Update a ticket and its items. Set `is_cancelled=true` to cancel. Items can be added, updated, or cancelled.",
    responses={
        200: {"description": "Ticket updated successfully"},
        400: {"description": "Amount mismatch, validation error, or ticket already cancelled"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Ticket or referenced entity not found"},
    },
)
async def update_ticket(
    ticket_id: int,
    body: TicketUpdate,
    db: AsyncSession = Depends(get_db),
    _=Depends(_ticket_roles),
):
    return await ticket_service.update_ticket(db, ticket_id, body)
```

**Step 2: Verify imports**

```bash
cd backend && python -c "from app.routers.tickets import router; print(router.prefix)"
```

Expected: `/api/tickets`

**Step 3: Commit**

```bash
git add backend/app/routers/tickets.py
git commit -m "feat(backend): add ticket router with CRUD, rate lookup, and departure options"
```

---

## Task 6: Wire Router into main.py

**Files:**
- Modify: `backend/app/main.py:5` (add import)
- Modify: `backend/app/main.py:92` (add include_router)
- Modify: `backend/app/main.py:25-66` (add openapi tag)

**Step 1: Add import**

In `backend/app/main.py`, change line 5 from:

```python
from app.routers import auth, users, boats, branches, routes, items, item_rates, ferry_schedules, payment_modes
```

to:

```python
from app.routers import auth, users, boats, branches, routes, items, item_rates, ferry_schedules, payment_modes, tickets
```

**Step 2: Add openapi tag**

Add after the `"Payment Modes"` tag dict (after line 65, before the closing `]`):

```python
        {
            "name": "Tickets",
            "description": "Ticket management — requires **Super Admin**, **Admin**, **Manager**, or **Billing Operator** role.",
        },
```

**Step 3: Add router inclusion**

Add after line 92 (`app.include_router(payment_modes.router)`):

```python
app.include_router(tickets.router)
```

**Step 4: Verify app starts**

```bash
cd backend && python -c "from app.main import app; print([r.path for r in app.routes if '/tickets' in getattr(r, 'path', '')])"
```

Expected: List of ticket routes

**Step 5: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(backend): wire tickets router into FastAPI app"
```

---

## Task 7: Add Frontend TypeScript Types

**Files:**
- Modify: `frontend/src/types/index.ts` (append ticket types at end)

**Step 1: Append types**

Add the following at the end of `frontend/src/types/index.ts`:

```typescript

// ── Ticket types ──

export interface TicketItem {
  id: number;
  ticket_id: number;
  item_id: number;
  rate: number;
  levy: number;
  quantity: number;
  vehicle_no: string | null;
  is_cancelled: boolean;
  amount: number;
  item_name: string | null;
}

export interface TicketItemCreate {
  item_id: number;
  rate: number;
  levy: number;
  quantity: number;
  vehicle_no?: string | null;
}

export interface TicketItemUpdate {
  id?: number | null;
  item_id: number;
  rate: number;
  levy: number;
  quantity: number;
  vehicle_no?: string | null;
  is_cancelled: boolean;
}

export interface Ticket {
  id: number;
  branch_id: number;
  ticket_no: number;
  ticket_date: string;
  departure: string | null;
  route_id: number;
  amount: number;
  discount: number | null;
  payment_mode_id: number;
  is_cancelled: boolean;
  net_amount: number;
  branch_name: string | null;
  route_name: string | null;
  payment_mode_name: string | null;
  items: TicketItem[] | null;
}

export interface TicketCreate {
  branch_id: number;
  ticket_date: string;
  departure?: string | null;
  route_id: number;
  payment_mode_id: number;
  discount?: number;
  amount: number;
  net_amount: number;
  items: TicketItemCreate[];
}

export interface TicketUpdate {
  departure?: string | null;
  route_id?: number;
  payment_mode_id?: number;
  discount?: number;
  amount?: number;
  net_amount?: number;
  is_cancelled?: boolean;
  items?: TicketItemUpdate[];
}

export interface RateLookupResponse {
  rate: number;
  levy: number;
  item_rate_id: number;
}

export interface DepartureOption {
  id: number;
  departure: string;
}
```

**Step 2: Verify build**

```bash
cd frontend && npx tsc --noEmit 2>&1 | head -5
```

Expected: No errors related to ticket types

**Step 3: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat(frontend): add TypeScript types for tickets and ticket items"
```

---

## Task 8: Update Sidebar Route Mapping

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx:20`

**Step 1: Verify Sidebar mapping**

The Sidebar already maps `Ticketing` to `/dashboard/ticketing` on line 20. This is correct — the ticketing page will live at `frontend/src/app/dashboard/ticketing/page.tsx`.

No changes needed. The mapping already exists:
```typescript
Ticketing: "/dashboard/ticketing",
```

---

## Task 9: Create Tickets Frontend Page

**Files:**
- Create: `frontend/src/app/dashboard/ticketing/page.tsx`

**Step 1: Create the page file**

This is a large file. Create `frontend/src/app/dashboard/ticketing/page.tsx` following the exact same patterns as `items/page.tsx` but with master-detail popup form.

Key differences from simple CRUD pages:
1. **Listing table** shows ticket-level columns only (no items)
2. **Modal is wider** (`max-w-4xl`) to accommodate the detail grid
3. **Modal has two sections**: Master fields (top) and Items grid (bottom)
4. **Items grid** has Add/Edit/Cancel buttons per row
5. **Rate auto-fetch**: When item is selected in the grid, call `/api/tickets/rate-lookup`
6. **Departure dropdown**: Populated from `/api/tickets/departure-options?branch_id=X`
7. **Live computation**: amount and net_amount computed on every item/discount change
8. **Read-only fields**: ticket_no, rate (in items), item amount, ticket amount, ticket net_amount

The page should:
- Fetch branches, routes, payment modes, and items on mount for dropdowns
- Filter routes by selected branch (routes where branch_id_one or branch_id_two matches)
- Fetch departure options when branch changes
- Fetch rate/levy when item + route are selected in the detail grid
- Compute item amount = rate * (quantity + levy) on every change
- Compute ticket amount = sum of active item amounts
- Compute ticket net_amount = amount - discount
- Support Add/Edit ticket with full master-detail save
- Support Cancel ticket (is_cancelled = true)
- Show View modal with items detail

The complete file content follows the exact same structure as the Items page (auth check, Navbar, Sidebar, filters, table, pagination, modals) with the additions above.

Filters for the ticket list:
- ID filter (eq/lt/gt/between)
- Ticket No filter
- Branch dropdown filter
- Route dropdown filter
- Date range (from/to)
- Status (All/Active/Cancelled)

Table columns:
- ID, Ticket No, Branch, Route, Date, Departure, Amount, Discount, Net Amount, Payment Mode, Status, Actions (View/Edit)

**Step 2: Verify page renders**

```bash
cd frontend && npm run dev
```

Navigate to `/dashboard/ticketing` — page should load with empty table.

**Step 3: Verify build**

```bash
cd frontend && npm run build
```

Expected: Build succeeds

**Step 4: Commit**

```bash
git add frontend/src/app/dashboard/ticketing/page.tsx
git commit -m "feat(frontend): add tickets CRUD page with master-detail popup form"
```

---

## Summary

| Task | Component | Description |
|------|-----------|-------------|
| 1 | Backend Model | Add `last_ticket_no` to Branch |
| 2 | Backend Model | Create Ticket + TicketItem models |
| 3 | Backend Schema | Create Pydantic schemas for tickets |
| 4 | Backend Service | CRUD, rate lookup, ticket_no generation, amount cross-check |
| 5 | Backend Router | REST endpoints for tickets |
| 6 | Backend Main | Wire router into FastAPI app |
| 7 | Frontend Types | TypeScript interfaces for tickets |
| 8 | Frontend Sidebar | Verify route mapping (already done) |
| 9 | Frontend Page | Full ticketing page with master-detail form |
