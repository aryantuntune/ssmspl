# Customer Portal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the customer portal with booking creation, history, QR codes, email confirmations, and capacity enforcement.

**Architecture:** Backend mirrors the existing ticket_service pattern (routers → services → models). Two new routers: `booking.py` (public data lookup) and `portal_bookings.py` (authenticated booking CRUD). Frontend pages redesigned to match clean API contracts.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, Pydantic v2, qrcode[pil], aiosmtplib, Next.js 16, React 19, TypeScript, Tailwind CSS v4.

---

## Pre-requisite: Database Schema Changes

The user will run these SQL statements manually. The ORM models will be updated in Task 1.

```sql
-- Add status and verification_code to bookings
ALTER TABLE bookings ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'CONFIRMED';
ALTER TABLE bookings ADD COLUMN verification_code UUID DEFAULT uuid_generate_v4();

-- Add capacity to ferry_schedules
ALTER TABLE ferry_schedules ADD COLUMN capacity INTEGER NOT NULL DEFAULT 0;
```

---

### Task 1: Update ORM Models (Booking + FerrySchedule)

**Files:**
- Modify: `backend/app/models/booking.py`
- Modify: `backend/app/models/ferry_schedule.py`

**Step 1: Add `status` and `verification_code` to Booking model**

In `backend/app/models/booking.py`, add imports and two new columns:

```python
import uuid as uuid_mod

from sqlalchemy import BigInteger, Boolean, Date, ForeignKey, Integer, Numeric, String, Time
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import AuditMixin


class Booking(AuditMixin, Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    branch_id: Mapped[int] = mapped_column(Integer, ForeignKey("branches.id"), nullable=False)
    booking_no: Mapped[int] = mapped_column(BigInteger, nullable=False)
    travel_date: Mapped[object] = mapped_column(Date, nullable=False)
    departure: Mapped[object | None] = mapped_column(Time, nullable=True)
    amount: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    discount: Mapped[float | None] = mapped_column(Numeric(9, 2), nullable=True)
    payment_mode_id: Mapped[int] = mapped_column(Integer, ForeignKey("payment_modes.id"), nullable=False)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    net_amount: Mapped[float] = mapped_column(Numeric(9, 2), nullable=False)
    route_id: Mapped[int] = mapped_column(Integer, ForeignKey("routes.id"), nullable=False)
    portal_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("portal_users.id"), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="CONFIRMED", nullable=False)
    verification_code: Mapped[uuid_mod.UUID | None] = mapped_column(
        UUID(as_uuid=True), default=uuid_mod.uuid4, nullable=True
    )

    def __repr__(self) -> str:
        return f"<Booking id={self.id} booking_no={self.booking_no} branch_id={self.branch_id}>"
```

Key changes from existing:
- `portal_user_id` changed from `nullable=True` to `nullable=False` (portal bookings always have a user)
- Added `status` column (String(20), default "CONFIRMED")
- Added `verification_code` column (UUID, auto-generated)

**Step 2: Add `capacity` to FerrySchedule model**

In `backend/app/models/ferry_schedule.py`:

```python
from sqlalchemy import ForeignKey, Integer, Time
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.mixins import AuditMixin


class FerrySchedule(AuditMixin, Base):
    __tablename__ = "ferry_schedules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    branch_id: Mapped[int] = mapped_column(Integer, ForeignKey("branches.id"), nullable=False)
    departure: Mapped[object] = mapped_column(Time, nullable=False)
    capacity: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    def __repr__(self) -> str:
        return f"<FerrySchedule id={self.id} branch_id={self.branch_id} departure={self.departure}>"
```

**Step 3: Commit**

```bash
git add backend/app/models/booking.py backend/app/models/ferry_schedule.py
git commit -m "feat(models): add status, verification_code to Booking and capacity to FerrySchedule"
```

---

### Task 2: Add Python Dependencies

**Files:**
- Modify: `backend/requirements.txt`

**Step 1: Add qrcode and aiosmtplib**

Append to `backend/requirements.txt`:

```
qrcode[pil]==8.0
aiosmtplib==3.0.2
```

**Step 2: Install**

Run: `cd backend && pip install qrcode[pil]==8.0 aiosmtplib==3.0.2`

**Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "feat(deps): add qrcode and aiosmtplib for portal bookings"
```

---

### Task 3: Update Booking Schemas

**Files:**
- Modify: `backend/app/schemas/booking.py`

**Step 1: Rewrite booking schemas with create, list, and detail shapes**

Replace entire `backend/app/schemas/booking.py`:

```python
from datetime import date, datetime, time

from pydantic import BaseModel, Field


# ── Create schemas ──

class BookingItemCreate(BaseModel):
    item_id: int = Field(..., description="Item ID")
    quantity: int = Field(..., ge=1, description="Quantity")
    vehicle_no: str | None = Field(None, max_length=15, description="Vehicle number (optional)")

    model_config = {
        "json_schema_extra": {
            "examples": [{"item_id": 1, "quantity": 2, "vehicle_no": None}]
        }
    }


class BookingCreate(BaseModel):
    from_branch_id: int = Field(..., description="Departure branch ID")
    to_branch_id: int = Field(..., description="Destination branch ID")
    travel_date: date = Field(..., description="Travel date (must be today or future)")
    departure: str = Field(..., description="Departure time HH:MM")
    items: list[BookingItemCreate] = Field(..., min_length=1, description="Booking items (at least 1)")

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "from_branch_id": 1,
                    "to_branch_id": 2,
                    "travel_date": "2026-02-21",
                    "departure": "09:30",
                    "items": [{"item_id": 1, "quantity": 2, "vehicle_no": None}],
                }
            ]
        }
    }


# ── Read schemas (enriched responses) ──

class BookingItemRead(BaseModel):
    id: int
    booking_id: int
    item_id: int
    item_name: str | None = None
    rate: float
    levy: float
    quantity: int
    vehicle_no: str | None = None
    is_cancelled: bool
    amount: float = Field(..., description="Computed: quantity * (rate + levy)")


class BookingRead(BaseModel):
    id: int
    booking_no: int
    status: str
    verification_code: str | None = None
    branch_id: int
    branch_name: str | None = None
    route_id: int
    route_name: str | None = None
    travel_date: date
    departure: str | None = None
    amount: float
    discount: float
    net_amount: float
    portal_user_id: int
    is_cancelled: bool
    created_at: datetime | None = None
    items: list[BookingItemRead] | None = None


# ── List schemas (lighter payload for paginated list) ──

class BookingListItem(BaseModel):
    id: int
    booking_no: int
    status: str
    branch_name: str | None = None
    route_name: str | None = None
    travel_date: date
    departure: str | None = None
    net_amount: float
    is_cancelled: bool
    created_at: datetime | None = None
    items: list[dict] | None = None  # [{item_name, quantity}]


class BookingListResponse(BaseModel):
    data: list[BookingListItem]
    total: int
    page: int
    page_size: int
    total_pages: int
```

**Step 2: Commit**

```bash
git add backend/app/schemas/booking.py
git commit -m "feat(schemas): add BookingCreate, BookingRead, BookingListResponse schemas"
```

---

### Task 4: Create Booking Service

**Files:**
- Create: `backend/app/services/booking_service.py`

This is the core business logic. Mirrors `ticket_service.py` patterns.

**Step 1: Create the booking service**

Create `backend/app/services/booking_service.py`:

```python
import datetime
import uuid as uuid_mod
from decimal import Decimal, ROUND_HALF_UP

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.models.booking import Booking
from app.models.booking_item import BookingItem
from app.models.branch import Branch
from app.models.route import Route
from app.models.item import Item
from app.models.item_rate import ItemRate
from app.models.ferry_schedule import FerrySchedule
from app.models.portal_user import PortalUser
from app.schemas.booking import BookingCreate


def _round2(value: float) -> float:
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


async def _get_item_name(db: AsyncSession, item_id: int) -> str | None:
    result = await db.execute(select(Item.name).where(Item.id == item_id))
    return result.scalar_one_or_none()


async def _find_route(db: AsyncSession, from_branch_id: int, to_branch_id: int) -> Route:
    """Find a route connecting two branches (in either direction)."""
    result = await db.execute(
        select(Route).where(
            Route.is_active == True,
            or_(
                (Route.branch_id_one == from_branch_id) & (Route.branch_id_two == to_branch_id),
                (Route.branch_id_one == to_branch_id) & (Route.branch_id_two == from_branch_id),
            ),
        )
    )
    route = result.scalar_one_or_none()
    if not route:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No active route found between branch {from_branch_id} and {to_branch_id}",
        )
    return route


async def _get_current_rate(db: AsyncSession, item_id: int, route_id: int) -> dict:
    """Get the most recent active rate for an item on a route."""
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
            detail=f"No active rate found for item {item_id} on route {route_id}",
        )
    return {
        "rate": float(ir.rate) if ir.rate is not None else 0,
        "levy": float(ir.levy) if ir.levy is not None else 0,
    }


async def _check_capacity(
    db: AsyncSession, branch_id: int, travel_date: datetime.date, departure_time: datetime.time
) -> None:
    """Check if the departure has capacity available. Skip if capacity=0 (unlimited)."""
    # Get schedule capacity
    result = await db.execute(
        select(FerrySchedule.capacity).where(
            FerrySchedule.branch_id == branch_id,
            FerrySchedule.departure == departure_time,
        )
    )
    capacity = result.scalar_one_or_none()
    if capacity is None or capacity == 0:
        return  # No capacity limit or schedule not found

    # Count existing non-cancelled bookings for this departure
    count_result = await db.execute(
        select(func.count()).select_from(Booking).where(
            Booking.branch_id == branch_id,
            Booking.travel_date == travel_date,
            Booking.departure == departure_time,
            Booking.is_cancelled == False,
            Booking.status != "CANCELLED",
        )
    )
    current_count = count_result.scalar()

    if current_count >= capacity:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ferry is fully booked for this departure ({current_count}/{capacity}). Please choose a different time.",
        )


async def _enrich_booking_item(db: AsyncSession, bi: BookingItem) -> dict:
    item_name = await _get_item_name(db, bi.item_id)
    rate = float(bi.rate) if bi.rate is not None else 0
    levy = float(bi.levy) if bi.levy is not None else 0
    quantity = bi.quantity or 0
    amount = _round2(quantity * (rate + levy))
    return {
        "id": bi.id,
        "booking_id": bi.booking_id,
        "item_id": bi.item_id,
        "item_name": item_name,
        "rate": rate,
        "levy": levy,
        "quantity": quantity,
        "vehicle_no": bi.vehicle_no,
        "is_cancelled": bi.is_cancelled,
        "amount": amount,
    }


async def _enrich_booking(db: AsyncSession, booking: Booking, include_items: bool = False) -> dict:
    branch_name = await _get_branch_name(db, booking.branch_id)
    route_name = await _get_route_display_name(db, booking.route_id)

    data = {
        "id": booking.id,
        "booking_no": booking.booking_no,
        "status": booking.status,
        "verification_code": str(booking.verification_code) if booking.verification_code else None,
        "branch_id": booking.branch_id,
        "branch_name": branch_name,
        "route_id": booking.route_id,
        "route_name": route_name,
        "travel_date": booking.travel_date,
        "departure": _format_time(booking.departure),
        "amount": float(booking.amount) if booking.amount is not None else 0,
        "discount": float(booking.discount) if booking.discount is not None else 0,
        "net_amount": float(booking.net_amount) if booking.net_amount is not None else 0,
        "portal_user_id": booking.portal_user_id,
        "is_cancelled": booking.is_cancelled,
        "created_at": booking.created_at,
    }

    if include_items:
        result = await db.execute(
            select(BookingItem).where(BookingItem.booking_id == booking.id)
        )
        items = result.scalars().all()
        data["items"] = [await _enrich_booking_item(db, bi) for bi in items]
    else:
        # Lightweight item summary for list view
        result = await db.execute(
            select(BookingItem).where(
                BookingItem.booking_id == booking.id,
                BookingItem.is_cancelled == False,
            )
        )
        items = result.scalars().all()
        item_summaries = []
        for bi in items:
            name = await _get_item_name(db, bi.item_id)
            item_summaries.append({"item_name": name, "quantity": bi.quantity})
        data["items"] = item_summaries

    return data


# ── Public data endpoints (used by booking form) ──

async def get_to_branches(db: AsyncSession, from_branch_id: int) -> list[dict]:
    """Get destination branches connected to the given departure branch via active routes."""
    result = await db.execute(
        select(Route).where(
            Route.is_active == True,
            or_(
                Route.branch_id_one == from_branch_id,
                Route.branch_id_two == from_branch_id,
            ),
        )
    )
    routes = result.scalars().all()

    branch_ids = set()
    for r in routes:
        if r.branch_id_one == from_branch_id:
            branch_ids.add(r.branch_id_two)
        else:
            branch_ids.add(r.branch_id_one)

    if not branch_ids:
        return []

    branches_result = await db.execute(
        select(Branch).where(Branch.id.in_(branch_ids), Branch.is_active == True)
    )
    branches = branches_result.scalars().all()
    return [{"id": b.id, "name": b.name} for b in branches]


async def get_online_items(db: AsyncSession, from_branch_id: int, to_branch_id: int) -> list[dict]:
    """Get items visible online with their current rates for the route between two branches."""
    route = await _find_route(db, from_branch_id, to_branch_id)
    today = datetime.date.today()

    items_result = await db.execute(
        select(Item).where(
            Item.is_active == True,
            Item.online_visibility == True,
        ).order_by(Item.id)
    )
    items = items_result.scalars().all()

    result = []
    for item in items:
        rate_result = await db.execute(
            select(ItemRate)
            .where(
                ItemRate.item_id == item.id,
                ItemRate.route_id == route.id,
                ItemRate.is_active == True,
                ItemRate.applicable_from_date.is_not(None),
                ItemRate.applicable_from_date <= today,
            )
            .order_by(ItemRate.applicable_from_date.desc())
            .limit(1)
        )
        ir = rate_result.scalar_one_or_none()
        if ir:
            result.append({
                "id": item.id,
                "name": item.name,
                "short_name": item.short_name,
                "is_vehicle": bool(item.is_vehicle),
                "rate": float(ir.rate) if ir.rate is not None else 0,
                "levy": float(ir.levy) if ir.levy is not None else 0,
            })
    return result


async def get_schedules(db: AsyncSession, branch_id: int) -> list[dict]:
    """Get all ferry departure times for a branch."""
    result = await db.execute(
        select(FerrySchedule)
        .where(FerrySchedule.branch_id == branch_id)
        .order_by(FerrySchedule.departure.asc())
    )
    schedules = result.scalars().all()
    return [{"schedule_time": _format_time(s.departure)} for s in schedules]


async def get_item_rate(db: AsyncSession, item_id: int, route_id: int) -> dict:
    """Get current rate and levy for a specific item on a route."""
    rate_data = await _get_current_rate(db, item_id, route_id)
    return {"rate": rate_data["rate"], "levy": rate_data["levy"]}


# ── Booking CRUD ──

async def create_booking(db: AsyncSession, data: BookingCreate, portal_user: PortalUser) -> dict:
    """Create a new booking for a portal user."""
    # 1. Validate branches exist and are active
    from_branch = await db.execute(
        select(Branch).where(Branch.id == data.from_branch_id, Branch.is_active == True)
    )
    if not from_branch.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Departure branch {data.from_branch_id} not found or inactive")

    to_branch = await db.execute(
        select(Branch).where(Branch.id == data.to_branch_id, Branch.is_active == True)
    )
    if not to_branch.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Destination branch {data.to_branch_id} not found or inactive")

    # 2. Find route connecting the two branches
    route = await _find_route(db, data.from_branch_id, data.to_branch_id)

    # 3. Validate travel_date >= today
    today = datetime.date.today()
    if data.travel_date < today:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Travel date must be today or in the future")

    # 4. Validate departure time exists in schedules
    departure_time = _parse_time(data.departure)
    schedule_result = await db.execute(
        select(FerrySchedule).where(
            FerrySchedule.branch_id == data.from_branch_id,
            FerrySchedule.departure == departure_time,
        )
    )
    if not schedule_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"No ferry scheduled at {data.departure} from this branch")

    # 5. Check capacity
    await _check_capacity(db, data.from_branch_id, data.travel_date, departure_time)

    # 6. Validate items and compute amounts
    total_amount = 0.0
    item_details = []
    for item_data in data.items:
        # Validate item exists, is active, is online-visible
        item_result = await db.execute(
            select(Item).where(
                Item.id == item_data.item_id,
                Item.is_active == True,
                Item.online_visibility == True,
            )
        )
        item = item_result.scalar_one_or_none()
        if not item:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Item {item_data.item_id} not found, inactive, or not available online",
            )

        # Validate vehicle_no required for vehicle items
        if item.is_vehicle and not item_data.vehicle_no:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Vehicle number is required for item '{item.name}'",
            )

        # Get current rate
        rate_data = await _get_current_rate(db, item_data.item_id, route.id)
        line_amount = _round2(item_data.quantity * (rate_data["rate"] + rate_data["levy"]))
        total_amount += line_amount
        item_details.append({
            "item_id": item_data.item_id,
            "rate": rate_data["rate"],
            "levy": rate_data["levy"],
            "quantity": item_data.quantity,
            "vehicle_no": item_data.vehicle_no,
            "line_amount": line_amount,
        })

    amount = _round2(total_amount)
    net_amount = amount  # No discount for portal bookings

    # 7. Lock branch and increment booking number
    branch_result = await db.execute(
        select(Branch).where(Branch.id == data.from_branch_id).with_for_update()
    )
    branch = branch_result.scalar_one()
    next_booking_no = (branch.last_booking_no or 0) + 1

    # 8. Generate next booking ID
    id_result = await db.execute(select(func.coalesce(func.max(Booking.id), 0)))
    next_booking_id = id_result.scalar() + 1

    # 9. Get "Online" payment mode (id=4 for Online in seed data) — use first available if not found
    from app.models.payment_mode import PaymentMode
    pm_result = await db.execute(
        select(PaymentMode).where(PaymentMode.description == "Online")
    )
    payment_mode = pm_result.scalar_one_or_none()
    if not payment_mode:
        # Fallback: use first active payment mode
        pm_result = await db.execute(
            select(PaymentMode).where(PaymentMode.is_active == True).limit(1)
        )
        payment_mode = pm_result.scalar_one_or_none()
        if not payment_mode:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="No payment mode configured")

    # 10. Create booking
    booking = Booking(
        id=next_booking_id,
        branch_id=data.from_branch_id,
        booking_no=next_booking_no,
        travel_date=data.travel_date,
        departure=departure_time,
        amount=amount,
        discount=0,
        payment_mode_id=payment_mode.id,
        is_cancelled=False,
        net_amount=net_amount,
        route_id=route.id,
        portal_user_id=portal_user.id,
        status="CONFIRMED",
        verification_code=uuid_mod.uuid4(),
    )
    db.add(booking)

    # 11. Create booking items
    item_id_result = await db.execute(select(func.coalesce(func.max(BookingItem.id), 0)))
    next_item_id = item_id_result.scalar() + 1

    for detail in item_details:
        bi = BookingItem(
            id=next_item_id,
            booking_id=next_booking_id,
            item_id=detail["item_id"],
            rate=detail["rate"],
            levy=detail["levy"],
            quantity=detail["quantity"],
            vehicle_no=detail["vehicle_no"],
            is_cancelled=False,
        )
        db.add(bi)
        next_item_id += 1

    branch.last_booking_no = next_booking_no

    await db.flush()
    return await _enrich_booking(db, booking, include_items=True)


async def get_user_bookings(
    db: AsyncSession,
    portal_user_id: int,
    page: int = 1,
    page_size: int = 10,
) -> dict:
    """Get paginated bookings for a portal user."""
    # Count total
    count_result = await db.execute(
        select(func.count()).select_from(Booking).where(Booking.portal_user_id == portal_user_id)
    )
    total = count_result.scalar()

    total_pages = max(1, -(-total // page_size))  # ceil division
    offset = (page - 1) * page_size

    # Fetch page
    result = await db.execute(
        select(Booking)
        .where(Booking.portal_user_id == portal_user_id)
        .order_by(Booking.id.desc())
        .offset(offset)
        .limit(page_size)
    )
    bookings = result.scalars().all()

    data = [await _enrich_booking(db, b, include_items=False) for b in bookings]

    return {
        "data": data,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
    }


async def get_booking_by_id(db: AsyncSession, booking_id: int, portal_user_id: int) -> dict:
    """Get a single booking detail. Ensures the booking belongs to the requesting user."""
    result = await db.execute(
        select(Booking).where(Booking.id == booking_id, Booking.portal_user_id == portal_user_id)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")
    return await _enrich_booking(db, booking, include_items=True)


async def cancel_booking(db: AsyncSession, booking_id: int, portal_user_id: int) -> dict:
    """Cancel a booking. Only CONFIRMED bookings can be cancelled."""
    result = await db.execute(
        select(Booking).where(Booking.id == booking_id, Booking.portal_user_id == portal_user_id)
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Booking not found")

    if booking.status == "CANCELLED" or booking.is_cancelled:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking is already cancelled")

    if booking.status not in ("CONFIRMED", "PENDING"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot cancel a booking with status '{booking.status}'")

    booking.status = "CANCELLED"
    booking.is_cancelled = True

    # Cancel all items
    items_result = await db.execute(
        select(BookingItem).where(BookingItem.booking_id == booking_id)
    )
    for bi in items_result.scalars().all():
        bi.is_cancelled = True

    await db.flush()
    return await _enrich_booking(db, booking, include_items=True)
```

**Step 2: Commit**

```bash
git add backend/app/services/booking_service.py
git commit -m "feat(service): add booking_service with create, list, detail, cancel logic"
```

---

### Task 5: Create QR Service

**Files:**
- Create: `backend/app/services/qr_service.py`

**Step 1: Create QR code generation service**

Create `backend/app/services/qr_service.py`:

```python
import io
import qrcode


def generate_qr_png(data: str) -> bytes:
    """Generate a QR code PNG image from a string."""
    qr = qrcode.QRCode(version=1, box_size=10, border=4)
    qr.add_data(data)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    buffer.seek(0)
    return buffer.getvalue()
```

**Step 2: Commit**

```bash
git add backend/app/services/qr_service.py
git commit -m "feat(service): add QR code generation service"
```

---

### Task 6: Create Email Service

**Files:**
- Create: `backend/app/services/email_service.py`
- Modify: `backend/app/config.py`

**Step 1: Add SMTP config to settings**

In `backend/app/config.py`, add inside the `Settings` class after the Razorpay fields:

```python
    # Email (SMTP)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@ssmspl.com"
```

**Step 2: Create email service**

Create `backend/app/services/email_service.py`:

```python
import asyncio
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

import aiosmtplib

from app.config import settings

logger = logging.getLogger(__name__)


def _build_booking_confirmation_html(booking: dict) -> str:
    items_html = ""
    for item in (booking.get("items") or []):
        items_html += f"""
        <tr>
            <td style="padding:8px;border-bottom:1px solid #eee;">{item.get('item_name', 'Item')}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:center;">{item.get('quantity', 0)}</td>
            <td style="padding:8px;border-bottom:1px solid #eee;text-align:right;">₹{item.get('amount', 0):.2f}</td>
        </tr>
        """

    return f"""
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
        <div style="background:#0284c7;color:white;padding:24px;text-align:center;">
            <h1 style="margin:0;font-size:24px;">Booking Confirmed</h1>
            <p style="margin:8px 0 0;opacity:0.9;">SSMSPL Ferry Services</p>
        </div>
        <div style="padding:24px;background:#ffffff;">
            <p>Dear Customer,</p>
            <p>Your ferry booking has been confirmed. Here are the details:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr>
                    <td style="padding:8px;color:#666;">Booking Ref</td>
                    <td style="padding:8px;font-weight:bold;">#{booking.get('booking_no', '')}</td>
                </tr>
                <tr>
                    <td style="padding:8px;color:#666;">Route</td>
                    <td style="padding:8px;font-weight:bold;">{booking.get('route_name', '')}</td>
                </tr>
                <tr>
                    <td style="padding:8px;color:#666;">Travel Date</td>
                    <td style="padding:8px;font-weight:bold;">{booking.get('travel_date', '')}</td>
                </tr>
                <tr>
                    <td style="padding:8px;color:#666;">Departure</td>
                    <td style="padding:8px;font-weight:bold;">{booking.get('departure', '')}</td>
                </tr>
            </table>
            <h3 style="margin:16px 0 8px;">Items</h3>
            <table style="width:100%;border-collapse:collapse;">
                <thead>
                    <tr style="background:#f8fafc;">
                        <th style="padding:8px;text-align:left;">Item</th>
                        <th style="padding:8px;text-align:center;">Qty</th>
                        <th style="padding:8px;text-align:right;">Amount</th>
                    </tr>
                </thead>
                <tbody>{items_html}</tbody>
            </table>
            <div style="margin-top:16px;padding:12px;background:#f0f9ff;border-radius:8px;text-align:right;">
                <span style="font-size:18px;font-weight:bold;color:#0284c7;">Total: ₹{booking.get('net_amount', 0):.2f}</span>
            </div>
            <p style="margin-top:24px;color:#666;font-size:14px;">
                Please show your QR code at the jetty for boarding. You can view it in your booking history.
            </p>
        </div>
        <div style="padding:16px;background:#f8fafc;text-align:center;color:#999;font-size:12px;">
            Suvarnadurga Shipping & Marine Services Pvt. Ltd.
        </div>
    </div>
    """


async def send_booking_confirmation(booking: dict, to_email: str) -> None:
    """Send booking confirmation email. Fire-and-forget, logs errors."""
    if not settings.SMTP_HOST:
        logger.info("SMTP not configured, skipping booking confirmation email")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Booking Confirmed - #{booking.get('booking_no', '')}"
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = to_email

        html = _build_booking_confirmation_html(booking)
        msg.attach(MIMEText(html, "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            use_tls=True,
        )
        logger.info(f"Booking confirmation email sent to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send booking confirmation email to {to_email}: {e}")
```

**Step 3: Commit**

```bash
git add backend/app/config.py backend/app/services/email_service.py
git commit -m "feat(service): add email service with booking confirmation template"
```

---

### Task 7: Create Booking Data Router (public booking lookups)

**Files:**
- Create: `backend/app/routers/booking.py`

**Step 1: Create the router**

Create `backend/app/routers/booking.py`:

```python
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_portal_user
from app.models.portal_user import PortalUser
from app.services import booking_service

router = APIRouter(prefix="/api/booking", tags=["Booking Data"])


@router.get(
    "/to-branches/{branch_id}",
    summary="Get destination branches for a departure branch",
    description="Returns branches connected via active routes to the given departure branch.",
)
async def to_branches(
    branch_id: int,
    db: AsyncSession = Depends(get_db),
    _: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.get_to_branches(db, branch_id)


@router.get(
    "/items/{from_branch_id}/{to_branch_id}",
    summary="Get bookable items with rates for a route",
    description="Returns items with online_visibility=true and their current rates for the route between two branches.",
)
async def items(
    from_branch_id: int,
    to_branch_id: int,
    db: AsyncSession = Depends(get_db),
    _: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.get_online_items(db, from_branch_id, to_branch_id)


@router.get(
    "/schedules/{branch_id}",
    summary="Get ferry schedules for a branch",
    description="Returns departure times for the given branch.",
)
async def schedules(
    branch_id: int,
    db: AsyncSession = Depends(get_db),
    _: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.get_schedules(db, branch_id)


@router.get(
    "/item-rate/{item_id}/{route_id}",
    summary="Get current rate for an item on a route",
    description="Returns the current rate and levy for the given item and route combination.",
)
async def item_rate(
    item_id: int,
    route_id: int,
    db: AsyncSession = Depends(get_db),
    _: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.get_item_rate(db, item_id, route_id)
```

**Step 2: Commit**

```bash
git add backend/app/routers/booking.py
git commit -m "feat(router): add booking data router for portal form lookups"
```

---

### Task 8: Create Portal Bookings Router (CRUD + QR)

**Files:**
- Create: `backend/app/routers/portal_bookings.py`

**Step 1: Create the router**

Create `backend/app/routers/portal_bookings.py`:

```python
import asyncio

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_portal_user
from app.models.portal_user import PortalUser
from app.schemas.booking import BookingCreate, BookingRead, BookingListResponse
from app.services import booking_service
from app.services.qr_service import generate_qr_png
from app.services.email_service import send_booking_confirmation

router = APIRouter(prefix="/api/portal/bookings", tags=["Portal Bookings"])


@router.post(
    "",
    response_model=BookingRead,
    status_code=201,
    summary="Create a new booking",
    description="Create a ferry booking for the authenticated portal user.",
)
async def create_booking(
    body: BookingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    result = await booking_service.create_booking(db, body, current_user)

    # Fire-and-forget email
    asyncio.create_task(send_booking_confirmation(result, current_user.email))

    return result


@router.get(
    "",
    response_model=BookingListResponse,
    summary="List bookings for current user",
    description="Returns paginated bookings for the authenticated portal user.",
)
async def list_bookings(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=50, description="Items per page"),
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.get_user_bookings(db, current_user.id, page, page_size)


@router.get(
    "/{booking_id}",
    response_model=BookingRead,
    summary="Get booking detail",
    description="Returns full booking detail including items. Only the booking owner can access.",
)
async def get_booking(
    booking_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.get_booking_by_id(db, booking_id, current_user.id)


@router.post(
    "/{booking_id}/cancel",
    response_model=BookingRead,
    summary="Cancel a booking",
    description="Cancel a confirmed booking. Only the booking owner can cancel.",
)
async def cancel_booking(
    booking_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.cancel_booking(db, booking_id, current_user.id)


@router.get(
    "/{booking_id}/qr",
    summary="Get QR code for a booking",
    description="Returns a PNG QR code image encoding the booking verification code.",
    responses={200: {"content": {"image/png": {}}}},
)
async def get_qr(
    booking_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    booking = await booking_service.get_booking_by_id(db, booking_id, current_user.id)
    if not booking.get("verification_code"):
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No verification code for this booking")

    png_bytes = generate_qr_png(booking["verification_code"])
    return Response(content=png_bytes, media_type="image/png")
```

**Step 2: Commit**

```bash
git add backend/app/routers/portal_bookings.py
git commit -m "feat(router): add portal bookings router with CRUD and QR endpoints"
```

---

### Task 9: Register New Routers in main.py

**Files:**
- Modify: `backend/app/main.py`

**Step 1: Add imports and router registrations**

In `backend/app/main.py`:

Add to the imports line (line 6):
```python
from app.routers import auth, users, boats, branches, routes, items, item_rates, ferry_schedules, payment_modes, tickets, portal_auth, company, booking, portal_bookings
```

Add openapi_tags entries for the two new routers (inside the `openapi_tags` list):
```python
        {
            "name": "Booking Data",
            "description": "Public booking form data — routes, items, schedules, rates for portal users.",
        },
        {
            "name": "Portal Bookings",
            "description": "Customer booking management — create, list, view, cancel, QR codes.",
        },
```

Add router registrations after `app.include_router(company.router)`:
```python
app.include_router(booking.router)
app.include_router(portal_bookings.router)
```

**Step 2: Commit**

```bash
git add backend/app/main.py
git commit -m "feat(main): register booking and portal_bookings routers"
```

---

### Task 10: Redesign Frontend — Customer Dashboard (Booking Form)

**Files:**
- Modify: `frontend/src/app/customer/dashboard/page.tsx`

**Step 1: Rewrite the booking form page**

Key changes from existing:
- Item selection uses `item_id` instead of `item_rate_id`
- Rate lookup happens via `GET /api/booking/item-rate/{item_id}/{route_id}` (needs both branches selected first to determine route)
- Items endpoint changes to `GET /api/booking/items/{from_branch_id}/{to_branch_id}` (needs both branches)
- Submission payload simplified: `{from_branch_id, to_branch_id, travel_date, departure, items: [{item_id, quantity, vehicle_no}]}`
- Remove `ferry_boat_id` and `selectedFerryBoatId` state
- Remove `item_rate_id` from BookingItem interface, use `item_id` instead
- Items/rates fetched after BOTH from and to branches are selected

The full rewrite of `frontend/src/app/customer/dashboard/page.tsx` should:

1. **State changes:**
   - Remove: `selectedFerryBoatId` state
   - Change `BookingItem.item_rate_id` → `BookingItem.item_id`
   - Add: `routeId` state (derived from branch selection)

2. **API call changes:**
   - Branches on mount: `GET /api/branches` → stays same but add `?status=active`
   - To-branches: `GET /api/booking/to-branches/{fromBranch}` → stays same
   - Items: `GET /api/booking/items/${fromBranch}/${toBranch}` → needs BOTH branches
   - Schedules: `GET /api/booking/schedules/${fromBranch}` → stays same
   - Rate lookup: `GET /api/booking/item-rate/${itemId}/${routeId}` → uses item_id + route_id
   - Submit: `POST /api/portal/bookings` → new payload shape

3. **Form field changes:**
   - Item dropdown `value` and `onChange` use `item_id` instead of `item_rate_id`
   - Rate lookup triggered on item selection (if route is known)
   - Items fetched in a combined effect watching both `fromBranch` and `toBranch`

4. **Submission payload:**
   ```typescript
   {
     from_branch_id: parseInt(fromBranch),
     to_branch_id: parseInt(toBranch),
     travel_date: travelDate,
     departure: ferryTime,
     items: items.map(item => ({
       item_id: parseInt(item.item_id),
       quantity: item.quantity || 1,
       vehicle_no: item.vehicle_no || undefined,
     }))
   }
   ```

**Step 2: Commit**

```bash
git add frontend/src/app/customer/dashboard/page.tsx
git commit -m "feat(frontend): redesign customer booking form for clean API contract"
```

---

### Task 11: Redesign Frontend — Booking History Page

**Files:**
- Modify: `frontend/src/app/customer/history/page.tsx`

**Step 1: Update interfaces and API calls**

Key changes:
- `Booking` interface updated to match `BookingListItem` schema:
  ```typescript
  interface BookingItem {
    item_name?: string;
    quantity?: number;
  }
  interface Booking {
    id: number;
    booking_no: number;
    status: string;
    branch_name?: string;
    route_name?: string;
    travel_date?: string;
    departure?: string;
    net_amount: number;
    is_cancelled: boolean;
    created_at?: string;
    items?: BookingItem[];
  }
  interface PaginatedBookings {
    data: Booking[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
  }
  ```
- Display changes:
  - Reference: `#{booking.booking_no}` instead of `booking.booking_reference`
  - Route: `booking.route_name` instead of `booking.from_branch.branch_name → to_branch.branch_name`
  - Amount: `booking.net_amount` instead of `booking.total_amount`
  - Departure time: `booking.departure` (HH:MM string) instead of parsing from `created_at`
  - Items: `item.item_name` and `item.quantity` (both guaranteed)
  - Pagination: use `total_pages` instead of `last_page`
- QR button: opens new tab to `/api/portal/bookings/${id}/qr` (with auth header via fetch+blob)
- Download button: triggers browser print on detail page

**Step 2: Commit**

```bash
git add frontend/src/app/customer/history/page.tsx
git commit -m "feat(frontend): redesign booking history page for new API contract"
```

---

### Task 12: Redesign Frontend — Booking Detail Page

**Files:**
- Modify: `frontend/src/app/customer/history/[id]/page.tsx`

**Step 1: Update interface and API calls**

Key changes:
- `BookingData` interface updated to match `BookingRead` schema:
  ```typescript
  interface BookingItemData {
    id: number;
    item_id: number;
    item_name?: string;
    rate: number;
    levy: number;
    quantity: number;
    vehicle_no?: string;
    is_cancelled: boolean;
    amount: number;
  }
  interface BookingData {
    id: number;
    booking_no: number;
    status: string;
    verification_code?: string;
    branch_name?: string;
    route_name?: string;
    travel_date?: string;
    departure?: string;
    amount: number;
    discount: number;
    net_amount: number;
    is_cancelled: boolean;
    created_at?: string;
    items?: BookingItemData[];
  }
  ```
- Route display: parse `route_name` (e.g. "Dighi - Agardanda") into from/to
- Amount: use `net_amount`
- Reference: `booking_no`
- QR Code button: fetch QR PNG from `/api/portal/bookings/${id}/qr` and display in modal
- Download button: trigger `window.print()` with a print-styled ticket layout
- Add cancel button for CONFIRMED bookings (calls `POST /api/portal/bookings/${id}/cancel`)

**Step 2: Commit**

```bash
git add frontend/src/app/customer/history/[id]/page.tsx
git commit -m "feat(frontend): redesign booking detail page with QR, download, cancel"
```

---

### Task 13: Add SMTP Config to Environment Files

**Files:**
- Modify: `backend/.env.development`
- Modify: `backend/.env.example`

**Step 1: Add SMTP placeholder vars**

Append to both files:
```
# Email (SMTP)
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=noreply@ssmspl.com
```

**Step 2: Commit**

```bash
git add backend/.env.development backend/.env.example
git commit -m "feat(config): add SMTP configuration placeholders"
```

---

### Task 14: Backend Integration Test

**Files:**
- Create: `backend/tests/test_portal_bookings.py`

**Step 1: Write integration tests**

Create `backend/tests/test_portal_bookings.py` with tests covering:
1. Portal user registration → login → get token
2. Create booking with valid data → 201
3. Create booking with invalid branch → 404
4. Create booking with past travel date → 400
5. Create booking with invalid departure time → 400
6. List bookings → paginated response
7. Get booking detail → includes items
8. Cancel booking → status changes to CANCELLED
9. Cancel already-cancelled booking → 400
10. Access other user's booking → 404

Each test should:
- Create necessary seed data (branches, routes, items, item_rates, ferry_schedules, payment_modes) via fixtures
- Authenticate as a portal user
- Call the API endpoint
- Assert response status and body

**Step 2: Run tests**

Run: `cd backend && pytest tests/test_portal_bookings.py -v`
Expected: All tests PASS

**Step 3: Commit**

```bash
git add backend/tests/test_portal_bookings.py
git commit -m "test: add integration tests for portal bookings"
```

---

## Task Dependency Graph

```
Task 1 (models) ──┐
Task 2 (deps)   ──┤
Task 3 (schemas) ─┤
                   ├── Task 4 (booking_service) ──┐
Task 5 (qr svc) ──┤                               ├── Task 7 (booking router) ──┐
Task 6 (email)  ──┤                               ├── Task 8 (portal router)  ──┤
                   │                               │                              ├── Task 9 (main.py) ── Task 14 (tests)
                   │                               │                              │
                   │                               │   Task 10 (FE dashboard) ────┤
                   │                               │   Task 11 (FE history)  ─────┤
                   │                               │   Task 12 (FE detail)  ──────┘
                   │                               │
                   └───────────────────────────────┘
                   Task 13 (env files) — independent
```

Tasks 1-3, 5, 6, 13 can be done in parallel.
Task 4 depends on 1, 3.
Tasks 7, 8 depend on 4, 5, 6.
Task 9 depends on 7, 8.
Tasks 10-12 depend on 7, 8.
Task 14 depends on 9.
