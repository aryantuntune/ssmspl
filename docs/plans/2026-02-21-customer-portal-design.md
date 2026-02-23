# Customer Portal Completion -- Design Document

**Date:** 2026-02-21
**Status:** Approved

## Overview

Complete the customer portal for production: backend booking APIs, QR code generation, email confirmations, capacity enforcement, and frontend redesign to match clean API contracts.

## Decisions

- **Payment gateway**: Deferred. Bookings set to CONFIRMED immediately. Hook point left for Razorpay integration later.
- **QR codes**: Yes. Generate a UUID `verification_code` per booking, encode as QR.
- **Email**: Yes. Send booking confirmation via async SMTP.
- **Capacity**: Yes. Enforce per-departure limits via `ferry_schedules.capacity`.
- **Frontend**: Redesign both sides for a clean API contract.
- **Discount**: Always 0 for portal bookings. Not exposed to customers.

## Database Changes Required

### `bookings` table -- add columns

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `status` | `VARCHAR(20) NOT NULL` | `'CONFIRMED'` | Lifecycle: PENDING, CONFIRMED, CANCELLED, COMPLETED |
| `verification_code` | `UUID` | `uuid_generate_v4()` | Unique code for QR and ticket verification |

### `ferry_schedules` table -- add column

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `capacity` | `INTEGER` | `0` | Max passengers per departure. 0 = unlimited |

## API Design

### Public Booking Data -- `/api/booking/...` (portal auth required)

| Method | Endpoint | Purpose | Response Shape |
|--------|----------|---------|----------------|
| GET | `/api/booking/to-branches/{branch_id}` | Destination branches for a departure | `[{id, name}]` |
| GET | `/api/booking/items/{branch_id}/{to_branch_id}` | Online-visible items with rates for route | `[{id, name, short_name, is_vehicle, rate, levy}]` |
| GET | `/api/booking/schedules/{branch_id}` | Ferry departure times | `[{schedule_time}]` |
| GET | `/api/booking/item-rate/{item_id}/{route_id}` | Rate lookup for a specific item+route | `{rate, levy}` |

### Portal Bookings -- `/api/portal/bookings/...` (portal auth required)

| Method | Endpoint | Purpose |
|--------|----------|---------|
| POST | `/api/portal/bookings` | Create booking |
| GET | `/api/portal/bookings` | List user's bookings (paginated) |
| GET | `/api/portal/bookings/{id}` | Single booking detail |
| POST | `/api/portal/bookings/{id}/cancel` | Cancel a booking |
| GET | `/api/portal/bookings/{id}/qr` | QR code PNG image |

### Create Booking Payload

```json
{
  "from_branch_id": 1,
  "to_branch_id": 2,
  "travel_date": "2026-02-21",
  "departure": "09:30",
  "items": [
    {"item_id": 3, "quantity": 2, "vehicle_no": null}
  ]
}
```

### Create Booking Response

```json
{
  "id": 101,
  "booking_no": 42,
  "status": "CONFIRMED",
  "verification_code": "a1b2c3d4-...",
  "branch_id": 1,
  "branch_name": "Dighi",
  "route_id": 1,
  "route_name": "Dighi - Agardanda",
  "travel_date": "2026-02-21",
  "departure": "09:30",
  "amount": 150.00,
  "discount": 0,
  "net_amount": 150.00,
  "portal_user_id": 5,
  "is_cancelled": false,
  "items": [
    {
      "id": 1,
      "item_id": 3,
      "item_name": "Adult Passenger",
      "rate": 50.00,
      "levy": 25.00,
      "quantity": 2,
      "vehicle_no": null,
      "amount": 150.00
    }
  ]
}
```

### List Bookings Response

```json
{
  "data": [
    {
      "id": 101,
      "booking_no": 42,
      "status": "CONFIRMED",
      "branch_name": "Dighi",
      "route_name": "Dighi - Agardanda",
      "travel_date": "2026-02-21",
      "departure": "09:30",
      "net_amount": 150.00,
      "is_cancelled": false,
      "created_at": "2026-02-21T10:30:00Z",
      "items": [
        {"item_name": "Adult Passenger", "quantity": 2}
      ]
    }
  ],
  "total": 25,
  "page": 1,
  "page_size": 10,
  "total_pages": 3
}
```

## Booking Creation Logic

Mirrors admin ticket creation (`ticket_service.create_ticket`) with these differences:

1. No discount (always 0, `amount == net_amount`)
2. Route derived from `from_branch_id` + `to_branch_id` (find route connecting them)
3. `portal_user_id` set from authenticated portal user
4. `last_booking_no` incremented on branch (already exists)
5. Server-side amount calculation only -- no client-submitted amounts trusted
6. `verification_code` generated as UUID
7. Status set to `CONFIRMED` (payment deferred)
8. Capacity check before creation
9. Only items with `online_visibility=true` allowed

### Server-side flow

```
1. Validate from_branch_id, to_branch_id exist and are active
2. Find route connecting the two branches (either direction)
3. Validate travel_date >= today
4. Validate departure time in ferry_schedules for branch
5. Check capacity (count existing bookings for branch+date+departure vs schedule capacity)
6. For each item:
   a. Validate item exists, is_active=true, online_visibility=true
   b. Look up current rate via get_current_rate(item_id, route_id)
7. Compute amount = sum(qty * (rate + levy))
8. Set discount=0, net_amount=amount
9. Lock branch row, increment last_booking_no
10. Generate verification_code (UUID)
11. Insert booking + booking_items
12. Send confirmation email (async, non-blocking)
13. Return enriched booking
```

## Email Integration

- Library: `aiosmtplib` (async SMTP)
- Config: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`
- Send after booking creation (fire-and-forget, don't block response)
- HTML template with: booking reference, route, date/time, items table, total amount

## QR Code

- Library: `qrcode` (Python)
- Encode: `verification_code` UUID string
- Endpoint returns PNG image (`Content-Type: image/png`)
- Only available for CONFIRMED bookings

## Capacity Enforcement

- Before booking creation, query: count of non-cancelled booking_items (passenger-type) for same branch_id + travel_date + departure
- Compare against `ferry_schedules.capacity` for that branch_id + departure time
- If capacity > 0 and would be exceeded: HTTP 400 "Ferry is fully booked"
- Capacity 0 = unlimited (backwards compatible)

## Frontend Changes

### Dashboard (booking form)
- Item selection uses `item_id` (not `item_rate_id`)
- Rate lookup via `GET /api/booking/item-rate/{item_id}/{route_id}` after both branches and item selected
- Submission payload: `{from_branch_id, to_branch_id, travel_date, departure, items: [{item_id, quantity, vehicle_no}]}`
- Remove `ferry_boat_id` from flow

### History page
- Update to new paginated response shape: `{data, total, page, page_size, total_pages}`
- Display: booking_no as reference, status badge, route_name, travel_date, departure, net_amount
- Wire QR button to open QR modal

### Detail page
- Update to new single-booking response shape
- Wire "Show QR Code" to fetch and display QR PNG
- Wire "Download Ticket" to browser print of styled ticket view

## New Backend Files

| File | Purpose |
|------|---------|
| `routers/booking.py` | Public booking data endpoints |
| `routers/portal_bookings.py` | Portal booking CRUD endpoints |
| `services/booking_service.py` | All booking business logic |
| `services/email_service.py` | Async email sending |
| `services/qr_service.py` | QR code generation |
| `schemas/booking.py` | Updated with BookingCreate, BookingListResponse, etc. |

## New Dependencies

| Package | Purpose |
|---------|---------|
| `aiosmtplib` | Async SMTP for emails |
| `qrcode[pil]` | QR code generation |
