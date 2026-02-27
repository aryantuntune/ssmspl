# Dashboard Enhancement & Reports System Design

**Date**: 2026-02-26
**Status**: Approved
**Audience**: Admin / Management

## Overview

Two features for the SSMSPL ferry ticketing admin panel:

1. **Dashboard Enhancement** — Transform the static dashboard into a live overview with collection summaries, revenue trends, branch comparisons, and item breakdowns.
2. **Reports System** — Build 8 report types matching the legacy software output, with on-screen table view and server-side PDF generation (ReportLab).

## Part 1: Dashboard Enhancement

### Current State

The dashboard (`/dashboard`) has:
- 4 KPI cards via WebSocket: ticket count, today's revenue, active ferries, active branches
- Recent tickets table (last 5)
- Quick action buttons (role-gated)

### New Sections (added below existing KPIs)

#### 1. Today's Collection Summary
- Total revenue, total tickets
- Breakdown by **branch**: name, ticket count, revenue
- Breakdown by **payment mode**: CASH, GPAY, etc. with counts + amounts
- **New endpoint**: `GET /api/dashboard/today-summary`

#### 2. Revenue Trend Chart
- Bar/line chart: daily revenue for last 7 or 30 days (toggle)
- **Charting library**: Recharts (lightweight, React-native, built on D3)
- **Endpoint**: Existing `GET /api/reports/revenue?grouping=day`

#### 3. Branch-wise Comparison
- Horizontal bar chart or card grid
- Per branch: tickets issued, revenue collected
- **Endpoint**: Existing `GET /api/reports/branch-summary`

#### 4. Top Items / Vehicle-Passenger Split
- Donut chart: vehicle revenue vs passenger revenue
- Table: top 5 items by quantity
- **Endpoint**: Existing `GET /api/reports/item-breakdown`

### Backend Work for Dashboard
- 1 new endpoint: `GET /api/dashboard/today-summary`
- Rest reuses existing report endpoints

---

## Part 2: Reports System

### Architecture

- **Backend**: Data endpoints return JSON. Companion `/pdf` endpoints return `application/pdf` via ReportLab.
- **Frontend**: Reports hub page with report type selector, contextual filters, on-screen table, and "Download PDF" button.

### Report Types

| # | Report | New Endpoint | Filters |
|---|--------|-------------|---------|
| 1 | Date Wise Amount Summary | `GET /api/reports/date-wise-amount[/pdf]` | date_from, date_to, branch_id, payment_mode_id |
| 2 | Ferry Wise Item Summary | `GET /api/reports/ferry-wise-item[/pdf]` | date, branch_id, payment_mode_id |
| 3 | Itemwise Levy Summary | `GET /api/reports/itemwise-levy[/pdf]` | date_from, date_to, branch_id, route_id |
| 4 | Payment Mode Wise Summary | Existing + `/pdf` | date, branch_id |
| 5 | Ticket Details | Existing + `/pdf` | date, branch_id |
| 6 | User Wise Daily Summary | `GET /api/reports/user-wise-summary[/pdf]` | date, branch_id |
| 7 | Vehicle Wise Ticket Details | `GET /api/reports/vehicle-wise-tickets[/pdf]` | date, branch_id |
| 8 | Branch Summary | Existing + `/pdf` | date_from, date_to |

### New Backend Endpoints (data)
- `/api/reports/date-wise-amount` — Daily totals for a date range, per branch/payment mode
- `/api/reports/ferry-wise-item` — Items grouped by departure time for a date
- `/api/reports/itemwise-levy` — Per item: levy rate, quantity, amount for a date range
- `/api/reports/user-wise-summary` — Per operator: daily collection total
- `/api/reports/vehicle-wise-tickets` — Tickets with vehicle numbers

### PDF Generation

- **Library**: ReportLab (pure Python, no system dependencies)
- **Service**: `backend/app/services/pdf_service.py`
- **Format**: Company header (SUVARNADURGA SHIPPING & MARINE SERVICES PVT. LTD.), report title, filter summary, tabular data, totals row
- **Endpoint pattern**: `GET /api/reports/{report-type}/pdf?filters...` → `Content-Type: application/pdf`
- **Role access**: SUPER_ADMIN, ADMIN, MANAGER (same as existing reports)

### PDF Layout (matching legacy)
```
┌──────────────────────────────────────────────┐
│  SUVARNADURGA SHIPPING & MARINE SERVICES     │
│               PVT. LTD.                      │
│                                              │
│  Report Title                                │
│  Filters: Date: X, Branch: Y, Payment: Z    │
│                                              │
│  ┌────────┬──────────┬─────────┬───────────┐ │
│  │ Col 1  │  Col 2   │  Col 3  │   Col 4   │ │
│  ├────────┼──────────┼─────────┼───────────┤ │
│  │ data   │  data    │  data   │   data    │ │
│  │ ...    │  ...     │  ...    │   ...     │ │
│  ├────────┼──────────┼─────────┼───────────┤ │
│  │        │          │  TOTAL  │  XXXXX.00 │ │
│  └────────┴──────────┴─────────┴───────────┘ │
└──────────────────────────────────────────────┘
```

---

## Part 3: Frontend Reports Hub

### Page: `/dashboard/reports` (replaces current ticket listing)

**Layout:**
1. **Report Type Selector** — Tabs or dropdown for the 8 report types
2. **Filter Panel** — Contextual filters per report type:
   - Date range (all)
   - Branch (most)
   - Payment mode (some)
   - Route (itemwise levy)
3. **Results Table** — On-screen tabular display of JSON results
4. **Action Bar** — "Download PDF" button triggers `/pdf` endpoint download

**Flow:**
```
Select report type → Filters update → "Generate" →
  → Fetch JSON data → Render table on screen
  → "Download PDF" → Fetch /pdf endpoint → Browser download
```

### No charts on reports page
Reports are strictly tabular to match legacy format. Charts live on dashboard only.

### Responsive
- Desktop: side filters + table area
- Mobile: stacked filters above table, horizontal scroll

---

## Dependencies

### Backend
- `reportlab` — PDF generation (add to requirements.txt)
- `recharts` — Frontend charting (npm install)

### New Files
- `backend/app/services/pdf_service.py` — PDF generation functions
- `backend/app/routers/report_pdf.py` — PDF download endpoints (or extend existing reports router)
- Extend `backend/app/services/report_service.py` — New query functions
- `frontend/src/app/dashboard/reports/page.tsx` — Redesigned reports hub
- `frontend/src/components/charts/` — Recharts wrapper components for dashboard

---

## Data Availability Assessment

All 8 report types can be built from existing database tables:
- **Tickets + TicketItems** — core data for all reports
- **Branches** — branch names and filtering
- **Items** — item names, levy rates, vehicle flags
- **PaymentModes** — payment mode descriptions
- **Users** — operator names for user-wise summary
- **FerrySchedules** — departure times for ferry-wise grouping
- **ItemRates** — levy rates per route/item
- **Boats** — boat names for ticket details

No schema changes needed. All data exists.
