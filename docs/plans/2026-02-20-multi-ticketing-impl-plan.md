# Multi-Ticket Issuing Form — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an off-hours batch ticket creation page at `/dashboard/multiticketing` with backend batch API and browser print support.

**Architecture:** New `POST /api/tickets/batch` endpoint wraps existing `create_ticket()` logic in a single transaction. New `GET /api/tickets/multi-ticket-init` returns all form data in one call (route, branch, items with rates, payment modes, ferry time window). Frontend is a full-page form with dynamic ticket grids.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic v2, Next.js 16, React 19, TypeScript, Tailwind CSS v4.

---

### Task 1: Add "Multi-Ticketing" to RBAC menu items

**Files:**
- Modify: `backend/app/core/rbac.py:13-61`

**Step 1: Add menu item to each applicable role**

In `backend/app/core/rbac.py`, add `"Multi-Ticketing"` after `"Ticketing"` for the four roles:

```python
# In ROLE_MENU_ITEMS dict:

# SUPER_ADMIN list — add after "Ticketing" (line ~25):
        "Ticketing",
        "Multi-Ticketing",

# ADMIN list — add after "Ticketing" (line ~39):
        "Ticketing",
        "Multi-Ticketing",

# MANAGER list — add after "Ticketing" (line ~50):
        "Ticketing",
        "Multi-Ticketing",

# BILLING_OPERATOR list — add after "Ticketing" (line ~55):
        "Ticketing",
        "Multi-Ticketing",
```

**Step 2: Verify no syntax errors**

Run: `cd /d/workspace/ssmspl/backend && python -c "from app.core.rbac import ROLE_MENU_ITEMS; print(ROLE_MENU_ITEMS)"`
Expected: Dict prints with "Multi-Ticketing" in the four roles.

**Step 3: Commit**

```bash
git add backend/app/core/rbac.py
git commit -m "feat: add Multi-Ticketing to RBAC menu items"
```

---

### Task 2: Add backend schemas for multi-ticket

**Files:**
- Modify: `backend/app/schemas/ticket.py`

**Step 1: Add MultiTicketInitItem, MultiTicketInitResponse, and MultiTicketCreate schemas**

Append to end of `backend/app/schemas/ticket.py`:

```python
# ── Multi-ticket schemas ──

class MultiTicketInitItem(BaseModel):
    id: int
    name: str
    short_name: str
    is_vehicle: bool
    rate: float
    levy: float

class MultiTicketInitPaymentMode(BaseModel):
    id: int
    description: str

class MultiTicketInitResponse(BaseModel):
    route_id: int
    route_name: str
    branch_id: int
    branch_name: str
    items: list[MultiTicketInitItem]
    payment_modes: list[MultiTicketInitPaymentMode]
    first_ferry_time: str | None = Field(None, description="HH:MM of earliest ferry")
    last_ferry_time: str | None = Field(None, description="HH:MM of latest ferry")
    is_off_hours: bool = Field(..., description="True if current time is outside ferry schedule")

class MultiTicketCreate(BaseModel):
    tickets: list[TicketCreate] = Field(..., min_length=1, description="Array of tickets to create atomically")
```

**Step 2: Verify import works**

Run: `cd /d/workspace/ssmspl/backend && python -c "from app.schemas.ticket import MultiTicketCreate, MultiTicketInitResponse; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add backend/app/schemas/ticket.py
git commit -m "feat: add multi-ticket Pydantic schemas"
```

---

### Task 3: Add `get_multi_ticket_init()` service function

**Files:**
- Modify: `backend/app/services/ticket_service.py`

**Step 1: Add the init function**

Add this function after the existing `get_departure_options()` function (after line ~239):

```python
async def get_multi_ticket_init(db: AsyncSession, user) -> dict:
    """Return all data needed to populate the multi-ticket form."""
    if not user.route_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no assigned route. Cannot use multi-ticketing.",
        )

    # Get route info
    route_result = await db.execute(select(Route).where(Route.id == user.route_id))
    route = route_result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned route not found")

    route_name = await _get_route_display_name(db, route.id)

    # Determine branch: use branch_id_one as the user's operating branch
    branch_id = route.branch_id_one
    branch_name = await _get_branch_name(db, branch_id)

    # Get ferry time window for this branch
    first_result = await db.execute(
        select(func.min(FerrySchedule.departure)).where(FerrySchedule.branch_id == branch_id)
    )
    first_ferry = first_result.scalar_one_or_none()

    last_result = await db.execute(
        select(func.max(FerrySchedule.departure)).where(FerrySchedule.branch_id == branch_id)
    )
    last_ferry = last_result.scalar_one_or_none()

    # Determine if off-hours
    now = datetime.datetime.now().time()
    if first_ferry and last_ferry:
        is_off_hours = now < first_ferry or now > last_ferry
    else:
        # No ferry schedules — always off-hours
        is_off_hours = True

    # Get active items with their current rates for this route
    today = datetime.date.today()
    items_result = await db.execute(
        select(Item).where(Item.is_active == True).order_by(Item.id)
    )
    items = items_result.scalars().all()

    items_with_rates = []
    for item in items:
        rate_result = await db.execute(
            select(ItemRate)
            .where(
                ItemRate.item_id == item.id,
                ItemRate.route_id == user.route_id,
                ItemRate.is_active == True,
                ItemRate.applicable_from_date.is_not(None),
                ItemRate.applicable_from_date <= today,
            )
            .order_by(ItemRate.applicable_from_date.desc())
            .limit(1)
        )
        ir = rate_result.scalar_one_or_none()
        if ir:
            items_with_rates.append({
                "id": item.id,
                "name": item.name,
                "short_name": item.short_name,
                "is_vehicle": bool(item.is_vehicle),
                "rate": float(ir.rate) if ir.rate is not None else 0,
                "levy": float(ir.levy) if ir.levy is not None else 0,
            })

    # Get active payment modes
    pm_result = await db.execute(
        select(PaymentMode).where(PaymentMode.is_active == True).order_by(PaymentMode.id)
    )
    payment_modes = pm_result.scalars().all()

    return {
        "route_id": route.id,
        "route_name": route_name or "",
        "branch_id": branch_id,
        "branch_name": branch_name or "",
        "items": items_with_rates,
        "payment_modes": [{"id": pm.id, "description": pm.description} for pm in payment_modes],
        "first_ferry_time": _format_time(first_ferry),
        "last_ferry_time": _format_time(last_ferry),
        "is_off_hours": is_off_hours,
    }
```

**Step 2: Verify import**

Run: `cd /d/workspace/ssmspl/backend && python -c "from app.services.ticket_service import get_multi_ticket_init; print('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add backend/app/services/ticket_service.py
git commit -m "feat: add get_multi_ticket_init service function"
```

---

### Task 4: Add `validate_off_hours()` and `create_multi_tickets()` service functions

**Files:**
- Modify: `backend/app/services/ticket_service.py`

**Step 1: Add off-hours validation helper**

Add this after the `get_multi_ticket_init()` function:

```python
async def _validate_off_hours(db: AsyncSession, branch_id: int) -> None:
    """Raise 400 if current time is within ferry schedule hours."""
    first_result = await db.execute(
        select(func.min(FerrySchedule.departure)).where(FerrySchedule.branch_id == branch_id)
    )
    first_ferry = first_result.scalar_one_or_none()

    last_result = await db.execute(
        select(func.max(FerrySchedule.departure)).where(FerrySchedule.branch_id == branch_id)
    )
    last_ferry = last_result.scalar_one_or_none()

    if first_ferry and last_ferry:
        now = datetime.datetime.now().time()
        if first_ferry <= now <= last_ferry:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Multi-ticketing is only available outside ferry hours ({_format_time(first_ferry)} - {_format_time(last_ferry)}). Current time: {_format_time(now)}",
            )
```

**Step 2: Add `create_multi_tickets()`**

Add this after the off-hours helper:

```python
async def create_multi_tickets(db: AsyncSession, data, user) -> list[dict]:
    """Create multiple tickets in a single transaction."""
    if not user.route_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no assigned route.",
        )

    # Determine branch from user's route
    route_result = await db.execute(select(Route).where(Route.id == user.route_id))
    route = route_result.scalar_one_or_none()
    if not route:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Assigned route not found")

    branch_id = route.branch_id_one

    # Validate off-hours
    await _validate_off_hours(db, branch_id)

    created_tickets = []
    for ticket_data in data.tickets:
        result = await create_ticket(db, ticket_data)
        created_tickets.append(result)

    return created_tickets
```

**Step 3: Verify import**

Run: `cd /d/workspace/ssmspl/backend && python -c "from app.services.ticket_service import create_multi_tickets; print('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add backend/app/services/ticket_service.py
git commit -m "feat: add create_multi_tickets with off-hours validation"
```

---

### Task 5: Add backend API endpoints for multi-ticket

**Files:**
- Modify: `backend/app/routers/tickets.py`

**Step 1: Update imports**

At the top of `backend/app/routers/tickets.py`, update the schema import (line 9):

```python
from app.schemas.ticket import (
    TicketCreate, TicketRead, TicketUpdate, RateLookupResponse,
    MultiTicketCreate, MultiTicketInitResponse,
)
```

Also add imports for dependencies (update line 7):

```python
from app.dependencies import get_current_user, require_roles
```

And import the User model:

```python
from app.models.user import User
```

**Step 2: Add multi-ticket-init endpoint**

Add before the `POST /` endpoint (before line ~120), after the departure-options endpoint:

```python
@router.get(
    "/multi-ticket-init",
    response_model=MultiTicketInitResponse,
    summary="Get multi-ticket form initialization data",
    description="Returns route, branch, items with rates, payment modes, and ferry time window for the logged-in user. Requires an assigned route.",
    responses={
        200: {"description": "Form initialization data returned"},
        400: {"description": "User has no assigned route"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
    },
)
async def multi_ticket_init(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_ticket_roles),
):
    return await ticket_service.get_multi_ticket_init(db, current_user)
```

**Step 3: Add batch endpoint**

Add after the multi-ticket-init endpoint:

```python
@router.post(
    "/batch",
    response_model=list[TicketRead],
    status_code=201,
    summary="Create multiple tickets in a single transaction",
    description="Creates all provided tickets atomically. Only available outside ferry schedule hours. Requires an assigned route.",
    responses={
        201: {"description": "All tickets created successfully"},
        400: {"description": "Validation error, amount mismatch, or not off-hours"},
        401: {"description": "Not authenticated"},
        403: {"description": "Insufficient role permissions"},
        404: {"description": "Referenced entity not found"},
    },
)
async def create_multi_tickets(
    body: MultiTicketCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_ticket_roles),
):
    return await ticket_service.create_multi_tickets(db, body, current_user)
```

**Step 4: Verify server starts**

Run: `cd /d/workspace/ssmspl/backend && python -c "from app.routers.tickets import router; print('Routes:', [r.path for r in router.routes])"`
Expected: Routes list includes `/multi-ticket-init` and `/batch`.

**Step 5: Commit**

```bash
git add backend/app/routers/tickets.py
git commit -m "feat: add multi-ticket-init and batch API endpoints"
```

---

### Task 6: Add frontend TypeScript types

**Files:**
- Modify: `frontend/src/types/index.ts`

**Step 1: Add MultiTicketInit type**

Append to end of `frontend/src/types/index.ts`:

```typescript
// ── Multi-ticket types ──

export interface MultiTicketInitItem {
  id: number;
  name: string;
  short_name: string;
  is_vehicle: boolean;
  rate: number;
  levy: number;
}

export interface MultiTicketInitPaymentMode {
  id: number;
  description: string;
}

export interface MultiTicketInit {
  route_id: number;
  route_name: string;
  branch_id: number;
  branch_name: string;
  items: MultiTicketInitItem[];
  payment_modes: MultiTicketInitPaymentMode[];
  first_ferry_time: string | null;
  last_ferry_time: string | null;
  is_off_hours: boolean;
}
```

**Step 2: Commit**

```bash
git add frontend/src/types/index.ts
git commit -m "feat: add MultiTicketInit TypeScript types"
```

---

### Task 7: Update Sidebar route mapping

**Files:**
- Modify: `frontend/src/components/Sidebar.tsx:11-25`

**Step 1: Add Multi-Ticketing route**

In the `MENU_ROUTES` object, add after the `Ticketing` entry (line ~21):

```typescript
  Ticketing: "/dashboard/ticketing",
  "Multi-Ticketing": "/dashboard/multiticketing",
```

**Step 2: Commit**

```bash
git add frontend/src/components/Sidebar.tsx
git commit -m "feat: add Multi-Ticketing sidebar route mapping"
```

---

### Task 8: Create the multi-ticketing frontend page

**Files:**
- Create: `frontend/src/app/dashboard/multiticketing/page.tsx`

**Step 1: Create the page file**

Create `frontend/src/app/dashboard/multiticketing/page.tsx` with the complete multi-ticket form implementation. This is the largest task. The page must include:

**State management:**
- `initData`: fetched from `/api/tickets/multi-ticket-init`
- `tickets`: array of ticket objects, each with `{ tempId, paymentModeId, items: [{ tempId, itemId, rate, levy, qty, vehicleNo }] }`
- `loading`, `saving`, `error` states
- `printData`: stores created tickets for print view
- `currentTime`: updates every second via `setInterval`

**Header section:**
- Display route name, branch name (from initData)
- Current date (formatted)
- Live clock (current time, updates every second)
- Off-hours indicator: green badge if off-hours, red warning if not (with first/last ferry times)

**Ticket grids section:**
- Map over `tickets` array, render a card per ticket
- Each card header: "Ticket #N" + payment mode dropdown + remove button (if > 1 ticket)
- Each card body: table with columns Item (dropdown) | Rate | Levy | Qty (number input) | Vehicle No (text input, shown if is_vehicle) | Amount (computed, read-only)
- "Add Item" button per card adds a row
- Remove row button per row (if > 1 row)
- Card footer: total amount for that ticket

**Grand total bar:**
- Sum of all ticket totals

**"+ Add Ticket" button:**
- Adds a new empty ticket grid with one empty item row

**Footer buttons:**
- Cancel: calls a `resetForm()` that sets tickets back to initial state (one ticket, one empty item)
- Save & Print:
  1. Build `MultiTicketCreate` payload from state
  2. POST to `/api/tickets/batch`
  3. On success: store response in `printData`, set `showPrint = true`
  4. After render, call `window.print()`
  5. Reset form

**Print view:**
- Hidden div (only visible in print media)
- Renders each ticket receipt: ticket_no, branch, route, date, time, items table, total
- Uses `@media print` CSS to hide the form and show only the print div

**Item dropdown behavior:**
- When an item is selected from the dropdown, auto-fill rate and levy from `initData.items`
- Reset qty to 1

**Validation before save:**
- Check `initData.is_off_hours === true`
- At least one ticket
- Each ticket has payment mode selected
- Each ticket has at least one item with qty > 0
- Vehicle No required for vehicle items
- Show toast/alert on validation failure

**Step 2: Verify the page renders**

Run: `cd /d/workspace/ssmspl/frontend && npx next lint src/app/dashboard/multiticketing/page.tsx`
Expected: No errors (or only warnings).

**Step 3: Commit**

```bash
git add frontend/src/app/dashboard/multiticketing/page.tsx
git commit -m "feat: add multi-ticketing page with dynamic grids and print"
```

---

### Task 9: Integration testing and polish

**Step 1: Start backend and verify endpoints**

Run: `cd /d/workspace/ssmspl/backend && uvicorn app.main:app --reload`

Test in another terminal:
- Login as billing_operator: `curl -X POST http://localhost:8000/api/auth/login -H "Content-Type: application/json" -d '{"username":"billing_operator","password":"Password@123"}'`
- Use the token to call: `curl http://localhost:8000/api/tickets/multi-ticket-init -H "Authorization: Bearer <token>"`
- Verify response has route, branch, items, payment_modes, ferry times, is_off_hours

**Step 2: Start frontend and verify page**

Run: `cd /d/workspace/ssmspl/frontend && npm run dev`

- Navigate to `http://localhost:3000/dashboard/multiticketing`
- Verify sidebar shows "Multi-Ticketing" menu item
- Verify header shows route/branch/date/time
- Verify ticket grid loads with item dropdown populated
- Test adding/removing tickets and items
- Test calculations update in real-time
- Test save & print flow

**Step 3: Run frontend lint**

Run: `cd /d/workspace/ssmspl/frontend && npm run lint`
Expected: No errors.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete multi-ticketing feature with batch API and print"
```

---

## Task Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | RBAC menu items | `backend/app/core/rbac.py` |
| 2 | Backend schemas | `backend/app/schemas/ticket.py` |
| 3 | Init service function | `backend/app/services/ticket_service.py` |
| 4 | Batch create service | `backend/app/services/ticket_service.py` |
| 5 | API endpoints | `backend/app/routers/tickets.py` |
| 6 | Frontend types | `frontend/src/types/index.ts` |
| 7 | Sidebar mapping | `frontend/src/components/Sidebar.tsx` |
| 8 | Multi-ticketing page | `frontend/src/app/dashboard/multiticketing/page.tsx` |
| 9 | Integration testing | All files |
