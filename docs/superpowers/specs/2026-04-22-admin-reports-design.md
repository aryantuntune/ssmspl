# Admin Reports — Design Spec

**Date:** 2026-04-22
**Status:** Approved, ready for implementation
**Scope:** Three new statutory reports accessible only on `admin.carferry.online`, matching client-provided PDF formats.

## 1. Goal

Build three production-grade, POS-only reports that reflect the current database state and exactly match the client PDFs in `docs/admin_reports/`:

- **Report A — Itemwise Levy Summary** — matches `L_Mar 26 Bhynder.pdf`
- **Report B — Date Wise Branch Summary (Cash + GPay)** — matches `Vasai Bhynder Mar 26 Cash Memo & GPay.pdf`
- **Report C — Itemwise Daily Collection Charges Summary** — matches `Aud_Mar 26 B.pdf`

All three are read-only aggregations. They must reconcile to the rupee against `tickets.net_amount`.

## 2. Scope decisions

| Decision | Choice | Rationale |
|---|---|---|
| Placement | New "Admin Reports" section, visible only when `NEXT_PUBLIC_ADMIN_PORTAL === "true"` | Keeps the main portal unchanged |
| Data source | POS only (`tickets` + `ticket_items`) | PDF titles say Cash + GPay; spec lists only these tables |
| Access | SUPER_ADMIN + ADMIN (granted via `AdminUserAccess`) | Statutory reports; `ADMIN_PORTAL_MODE` gate already enforces grants |
| Route selector | Required; one route at a time | PDFs show one route pair (e.g. "VASAI + BHAYANDER") |
| Historical edits | Always reflect current state | Adjustment logs and backup tables are ignored |
| Integrity check | Reconcile `SUM(qty × (rate + levy))` vs `SUM(net_amount)` before returning; HTTP 500 on mismatch | Financial correctness > availability |

## 3. Data model reference

- `tickets` — `id, branch_id, route_id, ticket_date, payment_mode_id, net_amount, is_cancelled, …`
- `ticket_items` — `id, ticket_id, item_id, rate, levy, quantity, is_cancelled`
- `items` — `id, name`
- `branches` — `id, name`
- `payment_modes` — `id=1 Cash, id=2 UPI, id=3 Card, id=4 Online`
- `routes` — `id, branch_id_one, branch_id_two`

POS tickets use modes **1 (Cash) / 2 (UPI) / 3 (Card)**. Portal bookings use **4 (Online)** and are excluded from all admin reports.

## 4. Report A — Itemwise Levy Summary

### 4.1 Purpose

"How much levy was collected per item, split across branches on a given route, over a date range."

### 4.2 Endpoint

`GET /api/reports/admin/itemwise-levy-summary?date_from&date_to&route_id`
`GET /api/reports/admin/itemwise-levy-summary/pdf?date_from&date_to&route_id`
`GET /api/reports/admin/itemwise-levy-summary/xlsx?date_from&date_to&route_id`

### 4.3 SQL

```sql
SELECT
  i.id            AS item_id,
  i.name          AS item_name,
  ti.levy         AS levy,
  b.id            AS branch_id,
  b.name          AS branch_name,
  SUM(ti.quantity) AS quantity
FROM ticket_items ti
JOIN tickets  t ON ti.ticket_id = t.id
JOIN items    i ON ti.item_id   = i.id
JOIN branches b ON t.branch_id  = b.id
WHERE t.is_cancelled  = false
  AND ti.is_cancelled = false
  AND ti.quantity > 0
  AND ti.levy > 0                       -- zero-levy items (ambulance, luggage) excluded from display
  AND t.ticket_date BETWEEN :date_from AND :date_to
  AND t.route_id = :route_id
  AND t.payment_mode_id IN (1, 2, 3)   -- POS only
GROUP BY i.id, i.name, ti.levy, b.id, b.name;
```

### 4.4 Python post-processing

1. Pivot rows by `(item_id, levy)` with `branch_quantities: {branch_id: qty}`.
2. For each pivoted row: `total_quantity = sum(branch_quantities.values())`, `amount = levy × total_quantity`.
3. Sort rows alphabetically by `item_name`, then by `levy` ascending.
4. `branch_totals[branch_id] = Σ (branch_quantities[branch_id] × levy)` across all rows.
5. `grand_total = Σ amount`.
6. Integrity check (see §7).

### 4.5 Response contract

```json
{
  "route_label": "VASAI + BHAYANDER",
  "date_from": "2026-03-01",
  "date_to":   "2026-03-31",
  "branches": [
    {"id": 201, "name": "VASAI"},
    {"id": 202, "name": "BHAYANDER"}
  ],
  "rows": [
    {
      "item_id": 2,
      "item_name": "MOTOR CYCLE WITH DRIVER",
      "levy": "6.00",
      "branch_quantities": {"201": 3623, "202": 3505},
      "total_quantity": 7128,
      "amount": "42768.00"
    }
  ],
  "branch_totals": {"201": "61387.00", "202": "54439.00"},
  "grand_total": "115826.00"
}
```

## 5. Report B — Date Wise Branch Summary (Cash + GPay)

### 5.1 Purpose

"Per-date revenue grid: rows = dates, columns = `{branch}-{mode}` where mode ∈ {CASH, GPay}."

### 5.2 Endpoint

`GET /api/reports/admin/date-branch-summary?date_from&date_to&route_id`
`GET /api/reports/admin/date-branch-summary/pdf?date_from&date_to&route_id`
`GET /api/reports/admin/date-branch-summary/xlsx?date_from&date_to&route_id`

### 5.3 SQL

```sql
SELECT
  t.ticket_date,
  t.branch_id,
  b.name            AS branch_name,
  t.payment_mode_id,
  pm.description    AS mode,
  SUM(t.net_amount) AS amount
FROM tickets t
JOIN branches     b  ON t.branch_id       = b.id
JOIN payment_modes pm ON t.payment_mode_id = pm.id
WHERE t.is_cancelled = false
  AND t.net_amount >= 0
  AND t.ticket_date BETWEEN :date_from AND :date_to
  AND t.route_id = :route_id
  AND t.payment_mode_id IN (1, 2)   -- Cash + UPI only
GROUP BY t.ticket_date, t.branch_id, b.name, t.payment_mode_id, pm.description;
```

### 5.4 Python post-processing

1. Build columns in order: for each branch on the route (sorted by `branch_id_one` then `branch_id_two` of the route), append two column keys: `{branch_id}-CASH`, `{branch_id}-GPay`. Labels use branch name (e.g. `BHAYANDER-CASH`). UPI → `GPay`.
2. Build a row for every date in `[date_from, date_to]` (inclusive); missing dates render as `"0.00"` cells.
3. `total` per row = sum of its cells.
4. `column_totals[key] = Σ cells[key]` across rows.
5. `grand_total = Σ column_totals.values()`.
6. Integrity check (see §7, POS Cash+UPI scope).

### 5.5 Response contract

See Section 3 of the main design (already documented in the brainstorm). JSON stringifies Decimals to two-decimal strings.

## 6. Report C — Itemwise Daily Collection Charges Summary

### 6.1 Purpose

"Per-date per-branch item breakdown: for each day in range, for each branch on the route, list item-rate combinations with quantity and `charges × quantity = amount`."

### 6.2 Endpoint

`GET /api/reports/admin/itemwise-daily-charges?date_from&date_to&route_id`
`GET /api/reports/admin/itemwise-daily-charges/pdf?date_from&date_to&route_id`
`GET /api/reports/admin/itemwise-daily-charges/xlsx?date_from&date_to&route_id`

### 6.3 SQL

```sql
SELECT
  t.ticket_date,
  b.id           AS branch_id,
  b.name         AS branch_name,
  i.id           AS item_id,
  i.name         AS item_name,
  ti.rate        AS charges,
  SUM(ti.quantity) AS quantity
FROM ticket_items ti
JOIN tickets  t ON ti.ticket_id = t.id
JOIN items    i ON ti.item_id   = i.id
JOIN branches b ON t.branch_id  = b.id
WHERE t.is_cancelled  = false
  AND ti.is_cancelled = false
  AND ti.quantity > 0
  AND ti.rate >= 0
  AND t.ticket_date BETWEEN :date_from AND :date_to
  AND t.route_id = :route_id
  AND t.payment_mode_id IN (1, 2, 3)
GROUP BY t.ticket_date, b.id, b.name, i.id, i.name, ti.rate
ORDER BY t.ticket_date, b.name, i.name, ti.rate;
```

### 6.4 Python post-processing

1. Nest flat rows: `dates[].branches[].rows[]`, where each row has `{item_name, charges, quantity, amount}` and `amount = charges × quantity`.
2. Per branch: `subtotal = Σ amount`.
3. Per date: `day_total = Σ subtotal`.
4. `grand_total = Σ day_total`.
5. Within a branch, sort rows by `item_name`, then by `charges` ascending (so multi-rate items group together).
6. Integrity check (see §7).

### 6.5 Response contract

See Section 4 of the brainstorm. Nested `dates[] → branches[] → rows[]`.

## 7. Integrity validation

Run **after** computing each report's `grand_total`. Uses the same filter scope.

```python
items_total = await db.scalar(
    select(func.coalesce(func.sum(ti.quantity * (ti.rate + ti.levy)), 0))
    .select_from(ticket_items.join(tickets, ...))
    .where(... same WHERE as the report query, excluding GROUP BY ...)
)
tickets_total = await db.scalar(
    select(func.coalesce(func.sum(t.net_amount), 0))
    .where(... same WHERE on tickets only ...)
)
if abs(Decimal(items_total) - Decimal(tickets_total)) > Decimal("0.01"):
    raise HTTPException(500, detail=f"Integrity check failed: items={items_total}, tickets={tickets_total}")
```

**Scope rules:**
- Report A & C use Cash+UPI+Card (modes 1,2,3).
- Report B uses Cash+UPI only (modes 1,2).

Tolerance = ₹0.01 to absorb Decimal rounding. If the tolerance is tripped, the report is **not** returned — we surface the discrepancy loudly.

## 8. PDF layout

Three generators in `app/services/admin_pdf_service.py`, reusing `reportlab` patterns from `pdf_service.py`:

- **Shared header** — `COMPANY_NAME` centered, route label on line 2, report title line (includes "From DD/MM/YYYY To DD/MM/YYYY"). Existing `_fmt_amount` helper is reused so formatting matches.

- **Report A** — portrait A4. Columns: `Items | Levy | <branch1> | <branch2> | Quantity | Amount`. Totals row shows grand total. Bottom "Summary:" block lists per-branch totals and the grand total.

- **Report B** — landscape A4. Columns: `Date | <BRANCH>-CASH | <BRANCH>-GPay | … | Total`. Last row "Total" shows column totals + grand total.

- **Report C** — portrait A4. One section per date: date header + per-branch sub-tables (Item / Charges / Quantity / Amount) + branch subtotal + route day-total. Page break between dates.

## 9. Security & access

- Router uses `require_roles(SUPER_ADMIN, ADMIN)`.
- `settings.ADMIN_PORTAL_MODE=true` on the admin backend (already configured); this already enforces `AdminUserAccess.is_granted` for ADMIN users at the dependency level.
- Rate limit: `10/minute` on each endpoint (matches existing reports).
- Activity log: every access is logged via `log_activity`. The `action_type` is `REPORT_VIEW` for JSON, `REPORT_PDF` for PDF download, `REPORT_XLSX` for Excel download. Metadata includes `report_type` and `format`.

## 10. Menu & navigation

- **Backend** (`core/rbac.py`): append `"Admin Reports"` to `ROLE_MENU_ITEMS[SUPER_ADMIN]` and `[ADMIN]`. In the route that serves `/api/auth/me` (or wherever menu items are filtered), filter out `"Admin Reports"` when `settings.ADMIN_PORTAL_MODE == false`.
- **Frontend** (`components/Sidebar.tsx`): add `"Admin Reports": "/dashboard/admin-reports"` to `MENU_ROUTES`.
- **New page**: `frontend/src/app/dashboard/admin-reports/page.tsx` — tabbed UI (3 tabs for the 3 reports), shared filters (date range + route), per-report preview table, "Download PDF" and "Download Excel" buttons.

## 11. File inventory

```
backend/app/
  reporting/reports/
    admin_itemwise_levy.py
    admin_date_branch_summary.py
    admin_itemwise_daily_charges.py
  services/
    admin_report_service.py      # orchestrator + integrity
    admin_pdf_service.py         # three PDF generators
    admin_xlsx_service.py        # three Excel (xlsx) generators
  schemas/
    admin_report.py              # Pydantic responses
  routers/
    admin_reports.py             # 9 endpoints (3 JSON + 3 PDF + 3 XLSX)
  core/rbac.py                   # menu update
  routers/auth.py                # menu filter (if needed)

backend/tests/
  test_admin_reports.py          # RBAC + correctness + integrity

frontend/src/
  app/dashboard/admin-reports/
    page.tsx
    components/
      ItemwiseLevyReport.tsx
      DateBranchSummaryReport.tsx
      ItemwiseDailyChargesReport.tsx
  components/Sidebar.tsx         # route mapping

nginx/                           # no changes; admin subdomain already proxies to port 3010
```

## 12. Test plan

1. **Unit**: pure builder functions for each report — synthetic SQL-row input → verified output structure (no DB).
2. **Integration**: seeded test DB with:
   - 2 branches, 1 route, 3 items
   - 3 payment modes (Cash, UPI, Card) — exercise each
   - Multiple tickets per date with mixed rates/levies
   - One cancelled ticket, one cancelled item → verify exclusion
   - One ticket with `net_amount` tampered → verify integrity check raises 500
3. **RBAC**: MANAGER / BILLING_OPERATOR / TICKET_CHECKER → expect 403.
4. **PDF**: generate each PDF, parse back with `pypdf`, assert key totals appear.
5. **Manual**: run against staging with March 2026 data, compare against client PDFs.

## 13. Out of scope

- Portal bookings (can be added later with additional columns).
- Multi-route aggregation (user picks one route at a time).
- Route `route_label` with ferry/boat names ("VAIBHAVI RTN IV 124") — default is `{branch_one.name} + {branch_two.name}`. Ferry-name suffix can be added later if `parameter_master` carries it.
- Scheduling/email delivery — manual download only for the first release.

## 14. Acceptance criteria

- All three endpoints return data that exactly matches the March 2026 PDFs when run against the same dataset.
- Integrity check never passes with wrong data (verified by test that tampers `net_amount`).
- Sidebar link appears only on the admin subdomain for SUPER_ADMIN / granted ADMIN users.
- PDF downloads render identically to the client samples (same columns, totals, summary blocks).
- All tests green: `pytest backend/tests/test_admin_reports.py -v`.
