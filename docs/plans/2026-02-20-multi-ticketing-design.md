# Multi-Ticket Issuing Form — Design Document

**Date:** 2026-02-20
**Feature:** Off-hours batch ticket creation at `/dashboard/multiticketing`

## Purpose

A dedicated form for issuing multiple ferry tickets in a single transaction during off-hours (outside ferry schedule window). Used when the current time is **after the last ferry departure** or **before the first ferry departure** for the user's assigned branch.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Location | New page at `/dashboard/multiticketing` | Keeps existing ticketing list page unchanged |
| Route/Branch source | Logged-in user's assigned `route_id` | Users without route assignment cannot use this form |
| Time window | Off-hours only (outside first↔last ferry schedule) | This is a special facility for after-hours ticketing |
| Payment mode | Per-ticket | Each ticket grid has its own payment mode dropdown |
| Print | Browser `window.print()` | Simple, no backend PDF generation needed |
| Batch save | Single `POST /api/tickets/batch` endpoint | Transactional integrity — all or nothing |
| Access roles | SUPER_ADMIN, ADMIN, MANAGER, BILLING_OPERATOR | Same as regular ticketing |
| Discount | None | Explicitly excluded per spec |

## Backend Changes

### New Schema: `MultiTicketCreate`

```python
class MultiTicketCreate(BaseModel):
    tickets: list[TicketCreate]  # min_length=1
```

Response: list of `TicketRead` for all created tickets.

### New Endpoint: `POST /api/tickets/batch`

- Accepts `MultiTicketCreate`
- Validates off-hours window: queries `FerrySchedule` for the branch, gets min/max departure times, rejects if current time falls between them
- Creates all tickets in a single DB transaction by looping through and reusing `create_ticket()` logic
- Returns all created tickets with enriched data (for print receipts)

### New Endpoint: `GET /api/tickets/multi-ticket-init`

Returns everything needed to populate the form in a single call:

```json
{
  "route_id": 1,
  "route_name": "BranchA - BranchB",
  "branch_id": 1,
  "branch_name": "BranchA",
  "items": [{ "id": 1, "name": "Adult", "short_name": "ADT", "is_vehicle": false, "rate": 150.0, "levy": 10.0 }],
  "payment_modes": [{ "id": 1, "description": "CASH" }],
  "first_ferry_time": "07:00",
  "last_ferry_time": "18:30",
  "is_off_hours": true
}
```

Items include their current rates for the user's route (via `ItemRate` lookup).

### RBAC Update

Add `"Multi-Ticketing"` to `ROLE_MENU_ITEMS` for SUPER_ADMIN, ADMIN, MANAGER, BILLING_OPERATOR.

## Frontend Changes

### New Page: `/dashboard/multiticketing/page.tsx`

**Header Section (read-only):**
- Route name, Branch name (from init API)
- Current Date (system date, formatted)
- Current Time (live clock, updates every second)
- Off-hours status indicator with first/last ferry times

**Ticket Grids Area:**
- Default: one ticket grid on load
- "+ Add Ticket" button adds new grids dynamically
- Each grid is independent with:
  - Payment mode dropdown
  - Items table: Item (dropdown) | Rate | Levy | Qty (input) | Vehicle No (conditional input) | Amount (computed)
  - "Add Item" row button
  - Remove item row button
  - Grid total display
  - Remove ticket button (hidden if only one grid)

**Calculations (real-time):**
- Row amount = (Rate + Levy) × Qty
- Grid total = sum of all row amounts
- Grand total = sum of all grid totals

**Footer:**
- Cancel: resets form, no navigation
- Save & Print: POST batch → on success → render print view → `window.print()` → reset form

### Sidebar Update

Add to `MENU_ROUTES`:
```typescript
"Multi-Ticketing": "/dashboard/multiticketing"
```

### Validation (Frontend)

- At least one ticket grid exists
- Each grid has at least one item with Qty > 0
- Vehicle No required if item.is_vehicle is true
- Payment mode selected per grid
- Form blocked with message if not off-hours

### Validation (Backend)

- Current time must be outside ferry schedule window
- All reference IDs valid (branch, route, items, payment modes)
- Amount cross-checks (computed vs submitted)
- At least one ticket with at least one item

## Data Flow

```
1. Page loads → GET /api/tickets/multi-ticket-init
2. User fills ticket grids, adds items
3. Rate/levy auto-populated from init data (no per-item API calls)
4. User clicks "Save & Print"
5. Frontend builds MultiTicketCreate payload
6. POST /api/tickets/batch
7. Backend validates off-hours, creates all tickets atomically
8. Response: array of TicketRead with items
9. Frontend renders print view → window.print() → reset
```

## Files to Create/Modify

**Backend (create):**
- None — all changes in existing files

**Backend (modify):**
- `app/schemas/ticket.py` — add `MultiTicketCreate`, `MultiTicketInitResponse`
- `app/services/ticket_service.py` — add `create_multi_tickets()`, `get_multi_ticket_init()`
- `app/routers/tickets.py` — add batch and init endpoints
- `app/core/rbac.py` — add "Multi-Ticketing" menu item

**Frontend (create):**
- `src/app/dashboard/multiticketing/page.tsx`

**Frontend (modify):**
- `src/components/Sidebar.tsx` — add route mapping
- `src/types/index.ts` — add `MultiTicketInit` type
