# Dashboard Enhancement & Reports System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the static admin dashboard into a live data overview and build 8 report types with server-side PDF generation matching the legacy system's output.

**Architecture:** Backend-first approach. New FastAPI endpoints return JSON for on-screen display and PDF via ReportLab for downloads. Frontend enhanced with Recharts for dashboard charts and a new reports hub page. All data queries use existing SQLAlchemy async models — no schema changes needed.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 async, ReportLab (PDF), Recharts (charts), Next.js App Router, Tailwind CSS.

**Design Doc:** `docs/plans/2026-02-26-dashboard-reports-design.md`

---

## Task 1: Add Dependencies

**Files:**
- Modify: `backend/requirements.txt`
- Run: `cd frontend && npm install recharts`

**Step 1: Add ReportLab to backend requirements**

Add to `backend/requirements.txt`:
```
reportlab>=4.0
```

**Step 2: Install backend dependency**

Run: `cd backend && pip install -r requirements.txt`
Expected: reportlab installs successfully

**Step 3: Install Recharts in frontend**

Run: `cd frontend && npm install recharts`
Expected: recharts added to package.json

**Step 4: Commit**

```bash
git add backend/requirements.txt frontend/package.json frontend/package-lock.json
git commit -m "chore: add reportlab and recharts dependencies"
```

---

## Task 2: Backend — Dashboard Today Summary Endpoint

**Files:**
- Modify: `backend/app/services/dashboard_service.py`
- Modify: `backend/app/routers/dashboard.py`
- Create: `backend/app/schemas/dashboard.py`

### Step 1: Create dashboard response schema

Create `backend/app/schemas/dashboard.py`:

```python
from pydantic import BaseModel
from decimal import Decimal


class BranchStat(BaseModel):
    branch_id: int
    branch_name: str
    ticket_count: int
    revenue: Decimal


class PaymentModeStat(BaseModel):
    payment_mode_id: int
    payment_mode_name: str
    ticket_count: int
    revenue: Decimal


class TodaySummaryResponse(BaseModel):
    total_tickets: int
    total_revenue: Decimal
    branches: list[BranchStat]
    payment_modes: list[PaymentModeStat]
```

### Step 2: Add today-summary service function

Add to `backend/app/services/dashboard_service.py`:

```python
async def get_today_summary(db: AsyncSession) -> dict:
    """Get today's collection summary broken down by branch and payment mode."""
    today = date.today()

    # Branch-wise breakdown
    branch_query = (
        select(
            Ticket.branch_id,
            Branch.name.label("branch_name"),
            func.count(Ticket.id).label("ticket_count"),
            func.coalesce(func.sum(
                case((Ticket.is_cancelled == False, Ticket.net_amount), else_=0)
            ), 0).label("revenue"),
        )
        .join(Branch, Ticket.branch_id == Branch.id)
        .where(Ticket.ticket_date == today)
        .group_by(Ticket.branch_id, Branch.name)
    )
    branch_result = await db.execute(branch_query)
    branches = [
        {
            "branch_id": row.branch_id,
            "branch_name": row.branch_name,
            "ticket_count": row.ticket_count,
            "revenue": row.revenue,
        }
        for row in branch_result.all()
    ]

    # Payment-mode-wise breakdown
    pm_query = (
        select(
            Ticket.payment_mode_id,
            PaymentMode.description.label("payment_mode_name"),
            func.count(Ticket.id).label("ticket_count"),
            func.coalesce(func.sum(
                case((Ticket.is_cancelled == False, Ticket.net_amount), else_=0)
            ), 0).label("revenue"),
        )
        .join(PaymentMode, Ticket.payment_mode_id == PaymentMode.id)
        .where(Ticket.ticket_date == today)
        .group_by(Ticket.payment_mode_id, PaymentMode.description)
    )
    pm_result = await db.execute(pm_query)
    payment_modes = [
        {
            "payment_mode_id": row.payment_mode_id,
            "payment_mode_name": row.payment_mode_name,
            "ticket_count": row.ticket_count,
            "revenue": row.revenue,
        }
        for row in pm_result.all()
    ]

    total_tickets = sum(b["ticket_count"] for b in branches)
    total_revenue = sum(b["revenue"] for b in branches)

    return {
        "total_tickets": total_tickets,
        "total_revenue": total_revenue,
        "branches": branches,
        "payment_modes": payment_modes,
    }
```

Required imports to add at top of `dashboard_service.py`:
```python
from sqlalchemy import case
from app.models.branch import Branch
from app.models.payment_mode import PaymentMode
```

### Step 3: Add the endpoint to dashboard router

Add to `backend/app/routers/dashboard.py` (before the WebSocket endpoint):

```python
from app.schemas.dashboard import TodaySummaryResponse

@router.get("/today-summary", response_model=TodaySummaryResponse)
async def get_today_summary(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(
        UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER
    )),
):
    return await dashboard_service.get_today_summary(db)
```

### Step 4: Test manually

Run: `cd backend && uvicorn app.main:app --reload`
Test: `curl http://localhost:8000/api/dashboard/today-summary -H "Authorization: Bearer <token>"`
Expected: JSON with total_tickets, total_revenue, branches[], payment_modes[]

### Step 5: Commit

```bash
git add backend/app/schemas/dashboard.py backend/app/services/dashboard_service.py backend/app/routers/dashboard.py
git commit -m "feat: add dashboard today-summary endpoint with branch and payment mode breakdown"
```

---

## Task 3: Backend — New Report Data Endpoints

**Files:**
- Modify: `backend/app/services/report_service.py` — add 5 new query functions
- Modify: `backend/app/schemas/report.py` — add response models
- Modify: `backend/app/routers/reports.py` — add 5 new endpoints

### Step 1: Add response schemas

Add to `backend/app/schemas/report.py`:

```python
# --- Date Wise Amount Summary ---
class DateWiseAmountRow(BaseModel):
    ticket_date: date
    amount: Decimal

class DateWiseAmountReport(BaseModel):
    date_from: date
    date_to: date
    branch_name: str | None = None
    payment_mode_name: str | None = None
    rows: list[DateWiseAmountRow]
    grand_total: Decimal


# --- Ferry Wise Item Summary ---
class FerryWiseItemRow(BaseModel):
    departure: str  # time formatted as "7:30 am"
    item_name: str
    quantity: int

class FerryWiseItemReport(BaseModel):
    report_date: date
    branch_name: str | None = None
    rows: list[FerryWiseItemRow]


# --- Itemwise Levy Summary ---
class ItemwiseLevyRow(BaseModel):
    item_name: str
    levy: Decimal
    quantity: int
    amount: Decimal
    # Optional branch-wise breakdown (for routes with 2 branches)
    branch_quantities: dict[str, int] | None = None

class ItemwiseLevyReport(BaseModel):
    date_from: date
    date_to: date
    branch_name: str | None = None
    route_name: str | None = None
    rows: list[ItemwiseLevyRow]
    grand_total: Decimal


# --- User Wise Daily Summary ---
class UserWiseSummaryRow(BaseModel):
    user_name: str
    amount: Decimal

class UserWiseSummaryReport(BaseModel):
    report_date: date
    rows: list[UserWiseSummaryRow]
    grand_total: Decimal


# --- Vehicle Wise Ticket Details ---
class VehicleWiseTicketRow(BaseModel):
    ticket_date: date
    ticket_no: int
    boat_name: str | None = None
    departure: str | None = None
    payment_mode: str
    amount: Decimal
    vehicle_no: str | None = None

class VehicleWiseTicketReport(BaseModel):
    report_date: date
    branch_name: str | None = None
    rows: list[VehicleWiseTicketRow]
    grand_total: Decimal
```

### Step 2: Add service functions to `report_service.py`

Add these 5 functions at the bottom of `backend/app/services/report_service.py`:

```python
async def get_date_wise_amount(
    db: AsyncSession,
    date_from: date,
    date_to: date,
    branch_id: int | None = None,
    payment_mode_id: int | None = None,
) -> dict:
    """Daily revenue totals for a date range, optionally filtered by branch and payment mode."""
    query = (
        select(
            Ticket.ticket_date,
            func.coalesce(func.sum(
                case((Ticket.is_cancelled == False, Ticket.net_amount), else_=0)
            ), 0).label("amount"),
        )
        .where(Ticket.ticket_date >= date_from, Ticket.ticket_date <= date_to)
        .group_by(Ticket.ticket_date)
        .order_by(Ticket.ticket_date)
    )
    if branch_id:
        query = query.where(Ticket.branch_id == branch_id)
    if payment_mode_id:
        query = query.where(Ticket.payment_mode_id == payment_mode_id)

    result = await db.execute(query)
    rows = [{"ticket_date": r.ticket_date, "amount": r.amount} for r in result.all()]
    grand_total = sum(r["amount"] for r in rows)

    # Resolve names for display
    branch_name = None
    if branch_id:
        br = await db.execute(select(Branch.name).where(Branch.id == branch_id))
        branch_name = br.scalar_one_or_none()

    pm_name = None
    if payment_mode_id:
        pm = await db.execute(select(PaymentMode.description).where(PaymentMode.id == payment_mode_id))
        pm_name = pm.scalar_one_or_none()

    return {
        "date_from": date_from,
        "date_to": date_to,
        "branch_name": branch_name,
        "payment_mode_name": pm_name,
        "rows": rows,
        "grand_total": grand_total,
    }


async def get_ferry_wise_item_summary(
    db: AsyncSession,
    report_date: date,
    branch_id: int | None = None,
    payment_mode_id: int | None = None,
) -> dict:
    """Items sold grouped by departure time for a single date."""
    query = (
        select(
            Ticket.departure,
            Item.name.label("item_name"),
            func.sum(TicketItem.quantity).label("quantity"),
        )
        .join(TicketItem, Ticket.id == TicketItem.ticket_id)
        .join(Item, TicketItem.item_id == Item.id)
        .where(
            Ticket.ticket_date == report_date,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
        )
        .group_by(Ticket.departure, Item.name)
        .order_by(Ticket.departure, Item.name)
    )
    if branch_id:
        query = query.where(Ticket.branch_id == branch_id)
    if payment_mode_id:
        query = query.where(Ticket.payment_mode_id == payment_mode_id)

    result = await db.execute(query)
    rows = []
    for r in result.all():
        dep_str = r.departure.strftime("%-I:%M %p").lower() if r.departure else "N/A"
        rows.append({
            "departure": dep_str,
            "item_name": r.item_name,
            "quantity": r.quantity,
        })

    branch_name = None
    if branch_id:
        br = await db.execute(select(Branch.name).where(Branch.id == branch_id))
        branch_name = br.scalar_one_or_none()

    return {
        "report_date": report_date,
        "branch_name": branch_name,
        "rows": rows,
    }


async def get_itemwise_levy_summary(
    db: AsyncSession,
    date_from: date,
    date_to: date,
    branch_id: int | None = None,
    route_id: int | None = None,
) -> dict:
    """Per item category: levy rate, total quantity, total amount for a date range."""
    query = (
        select(
            Item.name.label("item_name"),
            TicketItem.levy,
            func.sum(TicketItem.quantity).label("quantity"),
            func.sum(TicketItem.quantity * TicketItem.levy).label("amount"),
        )
        .join(TicketItem, Ticket.id == TicketItem.ticket_id)
        .join(Item, TicketItem.item_id == Item.id)
        .where(
            Ticket.ticket_date >= date_from,
            Ticket.ticket_date <= date_to,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
        )
        .group_by(Item.name, TicketItem.levy)
        .order_by(Item.name)
    )
    if branch_id:
        query = query.where(Ticket.branch_id == branch_id)
    if route_id:
        query = query.where(Ticket.route_id == route_id)

    result = await db.execute(query)
    rows = [
        {
            "item_name": r.item_name,
            "levy": r.levy,
            "quantity": r.quantity,
            "amount": r.amount,
        }
        for r in result.all()
    ]
    grand_total = sum(r["amount"] for r in rows)

    branch_name = None
    if branch_id:
        br = await db.execute(select(Branch.name).where(Branch.id == branch_id))
        branch_name = br.scalar_one_or_none()

    route_name = None
    if route_id:
        route_map = await _get_route_name_map(db)
        route_name = route_map.get(route_id)

    return {
        "date_from": date_from,
        "date_to": date_to,
        "branch_name": branch_name,
        "route_name": route_name,
        "rows": rows,
        "grand_total": grand_total,
    }


async def get_user_wise_summary(
    db: AsyncSession,
    report_date: date,
    branch_id: int | None = None,
) -> dict:
    """Per operator: total collection for a date."""
    # Tickets are created by users; we need the created_by field from audit mixin
    # The Ticket model inherits AuditMixin which has created_by (user UUID)
    query = (
        select(
            User.full_name.label("user_name"),
            func.coalesce(func.sum(
                case((Ticket.is_cancelled == False, Ticket.net_amount), else_=0)
            ), 0).label("amount"),
        )
        .join(User, Ticket.created_by == User.id)
        .where(Ticket.ticket_date == report_date)
        .group_by(User.full_name)
        .order_by(User.full_name)
    )
    if branch_id:
        query = query.where(Ticket.branch_id == branch_id)

    result = await db.execute(query)
    rows = [{"user_name": r.user_name, "amount": r.amount} for r in result.all()]
    grand_total = sum(r["amount"] for r in rows)

    return {
        "report_date": report_date,
        "rows": rows,
        "grand_total": grand_total,
    }


async def get_vehicle_wise_tickets(
    db: AsyncSession,
    report_date: date,
    branch_id: int | None = None,
) -> dict:
    """Ticket details with vehicle numbers for a date."""
    query = (
        select(
            Ticket.ticket_date,
            Ticket.ticket_no,
            Boat.name.label("boat_name"),
            Ticket.departure,
            PaymentMode.description.label("payment_mode"),
            TicketItem.rate,
            TicketItem.levy,
            TicketItem.quantity,
            TicketItem.vehicle_no,
        )
        .join(TicketItem, Ticket.id == TicketItem.ticket_id)
        .outerjoin(Boat, Ticket.boat_id == Boat.id)
        .join(PaymentMode, Ticket.payment_mode_id == PaymentMode.id)
        .where(
            Ticket.ticket_date == report_date,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
        )
        .order_by(Ticket.ticket_no, TicketItem.id)
    )
    if branch_id:
        query = query.where(Ticket.branch_id == branch_id)

    result = await db.execute(query)
    rows = []
    for r in result.all():
        dep_str = r.departure.strftime("%-I:%M %p").lower() if r.departure else None
        amount = r.quantity * (r.rate + r.levy)
        rows.append({
            "ticket_date": r.ticket_date,
            "ticket_no": r.ticket_no,
            "boat_name": r.boat_name,
            "departure": dep_str,
            "payment_mode": r.payment_mode,
            "amount": amount,
            "vehicle_no": r.vehicle_no,
        })

    grand_total = sum(r["amount"] for r in rows)

    branch_name = None
    if branch_id:
        br = await db.execute(select(Branch.name).where(Branch.id == branch_id))
        branch_name = br.scalar_one_or_none()

    return {
        "report_date": report_date,
        "branch_name": branch_name,
        "rows": rows,
        "grand_total": grand_total,
    }
```

Required imports to add at top of `report_service.py` (if not already present):
```python
from app.models.item import Item
from app.models.ticket import TicketItem
from app.models.boat import Boat
from app.models.user import User
from app.models.payment_mode import PaymentMode
from app.models.branch import Branch
```

### Step 3: Add router endpoints

Add to `backend/app/routers/reports.py`:

```python
from app.schemas.report import (
    DateWiseAmountReport, FerryWiseItemReport, ItemwiseLevyReport,
    UserWiseSummaryReport, VehicleWiseTicketReport,
)

@router.get("/date-wise-amount", response_model=DateWiseAmountReport)
async def get_date_wise_amount(
    date_from: date = Query(...),
    date_to: date = Query(...),
    branch_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(
        UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER
    )),
):
    return await report_service.get_date_wise_amount(db, date_from, date_to, branch_id, payment_mode_id)


@router.get("/ferry-wise-item", response_model=FerryWiseItemReport)
async def get_ferry_wise_item(
    report_date: date = Query(..., alias="date"),
    branch_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(
        UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER
    )),
):
    return await report_service.get_ferry_wise_item_summary(db, report_date, branch_id, payment_mode_id)


@router.get("/itemwise-levy", response_model=ItemwiseLevyReport)
async def get_itemwise_levy(
    date_from: date = Query(...),
    date_to: date = Query(...),
    branch_id: int | None = Query(None),
    route_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(
        UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER
    )),
):
    return await report_service.get_itemwise_levy_summary(db, date_from, date_to, branch_id, route_id)


@router.get("/user-wise-summary", response_model=UserWiseSummaryReport)
async def get_user_wise_summary(
    report_date: date = Query(..., alias="date"),
    branch_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(
        UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER
    )),
):
    return await report_service.get_user_wise_summary(db, report_date, branch_id)


@router.get("/vehicle-wise-tickets", response_model=VehicleWiseTicketReport)
async def get_vehicle_wise_tickets(
    report_date: date = Query(..., alias="date"),
    branch_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(
        UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER
    )),
):
    return await report_service.get_vehicle_wise_tickets(db, report_date, branch_id)
```

### Step 4: Verify server starts

Run: `cd backend && uvicorn app.main:app --reload`
Expected: Server starts without import errors

### Step 5: Commit

```bash
git add backend/app/schemas/report.py backend/app/services/report_service.py backend/app/routers/reports.py
git commit -m "feat: add 5 new report data endpoints (date-wise, ferry-wise, levy, user-wise, vehicle-wise)"
```

---

## Task 4: Backend — PDF Generation Service

**Files:**
- Create: `backend/app/services/pdf_service.py`

### Step 1: Create the PDF service with company header template

Create `backend/app/services/pdf_service.py` with a base template and generator functions for all 8 report types. The service uses ReportLab to generate PDFs matching the legacy system format.

Key elements of each PDF:
- **Company header**: "SUVARNADURGA SHIPPING & MARINE SERVICES PVT. LTD." centered at top
- **Report title**: Report name + filter summary (date range, branch, payment mode)
- **Data table**: Column headers + data rows + totals row at bottom
- **Page format**: A4 landscape or portrait depending on column count

The PDF service should contain:

```python
from io import BytesIO
from decimal import Decimal
from datetime import date
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.units import mm, cm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_RIGHT


COMPANY_NAME = "SUVARNADURGA SHIPPING & MARINE SERVICES PVT. LTD."


def _get_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        name="CompanyHeader",
        parent=styles["Heading1"],
        fontSize=14,
        alignment=TA_CENTER,
        spaceAfter=2 * mm,
    ))
    styles.add(ParagraphStyle(
        name="ReportTitle",
        parent=styles["Heading2"],
        fontSize=11,
        alignment=TA_CENTER,
        spaceAfter=4 * mm,
    ))
    styles.add(ParagraphStyle(
        name="CellRight",
        parent=styles["Normal"],
        fontSize=8,
        alignment=TA_RIGHT,
    ))
    return styles


def _build_pdf(title: str, subtitle: str, headers: list[str], rows: list[list], col_widths: list | None = None, landscape_mode: bool = False) -> BytesIO:
    """Generic PDF builder with company header, title, table."""
    buf = BytesIO()
    pagesize = landscape(A4) if landscape_mode else A4
    doc = SimpleDocTemplate(buf, pagesize=pagesize, topMargin=1.5 * cm, bottomMargin=1.5 * cm)
    styles = _get_styles()

    elements = []
    elements.append(Paragraph(COMPANY_NAME, styles["CompanyHeader"]))
    elements.append(Paragraph(title, styles["ReportTitle"]))
    if subtitle:
        elements.append(Paragraph(subtitle, styles["Normal"]))
        elements.append(Spacer(1, 4 * mm))

    # Build table
    table_data = [headers] + rows
    table = Table(table_data, colWidths=col_widths, repeatRows=1)
    table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#333333")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTSIZE", (0, 1), (-1, -1), 8),
        ("ALIGN", (0, 0), (-1, 0), "CENTER"),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f5f5f5")]),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements.append(table)

    doc.build(elements)
    buf.seek(0)
    return buf
```

Then add one generator function per report type:

1. `generate_date_wise_amount_pdf(data: dict) -> BytesIO`
2. `generate_ferry_wise_item_pdf(data: dict) -> BytesIO`
3. `generate_itemwise_levy_pdf(data: dict) -> BytesIO`
4. `generate_payment_mode_pdf(data: dict) -> BytesIO`
5. `generate_ticket_details_pdf(tickets: list, branch_name: str, report_date: date) -> BytesIO`
6. `generate_user_wise_summary_pdf(data: dict) -> BytesIO`
7. `generate_vehicle_wise_tickets_pdf(data: dict) -> BytesIO`
8. `generate_branch_summary_pdf(data: dict) -> BytesIO`

Each function calls `_build_pdf()` with the appropriate headers, rows (formatted as strings/amounts), and column widths. The totals row should be bolded.

### Step 2: Verify PDF generation works

Run a quick test in Python shell:
```python
from app.services.pdf_service import _build_pdf
pdf = _build_pdf("Test Report", "Subtitle", ["Col1", "Col2"], [["a", "b"]])
print(f"PDF size: {len(pdf.read())} bytes")
```
Expected: Non-zero byte output

### Step 3: Commit

```bash
git add backend/app/services/pdf_service.py
git commit -m "feat: add PDF generation service with ReportLab for all 8 report types"
```

---

## Task 5: Backend — PDF Download Endpoints

**Files:**
- Modify: `backend/app/routers/reports.py` — add `/pdf` companion endpoints

### Step 1: Add PDF endpoints

For each of the 8 report types, add a `/pdf` endpoint that:
1. Calls the same service function to get data
2. Passes data to the PDF generator
3. Returns `StreamingResponse` with `content-type: application/pdf`

Pattern for each endpoint:

```python
from fastapi.responses import StreamingResponse
from app.services import pdf_service

@router.get("/date-wise-amount/pdf")
async def get_date_wise_amount_pdf(
    date_from: date = Query(...),
    date_to: date = Query(...),
    branch_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_roles(
        UserRole.SUPER_ADMIN, UserRole.ADMIN, UserRole.MANAGER
    )),
):
    data = await report_service.get_date_wise_amount(db, date_from, date_to, branch_id, payment_mode_id)
    pdf_buf = pdf_service.generate_date_wise_amount_pdf(data)
    return StreamingResponse(
        pdf_buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=date_wise_amount_{date_from}_{date_to}.pdf"},
    )
```

Add similar endpoints for all 8 report types:
- `GET /api/reports/date-wise-amount/pdf`
- `GET /api/reports/ferry-wise-item/pdf`
- `GET /api/reports/itemwise-levy/pdf`
- `GET /api/reports/payment-mode/pdf`
- `GET /api/reports/ticket-details/pdf`
- `GET /api/reports/user-wise-summary/pdf`
- `GET /api/reports/vehicle-wise-tickets/pdf`
- `GET /api/reports/branch-summary/pdf`

**Note for ticket-details/pdf**: This reuses the existing ticket listing service (`ticket_service.get_all_tickets`) with branch/date filters, then passes to `pdf_service.generate_ticket_details_pdf()`.

### Step 2: Verify a PDF endpoint works

Run server and test:
```bash
curl -o test.pdf "http://localhost:8000/api/reports/date-wise-amount/pdf?date_from=2026-02-01&date_to=2026-02-26" -H "Authorization: Bearer <token>"
```
Expected: PDF file downloaded, opens correctly

### Step 3: Commit

```bash
git add backend/app/routers/reports.py
git commit -m "feat: add PDF download endpoints for all 8 report types"
```

---

## Task 6: Frontend — Dashboard Enhancement

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx`
- Create: `frontend/src/components/charts/RevenueChart.tsx`
- Create: `frontend/src/components/charts/BranchComparisonChart.tsx`
- Create: `frontend/src/components/charts/ItemSplitChart.tsx`

### Step 1: Create RevenueChart component

Create `frontend/src/components/charts/RevenueChart.tsx`:

A Recharts `BarChart` component that:
- Accepts `data: { period: string, total_revenue: number }[]`
- Shows bars for daily revenue
- X-axis: dates, Y-axis: revenue amount
- Tooltip on hover showing exact amount
- Responsive container

### Step 2: Create BranchComparisonChart component

Create `frontend/src/components/charts/BranchComparisonChart.tsx`:

A Recharts horizontal `BarChart` that:
- Accepts `data: { branch_name: string, ticket_count: number, total_revenue: number }[]`
- Shows branch names on Y-axis, revenue bars on X-axis
- Color-coded bars

### Step 3: Create ItemSplitChart component

Create `frontend/src/components/charts/ItemSplitChart.tsx`:

A Recharts `PieChart`/donut that:
- Accepts `data: { item_name: string, is_vehicle: boolean, total_revenue: number }[]`
- Groups into "Vehicle" vs "Passenger" segments
- Shows legend + percentage labels

### Step 4: Enhance dashboard page

Modify `frontend/src/app/dashboard/page.tsx` to add 4 new sections below existing content:

1. **Today's Collection Summary** section:
   - Fetch from `/api/dashboard/today-summary` on mount
   - Show total revenue + total tickets prominently
   - Two mini tables: branch breakdown, payment mode breakdown

2. **Revenue Trend** section:
   - Fetch from `/api/reports/revenue?date_from={7daysAgo}&date_to={today}&grouping=day`
   - Render `<RevenueChart />` with toggle for 7d / 30d

3. **Branch Comparison** section:
   - Fetch from `/api/reports/branch-summary?date_from={monthStart}&date_to={today}`
   - Render `<BranchComparisonChart />`

4. **Top Items** section:
   - Fetch from `/api/reports/item-breakdown?date_from={monthStart}&date_to={today}`
   - Render `<ItemSplitChart />` + top 5 items table

All sections should:
- Be gated by user's `menu_items` (only show to users with "Reports" permission)
- Have loading skeletons
- Handle empty data gracefully with "No data" message
- Use responsive grid layout

### Step 5: Verify

Run: `cd frontend && npm run dev`
Navigate to `/dashboard`, verify new sections render with data.

### Step 6: Commit

```bash
git add frontend/src/components/charts/ frontend/src/app/dashboard/page.tsx
git commit -m "feat: enhance dashboard with collection summary, revenue chart, branch comparison, item breakdown"
```

---

## Task 7: Frontend — Reports Hub Page

**Files:**
- Rewrite: `frontend/src/app/dashboard/reports/page.tsx`

### Step 1: Redesign reports page

Replace the current ticket-listing-only page with a reports hub that:

1. **Report Type Selector** — Tab group or dropdown with 8 report types:
   - Date Wise Amount Summary
   - Ferry Wise Item Summary
   - Itemwise Levy Summary
   - Payment Mode Wise Summary
   - Ticket Details
   - User Wise Daily Summary
   - Vehicle Wise Ticket Details
   - Branch Summary

2. **Filter Panel** — Renders contextual filters based on selected report type:
   - **All reports**: Date range picker (date_from, date_to) or single date
   - **Most reports**: Branch dropdown (from `/api/branches/`)
   - **Some reports**: Payment mode dropdown (from `/api/payment-modes/`)
   - **Itemwise levy**: Route dropdown (from `/api/routes/`)

3. **Generate Button** — Fetches JSON from the data endpoint and displays in table

4. **Results Table** — Dynamic columns based on report type:
   - Each report type maps to a column definition array
   - Totals row at bottom

5. **Download PDF Button** — Calls the `/pdf` endpoint with same filters:
   ```typescript
   const downloadPdf = async () => {
     const params = new URLSearchParams(filterParams);
     const response = await api.get(`/reports/${reportType}/pdf?${params}`, {
       responseType: 'blob',
     });
     const url = window.URL.createObjectURL(new Blob([response.data]));
     const link = document.createElement('a');
     link.href = url;
     link.download = `${reportType}_report.pdf`;
     link.click();
   };
   ```

### Step 2: Define report type configs

Create a config object mapping each report type to:
- `label`: Display name
- `endpoint`: API path
- `pdfEndpoint`: PDF API path
- `filters`: Which filters to show (date_range | single_date, branch, payment_mode, route)
- `columns`: Table column definitions

### Step 3: Verify

Run: `cd frontend && npm run dev`
Navigate to `/dashboard/reports`:
- Select each report type and verify filters update
- Generate a report and verify table renders
- Download PDF and verify it opens correctly

### Step 4: Run lint

Run: `cd frontend && npm run lint`
Expected: No errors

### Step 5: Commit

```bash
git add frontend/src/app/dashboard/reports/page.tsx
git commit -m "feat: redesign reports page as hub with 8 report types, filters, and PDF download"
```

---

## Task 8: Final Verification & Cleanup

### Step 1: Run backend tests

Run: `cd backend && pytest tests/ -v`
Expected: All existing tests pass (new endpoints don't break anything)

### Step 2: Run frontend build

Run: `cd frontend && npm run build`
Expected: Build succeeds with no errors

### Step 3: Test all PDF downloads

Manually test each of the 8 PDF endpoints through the reports page:
1. Date Wise Amount Summary — date range, verify daily totals + grand total
2. Ferry Wise Item Summary — single date, verify items grouped by departure
3. Itemwise Levy Summary — date range, verify levy/qty/amount per item
4. Payment Mode Wise Summary — single date, verify per-mode breakdown
5. Ticket Details — single date + branch, verify full ticket listing
6. User Wise Daily Summary — single date, verify per-operator totals
7. Vehicle Wise Ticket Details — single date, verify vehicle numbers shown
8. Branch Summary — date range, verify per-branch revenue/tickets

### Step 4: Final commit

```bash
git add -A
git commit -m "feat: complete dashboard enhancement and reports system with PDF generation"
```
