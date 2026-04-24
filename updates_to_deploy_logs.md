# Deployment Logs

---

## Deployment Update — 2026-04-24 (Ferry master: route assignment + ferry name on receipts)

### Module

Backend — Boats model/service/router/schema, Reports (vehicle-wise filter); Frontend — Ferries master page, Receipt template; DDL; Seed

### Changes

**Feature — Per-route ferry assignment**

The `boats.branch_id` column (added in March but never wired into the ORM model or any business logic — verified on production: 0 rows had it set) has been replaced with `boats.route_id`. A ferry runs between two ports (a route corridor like "VESHVI-BAGMANDALE"), not at a single branch, so `route_id` is the natural model. All 12 production ferries have been mapped to their operating routes per the official `data/Ferry location details 30.03.2026.pdf`:

| Boats | Route | Pair |
|-------|-------|------|
| SHANTADURGA, AVANTIKA, JANHVI | 2 | VESHVI - BAGMANDALE |
| SONIA, VAIBHAVI | 5 | BHAYANDER - VASAI |
| PRIYANKA, SUPRIYA, DEVIKA | 1 | DABHOL - DHOPAVE |
| AISHWARYA | 4 | AGARDANDA - DIGHI |
| ISHWARI | 3 | JAIGAD - TAVSAL |
| AAROHI, GIRIJA | 7 | VIRAR - SAFALE |

The Ferries master page (`/dashboard/ferries`) now shows the operating route in the table, allows filtering by route, and offers a route selector in the create/edit modal.

**Improvement — Ferry name on printed receipts**

`ReceiptData` now includes an optional `ferryName` field. When a ticket has a `boat_id` set, the printed receipt shows a "FERRY: <name>" line under the route line. Receipts for tickets without a boat assignment render exactly as before (no extra line), so this is fully backward-compatible.

**Improvement — Boat filter on Vehicle Wise Tickets report**

`/api/reports/vehicle-wise-tickets` and its PDF variant now accept an optional `boat_id` query parameter so the report can be drilled down to a single ferry.

**Data integrity — Ferry registration numbers normalized**

Production previously stored abbreviated boat numbers (e.g. `RTN-IV-001`) that didn't match the official Maharashtra Maritime Board registry. The seed file is now the source of truth and aligns to the PDF (e.g. `RTN-IV-03-00001`).

### Files Modified

| File | Change |
|------|--------|
| `backend/app/models/boat.py` | Added `route_id` FK column with index |
| `backend/app/schemas/boat.py` | Added `route_id` to Create/Update; added `route_id` + `route_name` to Read |
| `backend/app/services/boat_service.py` | Joins routes+branches to render `route_name`; validates route exists; new `route_id` filter |
| `backend/app/routers/boats.py` | Accepts `route_id` query param on list/count |
| `backend/app/routers/reports.py` | Vehicle-wise report (JSON + PDF) accepts `boat_id` param |
| `backend/app/services/report_service.py` | Vehicle-wise query filters on `boat_id` when supplied |
| `backend/scripts/ddl.sql` | `boats.branch_id` removed; `route_id` + `ix_boats_route_id` added; PATCH section updated |
| `backend/scripts/seed_data.sql` | Boats INSERT now includes `route_id`; UPSERT updates existing rows |
| `backend/alembic/versions/m8c0d2e4f6a9_replace_boats_branch_id_with_route_id.py` | New migration |
| `frontend/src/types/index.ts` | Added `route_id` + `route_name` to `Boat`; added `route_id` to Create/Update |
| `frontend/src/app/dashboard/ferries/page.tsx` | Operating Route column, route filter dropdown, route selector in modal |
| `frontend/src/lib/print-receipt.ts` | Optional `ferryName` field; "FERRY:" line rendered conditionally on receipts |

### VPS Deployment Steps

> **NOTE:** Production is currently 22 alembic revisions behind local (`c3d5e7f9a1b2` → `k7b9d1e3f5c8`). The catch-up will run all intervening migrations including the new `m8c0d2e4f6a9` head.

```bash
cd /var/www/ssmspl
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build backend frontend

# Apply all pending migrations (catches up the 22-revision gap and applies the new head)
docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head

# Backfill route_id on existing 12 boats per the PDF
docker compose -f docker-compose.prod.yml exec -T db psql -U ssmspl_user -d ssmspl_db_prod -c "
UPDATE boats SET route_id = CASE id
    WHEN  1 THEN 2  WHEN  6 THEN 2  WHEN 11 THEN 2   -- VESHVI - BAGMANDALE
    WHEN  2 THEN 5  WHEN  8 THEN 5                   -- BHAYANDER - VASAI
    WHEN  3 THEN 1  WHEN  4 THEN 1  WHEN 12 THEN 1   -- DABHOL - DHOPAVE
    WHEN  5 THEN 4                                    -- AGARDANDA - DIGHI
    WHEN  7 THEN 3                                    -- JAIGAD - TAVSAL
    WHEN  9 THEN 7  WHEN 10 THEN 7                   -- VIRAR - SAFALE
END
WHERE id BETWEEN 1 AND 12;
"

# Optional: normalize registration numbers to match the official PDF registry
docker compose -f docker-compose.prod.yml exec -T db psql -U ssmspl_user -d ssmspl_db_prod -c "
UPDATE boats SET no = CASE id
    WHEN 1 THEN 'RTN-IV-03-00001'
    WHEN 2 THEN 'RTN-IV-03-00007'
    WHEN 3 THEN 'RTN-IV-08-00010'
    WHEN 4 THEN 'RTN-IV-08-00011'
    WHEN 5 THEN 'RTN-IV-08-00030'
    WHEN 6 THEN 'RTN-IV-03-00082'
    ELSE no
END
WHERE id BETWEEN 1 AND 6;
"

# Verify
docker compose -f docker-compose.prod.yml exec -T db psql -U ssmspl_user -d ssmspl_db_prod -c "
SELECT b.id, b.name, b.no, b.route_id, b1.name||' - '||b2.name AS route
FROM boats b
LEFT JOIN routes r ON r.id = b.route_id
LEFT JOIN branches b1 ON b1.id = r.branch_id_one
LEFT JOIN branches b2 ON b2.id = r.branch_id_two
ORDER BY b.id;
"
```

### Known Follow-up

Tickets are still created with `boat_id = NULL` because the ticketing/multiticketing UIs do not yet have a ferry selector. The backend already accepts `boat_id` on `POST /api/tickets`, the reports already display `boat_name`, and receipts already render the ferry line conditionally — once a ferry selector is added to the booking flow, all downstream display lights up automatically.

---

## Deployment Update — 2026-04-07 (Item ID input fix + per-route multi-ticketing toggle)

### Module

Frontend — Ticketing, Multi-Ticketing, Settings; Backend — Ticket Service, Routes

### Changes

**Bug Fix — Item ID input selecting wrong item on keystroke**

**Root cause**: The item ID number input on the normal ticketing screen fired `handleItemChange` on every keystroke. When typing a double-digit ID like "14", the first keystroke "1" immediately selected item 1 (Cycle) and triggered a rate lookup. Combined with the ID column being only 70px wide (truncating double-digit IDs to show only the first digit), operators couldn't see the mistake. This caused 14 tickets to be created with the wrong item (Cycle).

**Fix**: The item ID input no longer triggers item selection on every keystroke. Selection only fires on **Enter** or **blur** (when the operator tabs to the next field), allowing the full ID to be typed before confirming. Column width widened from 70px to 90px so double-digit IDs are fully visible.

**Feature — Per-route multi-ticketing toggle**

Added `multi_ticketing_enabled` boolean column to the `routes` table (default: true). SUPER_ADMIN can toggle it per route from System Settings > Operations tab. When disabled for a route, the multi-ticketing screen shows a lock message and the backend rejects batch ticket creation with HTTP 400.

**Improvement — Multi-ticket SF validation**

Multi-ticket validation now excludes the Special Ferry (SF) item from the "at least one item required" check, since SF is auto-added and locked.

### Files Modified

| File | Change |
|------|--------|
| `frontend/src/app/dashboard/ticketing/page.tsx` | Item ID: onChange stores number only, onBlur/Enter triggers selection; column 70px→90px |
| `frontend/src/app/dashboard/multiticketing/page.tsx` | Lock screen when multi_ticketing_enabled=false; SF item excluded from validation |
| `frontend/src/app/dashboard/settings/components/operations-tab.tsx` | Per-route multi-ticketing toggle UI |
| `frontend/src/types/index.ts` | Added multi_ticketing_enabled to Route, RouteUpdate, MultiTicketInit |
| `backend/app/models/route.py` | Added multi_ticketing_enabled column |
| `backend/app/schemas/route.py` | Added field to RouteRead and RouteUpdate |
| `backend/app/services/route_service.py` | Include multi_ticketing_enabled in update |
| `backend/app/services/ticket_service.py` | Enforce multi_ticketing_enabled in create_multi_tickets; expose in multi-ticket-init |
| `backend/scripts/ddl.sql` | ALTER TABLE routes ADD COLUMN multi_ticketing_enabled |

### Migration Required

```sql
ALTER TABLE routes ADD COLUMN IF NOT EXISTS multi_ticketing_enabled BOOLEAN NOT NULL DEFAULT TRUE;
```

---

## Deployment Update — 2026-04-05 (User activity tracking + branch/route in sessions + better geo)

### Module

Backend — User Sessions, Activity Logging, Geo Service, All Routers; Frontend — User Sessions Page

### Changes

**Feature 1 — User Activity Tracking**

New `user_activity_logs` table records individual user actions (TICKET_CREATE, TICKET_BATCH, TICKET_VIEW, TICKET_CANCEL, REPORT_VIEW, REPORT_PDF, SETTINGS_CHANGE, BRANCH_SWITCH) with JSONB metadata. Logging uses fire-and-forget `BackgroundTasks` — zero impact on endpoint response times.

Instrumented endpoints:
- **Tickets**: create (single + batch), view, cancel (4 endpoints)
- **Reports**: all 12 JSON data endpoints + all 9 PDF download endpoints (21 endpoints)
- **Settings**: add/toggle/delete daily report recipients (3 endpoints)
- **Auth**: branch switch (1 endpoint)

New API endpoint: `GET /api/user-sessions/{session_id}/activities` returns activity counts grouped by action type for any session.

Frontend: "Tickets" column renamed to "Tickets / Activity" with a clickable "details" link that expands inline to show the full activity breakdown per session.

**Feature 2 — Branch & Route in Session Table**

Added `branch_id` (FK branches) and `route_id` (FK routes) columns to `user_sessions`. Populated at login from the user's `active_branch_id` and `route_id`. When a billing operator switches branch mid-session, `user_sessions.branch_id` is updated.

New "Branch" column in both Live Sessions and Session History tables. Shows the branch name the operator was working from during that session.

**Feature 3 — Enhanced IP Geolocation**

`geo_service.resolve_city()` replaced with `resolve_geo()` that returns a richer dict: `{city_display, latitude, longitude, isp}`. Same ip-api.com free API, just requesting additional fields (`lat`, `lon`, `isp`).

New columns on `user_sessions`: `latitude` (NUMERIC 10,7), `longitude` (NUMERIC 10,7), `isp` (VARCHAR 150). ISP shown as small text under the IP/City cell in the frontend.

### Files Changed

**New files:**
* `backend/app/models/user_activity_log.py` *(activity log model)*
* `backend/app/services/activity_log_service.py` *(log_activity + ActivityAction constants)*
* `backend/alembic/versions/a1b2c3d4e5f7_add_activity_tracking.py` *(migration)*

**Modified backend:**
* `backend/app/models/user_session.py` *(+5 columns: branch_id, route_id, latitude, longitude, isp)*
* `backend/app/models/__init__.py` *(registered UserActivityLog)*
* `backend/app/services/geo_service.py` *(resolve_geo returning dict with lat/lon/isp)*
* `backend/app/services/user_session_service.py` *(branch/route params, Branch join, activity summary query)*
* `backend/app/services/auth_service.py` *(pass branch_id/route_id to start_session)*
* `backend/app/routers/auth.py` *(branch switch: update session + log activity)*
* `backend/app/routers/tickets.py` *(+4 activity log calls)*
* `backend/app/routers/reports.py` *(+21 activity log calls via _log_report helper)*
* `backend/app/routers/settings.py` *(+3 activity log calls)*
* `backend/app/routers/user_sessions.py` *(+activities endpoint)*
* `backend/app/schemas/user_session.py` *(+branch/route/geo fields + ActivitySummary)*

**Modified frontend:**
* `frontend/src/types/user-session.ts` *(+branch/route/geo fields + SessionActivitySummary)*
* `frontend/src/app/dashboard/user-sessions/page.tsx` *(Branch column, ISP display, activity detail panel)*

### Database Migrations

* `a1b2c3d4e5f7` — Adds 5 columns to `user_sessions` + creates `user_activity_logs` table with indexes

### Deployment Steps (VPS)

```bash
# 1. Rebuild and restart
docker compose up --build -d

# 2. Run migration
docker exec -it ssmspl-backend alembic upgrade head
```

### Important Notes

* Existing sessions will have NULL `branch_id`, `route_id`, lat/lon/isp until users log in again. This is expected — historical sessions show "—" for these fields.
* Activity logging only starts after deployment — no retroactive data for past sessions.
* The `user_activity_logs` table grows with usage. At ~200 bytes/row and ~500 actions/day across all operators, that's ~36 MB/year. No partitioning needed yet.
* To verify activity logging is working after deploy:
  ```sql
  SELECT action_type, count(*) FROM user_activity_logs GROUP BY action_type;
  ```

---

## Deployment Update — 2026-04-03 (Daily report: fix duplicate emails + PDF attachment)

### Module

Backend — Daily Report Service, Email Service

### Changes

**Bug 1 — Receiving 4 duplicate daily report emails per day**

**Root cause**: `gunicorn.conf.py` runs `workers = cpu_count * 2 + 1` (e.g. 5 workers on a 2-core VPS). Each worker independently starts its own `daily_report_loop()` background task. The dedup guard `_last_sent_date` was an in-memory variable — each worker had its own copy. All workers fired at 23:59 IST simultaneously, each sending the full report email.

**Fix**: Added a `daily_report_log` database table with a `UNIQUE` constraint on `report_date`. Before sending, each worker attempts to INSERT a row for today's date. Only the first worker succeeds (commits immediately); all others hit `IntegrityError` and skip. The status column tracks the lifecycle: `sending` → `sent` / `failed` / `no_data`.

On startup, the loop now:
- Cleans up stale `"sending"` rows (from crashed workers) so the day can be retried.
- Seeds `_last_sent_date` from the last `"sent"` or `"no_data"` DB entry to survive restarts.

Also changed the time check from exact-minute match (`== 23:59`) to `>= 23:59` to prevent missed sends due to asyncio sleep drift.

**Bug 2 — No emails sent after adding client's email**

**Root cause**: Combination of the in-memory `_last_sent_date` resetting to `None` on every server restart, and the fragile exact-minute time check. If the server restarted or the loop crashed, emails silently stopped. No DB record existed to track what was sent.

**Fix**: Same DB-level tracking as Bug 1. The `daily_report_log` table now provides a persistent, cross-restart, cross-worker record of every send attempt with status tracking.

**Feature — Daily report now sent as PDF attachment**

**What changed**: Client requested a single PDF with all 12 branches' item-wise collection summary instead of inline HTML. The email now contains:
- **Email body**: Brief HTML summary table (branch name + total per branch + grand total) with a note to "see attached PDF".
- **Attachment**: Professional A4 PDF built with ReportLab containing:
  - Company header + report date
  - Per-branch sections: item table (Item, Rate, Qty, Net Amount) + payment mode breakdown (only modes with transactions)
  - Overall grand total bar at the bottom
- **Filename**: `SSMSPL_Daily_Report_DD_MM_YYYY.pdf`

### Files Changed

* `backend/app/models/daily_report_log.py` *(new — dedup tracking model)*
* `backend/app/models/__init__.py` *(registered DailyReportLog)*
* `backend/app/services/daily_report_service.py` *(rewritten — DB dedup + PDF generation)*
* `backend/app/services/email_service.py` *(added PDF attachment support to send_daily_report_email)*
* `backend/alembic/versions/f8a9b0c1d2e3_create_daily_report_log_table.py` *(new migration)*

### Database Migrations

* `f8a9b0c1d2e3` — Creates `daily_report_log` table (id, report_date UNIQUE, sent_at, recipient_count, status)

### Deployment Steps (VPS)

```bash
# 1. Rebuild and restart
docker compose up --build -d

# 2. Run migration
docker exec -it ssmspl-backend alembic upgrade head
```

### Important Notes

* The daily report email format has changed from inline HTML tables to a PDF attachment. Recipients should expect an email with a brief summary in the body and the detailed report as `SSMSPL_Daily_Report_DD_MM_YYYY.pdf`.
* To verify the fix is working, check the `daily_report_log` table after 23:59 IST:
  ```sql
  SELECT * FROM daily_report_log ORDER BY report_date DESC LIMIT 5;
  ```
  There should be exactly **one** row per date with status `sent`.
* If a report appears stuck in `sending` status, it means the worker crashed mid-send. The next server restart will clean it up and retry automatically.

---

## Deployment Update — 2026-04-04 (Items Sr. No. fix + Ticket daily reset)

### Module

Frontend — Items Master Screen, Backend — Ticketing

### Changes

**Issue 1 — Items master screen: serial number jump (21 → 155)**

**Root cause**: The "ID" column displayed the database primary key (`item.id`). The V1→V2 item rates migration (`scripts/migrate_v1_to_v2_items.py`) deactivated legacy items with IDs up to 154. New items created after migration received IDs 155, 156, 157 via `MAX(id) + 1`, causing the visible gap.

**Fix**: Replaced the database ID column with a computed sequential "Sr. No." based on pagination position: `(page - 1) * pageSize + rowIndex + 1`. The DataTable `render` callback was updated to pass the row index as a second argument (backward compatible — existing single-arg callbacks are unaffected). The View modal still shows the real database ID.

**Issue 2 — Ticket number not resetting daily per branch**

**Root cause**: `Branch.last_ticket_no` incremented forever across days. Day 1 tickets: 1–150, day 2: 151–300, etc. There was no date-awareness in the counter.

**Fix**: On ticket creation, the system now queries `MAX(ticket_no) FROM tickets WHERE branch_id = ? AND ticket_date = ?` to determine the next ticket number. This ensures:
- Ticket numbers reset to 1 at the start of each new day per branch.
- Backdated tickets (admin-created) don't corrupt the counter — each date is independently queried.
- Concurrent requests are safe — the branch row `FOR UPDATE` lock serializes access.
- Multi-ticket batches work correctly — `flush()` makes each ticket visible within the same transaction.
- Existing index `idx_tickets_date_branch_route(ticket_date, branch_id, route_id)` covers the query.

A new `last_ticket_date` (DATE, nullable) column was added to the `branches` table for reference tracking.

### Files Modified

| File | Change |
|---|---|
| `frontend/src/components/dashboard/DataTable.tsx` | `render` callback now passes row index as second arg |
| `frontend/src/app/dashboard/items/page.tsx` | ID column → computed Sr. No. (not sortable) |
| `backend/app/models/branch.py` | Added `last_ticket_date` column |
| `backend/app/services/ticket_service.py` | `ticket_no` from `MAX(ticket_no)` per branch+date |
| `backend/scripts/ddl.sql` | Added `last_ticket_date DATE` to branches |
| `backend/alembic/versions/d4e5f6a7b8c9_add_last_ticket_date_to_branches.py` | Migration |

### VCS

Frontend + Backend. DB migration required.

### VPS Deployment Steps

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main

# Backend: run migration
cd backend
source .venv/bin/activate
alembic upgrade head
sudo systemctl restart ssmspl-backend

# Frontend: rebuild
cd ../frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

---

## Deployment Update — 2026-04-03 (Single ticketing off-hours lockout)

### Module

Frontend — Ticketing (single ticket page)

### Changes

**Root cause**: The single ticketing page's `getNextDeparture()` function wrapped to the first ferry schedule when all ferries had passed. At 23:00, it auto-filled "06:30" (next morning's first ferry) as the departure time. There was no distinction between single and multi-ticketing — operators could create single tickets during off-hours with wrong departure times.

**Fixes applied**:
1. **Off-hours detection added** — `isOffHoursForBranch()` checks if current time is before first ferry or after last ferry for the operator's branch.
2. **"New Ticket" button disabled during off-hours** — with tooltip explaining to use multi-ticketing.
3. **Warning banner** — amber banner with link to multi-ticketing page during off-hours.
4. **`getNextDeparture()` fixed** — returns empty string during off-hours instead of wrapping to first ferry.
5. **Safety net** — if departure is still empty at submission time, stamps current client time (never sends null).

**Solid distinction between ticketing modes**:
- **Single ticketing**: ferry hours only, departure = selected ferry schedule time
- **Multi-ticketing**: off-hours only, departure = current generation time

### Files Modified

* `frontend/src/app/dashboard/ticketing/page.tsx` — off-hours lockout, getNextDeparture fix, departure safety net

### VCS

Frontend only. No backend changes. No DB migrations.

### VPS Deployment Steps

Frontend rebuild only.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
cd frontend && npm run build
sudo systemctl restart ssmspl-frontend
```

### DB fix for today's affected tickets

```sql
-- Preview
SELECT ticket_no, branch_id, departure,
       (created_at AT TIME ZONE 'Asia/Kolkata')::time(0) AS actual_time
FROM tickets WHERE ticket_date = '2026-04-03'
  AND departure IS NOT NULL
  AND abs(extract(epoch FROM (departure - (created_at AT TIME ZONE 'Asia/Kolkata')::time(0)))) > 600
ORDER BY id DESC;

-- Fix
UPDATE tickets
SET departure = (created_at AT TIME ZONE 'Asia/Kolkata')::time(0)
WHERE ticket_date = '2026-04-03'
  AND departure IS NOT NULL
  AND abs(extract(epoch FROM (departure - (created_at AT TIME ZONE 'Asia/Kolkata')::time(0)))) > 600;
```

---

## Deployment Update — 2026-04-03 (Backup: timezone fix + sync all unsynced files)

### Module

Infrastructure — Backup System

### Problem

1. **Backups running at 7:30 AM IST instead of 2:00 AM** — The db-backup container used UTC. `HOUR == 02` UTC = 07:30 IST.
2. **Older backups stuck as "Pending" forever** — The sync script only uploaded the LATEST file. If a manual backup was followed by a scheduled one before sync ran, the manual backup was never synced.

### Fix

1. **Timezone**: Changed to `TZ: IST-5:30` (POSIX format). Alpine Linux doesn't include `tzdata`, so `TZ: Asia/Kolkata` was silently ignored. The POSIX format works on bare Alpine/BusyBox without any timezone database. Backup now fires at 2:00 AM IST.
2. **Sync all unsynced files**: Rewrote sync script to fetch the remote file list once, then upload ALL local files not already on GDrive. No more permanently "Pending" files.

### Files

| File | Change |
|---|---|
| `docker-compose.prod.yml` | Changed to `TZ: IST-5:30` (POSIX format, works on Alpine) |
| `backend/scripts/sync_backup_gdrive.sh` | Rewritten to upload all unsynced files, not just latest |

### VPS Deployment Steps

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main

# Rebuild db-backup container (picks up timezone + new entrypoint)
docker compose -f docker-compose.prod.yml up -d --build db-backup

# Run a manual sync to upload the pending files right now
BACKUP_DIR=/path/to/ssmspl/backups ./backend/scripts/sync_backup_gdrive.sh --force

# Verify: check that Pending files are now Synced in the UI
```

### Google Drive

Backups are stored in folder: **`SSMSPL-Backups`** (configurable via `GDRIVE_FOLDER` env var in the sync script). Each file is a `.sql.gz` compressed database dump. Retention: 30 days on GDrive, 7 days local.

---

## Deployment Update — 2026-04-03 (Dashboard UTC→IST Date Fix)

### Module

Backend — Dashboard Stats, Ticket Listing, Booking Validation

### Summary

The dashboard Overview cards showed previous-day data between midnight and 5:30 AM IST because the backend used `date.today()` which returns UTC date. At midnight IST, UTC is still the previous day. The WebSocket (which broadcasts stats every 5 seconds with no date parameter) was querying for the UTC "today" (yesterday in IST) and overwriting the correct HTTP stats in the Overview cards.

### Root Cause

`date.today()` returns the date in the server's timezone (UTC in Docker). IST is UTC+5:30, so between 12:00 AM IST and 5:30 AM IST, `date.today()` returns yesterday's date. This affected:

1. **Dashboard WebSocket** — sent previous-day stats to Overview cards
2. **Dashboard stats fallback** — `get_dashboard_stats()` defaulted to UTC today
3. **Today's summary** — `get_today_summary()` same issue
4. **Billing operator date lock** — operators were locked to UTC "today" not IST
5. **Booking date validation** — "travel date cannot be in the past" checked against UTC

### Fix

Created `app.core.timezone.today_ist()` using `datetime.now(IST).date()` and replaced all 5 occurrences of `date.today()` across `dashboard_service.py`, `routers/tickets.py`, and `booking_service.py`.

### VPS Deployment Steps

Backend-only change. Rebuild the backend container.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main

docker compose -f docker-compose.prod.yml up -d --build backend
```

No database migrations required.

---

## Deployment Update — 2026-04-03 (Dashboard Loading Fix)

### Module

Frontend — Axios Interceptor + Dashboard User Context

### Summary

Fixed two bugs causing dashboard pages to get stuck on the loading spinner (requiring re-login) and to load slowly due to redundant API calls.

### Root Causes

1. **Stuck loading / must re-login**: The axios interceptor treated `/api/auth/me` as an "auth endpoint" and skipped token refresh on 401. Since access tokens expire every 5 minutes, any navigation after expiry resulted in a silent 401 → infinite spinner. Now `/auth/me` triggers token refresh like any other endpoint, with a `_retried` flag preventing infinite loops.

2. **Slow page loading**: Every dashboard page (ticketing, reports, users, branches, routes, etc.) independently called `GET /api/auth/me` on mount, even though `DashboardShell` already fetched the user. This added a redundant round-trip before each page could load its actual data. Created a `DashboardUserContext` so all 11 pages share the single user fetch from the shell — pages now load their data immediately on mount.

### Files Changed

- `frontend/src/lib/api.ts` — Interceptor fix: removed `/auth/me` from skip list, added `_retried` guard
- `frontend/src/components/dashboard/DashboardUserContext.tsx` — New React context providing authenticated user
- `frontend/src/components/dashboard/DashboardShell.tsx` — Provides user context, proper error redirect
- 11 dashboard pages — Switched from independent `/api/auth/me` calls to `useDashboardUser()` context

### VPS Deployment Steps

Frontend-only change. Rebuild the frontend container.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main

docker compose -f docker-compose.prod.yml up -d --build frontend
```

No database migrations required.

---

## Deployment Update — 2026-04-03 (User Sessions Sidebar Fix)

### Module

Frontend — Sidebar Menu Config

### Summary

"User Sessions" was not visible in the sidebar for SUPER_ADMIN despite the backend correctly returning it in menu_items. The sidebar uses `sidebar-menu-config.ts` (not the old `Sidebar.tsx`), and the entry was missing from that config.

### Fix

Added "User Sessions" entry with Monitor icon under the ADMINISTRATION section in `sidebar-menu-config.ts`. Only visible to SUPER_ADMIN since the sidebar filters entries against server-provided `menu_items`.

### VPS Deployment Steps

Frontend-only rebuild:

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main

docker compose -f docker-compose.prod.yml up -d --build frontend
```

No database migrations required.

---

## Data Migration — 2026-04-03 (Mismatch Filter for Historical Multi-Tickets)

### Module

Database — Historical Record Correction

### Summary

Fixed `departure` timestamps for multi-tickets generated today that were affected by the UTC/IST container time discrepancy. Replaced the fake/erroneous timestamps with their actual `created_at` IST equivalents so legitimate analytics and queries match reality.

### Action Taken

A mismatch filter query identified tickets where the recorded `departure` differed from the actual UTC `created_at` ticket creation time by more than 10 minutes (600 seconds). After verifying legitimate last-ferry tickets were not impacted (since they match within seconds of creation), the affected departure times were updated.

### Execution

```bash
# Preview tickets with mismatched timestamps
docker compose -f docker-compose.prod.yml exec -T db psql -U ssmspl_user -d ssmspl_db_prod -c "
SELECT ticket_no, branch_id, departure,
       (created_at AT TIME ZONE 'Asia/Kolkata')::time(0) AS actual_time,
       created_at AT TIME ZONE 'Asia/Kolkata' AS generated_at
FROM tickets
WHERE ticket_date = '2026-04-03'
  AND departure IS NOT NULL
  AND abs(extract(epoch FROM (departure - (created_at AT TIME ZONE 'Asia/Kolkata')::time(0)))) > 600
ORDER BY id DESC;
"

# Fix tickets by overriding departure with the actual creation time
docker compose -f docker-compose.prod.yml exec -T db psql -U ssmspl_user -d ssmspl_db_prod -c "
UPDATE tickets
SET departure = (created_at AT TIME ZONE 'Asia/Kolkata')::time(0)
WHERE ticket_date = '2026-04-03'
  AND departure IS NOT NULL
  AND abs(extract(epoch FROM (departure - (created_at AT TIME ZONE 'Asia/Kolkata')::time(0)))) > 600;
"
```

---

## Deployment Update — 2026-04-03 (User Sessions Sidebar Fix)

### Module

Frontend — Sidebar Menu Config

### Summary

"User Sessions" was not visible in the sidebar for SUPER_ADMIN despite the backend correctly returning it in menu_items. The sidebar uses `sidebar-menu-config.ts` (not the old `Sidebar.tsx`), and the entry was missing from that config.

### Fix

Added "User Sessions" entry with Monitor icon under the ADMINISTRATION section in `sidebar-menu-config.ts`. Only visible to SUPER_ADMIN since the sidebar filters entries against server-provided `menu_items`.

### VPS Deployment Steps

Frontend-only rebuild:

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main

docker compose -f docker-compose.prod.yml up -d --build frontend
```

No database migrations required.

---

## Deployment Update — 2026-04-03 (Version Update Notification)

### Module

Full Stack — Backend Version Endpoint + Frontend Notification UI

### Summary

Added a real-time version update notification system. When the developer deploys a new version, every active user sees a pulsing red bell icon with a "Reload now" prompt. Covers all edge cases: live sessions, stale browser cache, service worker cached pages, and proxy caching.

### Changes

1. **Backend `GET /api/version`**: Public endpoint returning `build_id` (UTC timestamp generated once at server startup). Response includes `Cache-Control: no-store` to prevent any caching layer from serving stale build IDs. All gunicorn workers share the same ID via `preload_app = True`.

2. **Frontend `useVersionCheck` hook**: Polls `/api/version` every 60 seconds. Detects two scenarios:
   - **Live deploy**: Server build ID changes while user has the page open (compared against in-memory ref).
   - **Stale cold-start**: User opens the app after a deploy with cached old JS. Detected by comparing server build ID against `localStorage` value from the previous session.

3. **Dashboard AppHeader**: Bell icon shows a pulsing red dot badge when an update is detected. Dropdown auto-opens with "New update available" message and a "Reload now" button. Supports dark mode.

4. **Customer portal layout**: Same notification bell added to the customer-facing navigation bar.

5. **Bulletproof reload**: Clicking "Reload now" first clears `localStorage` build ID, unregisters all service workers, purges all SW-managed caches, then does a full page reload — guaranteeing fresh HTML/JS/CSS from the server.

### Files Changed

- `backend/app/main.py` — BUILD_ID constant + `/api/version` endpoint
- `frontend/src/hooks/useVersionCheck.ts` — New polling hook with localStorage persistence
- `frontend/src/components/dashboard/AppHeader.tsx` — Notification bell with dropdown
- `frontend/src/components/customer/CustomerLayout.tsx` — Same bell for customer portal

### VPS Deployment Steps

Requires rebuilding both containers (backend for the new endpoint, frontend for the notification UI).

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main

docker compose -f docker-compose.prod.yml up -d --build backend frontend
```

No database migrations required.

---

## Deployment Update — 2026-04-03 (Multi-ticket time — permanent fix)

### Module

Frontend — Multi-Ticketing

### Changes

**Multi-ticket departure time now sourced from client clock, not server**
- Root cause of recurrence: Backend `datetime.datetime.now()` runs inside a Docker container which defaults to UTC, producing times 5:30 hours behind IST.
- Fix: Frontend now captures `new Date()` at save time and sends the client's local time as `departure` in the payload. One single `nowSave` timestamp drives all three outputs — DB `departure` column, printed receipt time, and listing page — so they always match exactly.
- Backend `now_time` fallback retained as safety net but will never fire since frontend always sends the time.
- Ferry schedule times (`first_ferry_time` / `last_ferry_time`) are only used for the lock/unlock gate, never for the ticket's time field.

### Files Modified

* `frontend/src/app/dashboard/multiticketing/page.tsx` — send client time as departure, unify timestamp source

### VCS

Frontend only. No backend changes. No DB migrations.

### VPS Deployment Steps

Frontend rebuild only.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
cd frontend && npm run build
sudo systemctl restart ssmspl-frontend
```

---

## Deployment Update — 2026-04-03 (User Session Monitor Hardening)

### Module

Full Stack — User Session Monitor

### Summary

Audit of the user session monitor found 6 issues (2 critical, 3 high, 1 medium). All fixed in this update. Mobile logins were completely invisible to session tracking, password resets left attacker sessions alive, and `session_id` had no index causing full table scans on every heartbeat.

### Issues Fixed

1. **CRITICAL — Mobile logins invisible**: The `/api/auth/mobile-login` endpoint (used by ticket checkers) never created a row in `user_sessions`. Mobile users were completely invisible to the session monitor. Now mobile login properly closes any previous session and creates a new tracking row.

2. **HIGH — No index on `session_id`**: Every heartbeat update (every 30 seconds per active user) and every session close did a full table scan on `user_sessions`. Added a unique index via migration `c3d4e5f6a7b8`.

3. **HIGH — Duplicate session rows possible**: No unique constraint on `session_id` meant race conditions during concurrent logins could create duplicate rows. Added `unique=True` constraint.

4. **HIGH — Password reset didn't close sessions**: After a password reset, the user's active session stayed open until idle timeout (10 min) or stale cleanup (5 min). An attacker with a stolen session could keep using it. Now `reset_password()` closes the active session, clears session state, and revokes all refresh tokens.

5. **MEDIUM — Geo service silent HTTP errors**: When ip-api.com returned non-200 status (rate limit, server error), the status code was swallowed. Now logged for debugging.

6. **MEDIUM — Frontend user dropdown silent failure**: If the user list API call failed, the filter dropdown showed empty with no explanation. Now shows an error message.

### RBAC Verification

All 4 session monitor endpoints are SUPER_ADMIN-only — verified at every layer:
- Backend: `require_roles(UserRole.SUPER_ADMIN)` on all endpoints
- Sidebar: Server-controlled menu, "User Sessions" only in SUPER_ADMIN's list
- Direct URL: API calls return 403, no data leakage

### VPS Deployment Steps

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main

docker compose -f docker-compose.prod.yml up -d --build backend frontend

# CRITICAL: Run migration to create unique index on session_id
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

---

## Deployment Update — 2026-04-02 (Rate Enforcement & Idle Session Timeout)

### Module

Full Stack — Ticket Service + Auth Security

### Summary

Hardened the backend to automatically reject tickets with modified rates, and implemented a strict idle session timeout to fully kill inactive sessions.

### Changes

1. **Server rejects wrong rates**: Even if the frontend sends stale/zero rates, `_enforce_db_rates` catches it and returns 409.
2. **10-min idle timeout kills sessions completely**: All tokens revoked, access blacklisted, session closed, cookies cleared. No way to resume.
3. **Frontend heartbeat keeps sessions alive**: Heartbeat pings happen during real use (every 3 min while active), so operators filling in multi-ticket forms won't get false timeouts.

The only way an operator could ever print a wrong-rate ticket now is if the rate was actually wrong in the database itself.

### VPS Deployment Steps

This requires rebuilding both the frontend and backend containers.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main

docker compose -f docker-compose.prod.yml up -d --build backend frontend

# CRITICAL: Run database migrations to create the new user_sessions table!
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head
```

---

## Deployment Update — 2026-04-02 (Nginx DNS Resolution Fix)

### Module

Infrastructure — Nginx Reverse Proxy

### Summary

Fixed nginx caching stale Docker container IPs at startup, which caused `api.carferry.online` (mobile checker app, health endpoints, dashboard WebSocket) to return 502/503 whenever the backend container restarted. The web dashboard ticketing was unaffected because those requests route through the Next.js frontend, which resolves DNS dynamically.

### Root Cause

Nginx resolves `upstream` hostnames once at startup and caches the IP permanently. When the backend container was recreated (getting a new Docker IP), nginx kept connecting to the old dead IP → "Connection refused" → 502.

### Changes

- Removed static `upstream backend` and `upstream frontend` blocks
- Added `resolver 127.0.0.11 valid=10s ipv6=off` to use Docker's internal DNS with 10-second TTL
- Replaced all `proxy_pass http://backend` / `http://frontend` with variable-based `proxy_pass $backend_up` / `$frontend_up` (nginx only re-resolves when proxy_pass uses a variable)

### Files Modified

| File | Change |
|---|---|
| `nginx/conf.d/default.conf` | Dynamic DNS resolution via Docker resolver |

### Deployment Steps

```bash
git pull
docker compose -f docker-compose.prod.yml restart nginx
```

### Impact

No downtime. Nginx restart takes 1-2 seconds. Prevents future outages when any container restarts.

---

## Deployment Update — 2026-04-02 (QZ Tray Certificate Setup Fix)

### Module

Frontend — Ticket Management / POS Printing

### Summary

Replaced the `.bat` setup script with a `.crt` certificate download for QZ Tray integration, as the `.bat` script was incompatible with QZ Tray 2.2.5.

### Changes

- Removed `setup-direct-printing.bat` from `public/`
- Added `ssmspl-qz.crt` to `public/` for direct download
- Updated the download button text to "Download Certificate" which now downloads the `.crt` file
- Updated the Printer Setup dialog instructions to match the new flow:
  1. Install QZ Tray
  2. Launch it
  3. Download the SSMSPL certificate
  4. Import via Advanced → Site Manager → + → browse to the `.crt`
  5. Refresh

### Files Added / Modified

| File | Change |
|---|---|
| `frontend/public/setup-direct-printing.bat` | **DELETED** |
| `frontend/public/ssmspl-qz.crt` | **NEW** — Served as static file |
| `frontend/src/app/dashboard/ticketing/page.tsx` | Updated instructions and download link |

### VPS Deployment Steps

Frontend-only change. No DB migrations or backend restart needed.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main

# Rebuild frontend container
docker compose -f docker-compose.prod.yml up --build -d frontend
```

---

## Deployment Update — 2026-04-02 (Backup System Hardening)

### Module

Full Stack — Backup Scripts + Backend API + Frontend UX

### What Changed

**1. `backup_db.sh` — Error handling hardened**
- Added EXIT trap: if pg_dump crashes mid-stream, the partial .sql.gz file is deleted and a `"status":"failed"` entry is written to `.last_backup.json` so the API/UI knows something went wrong
- Added `gzip -t` integrity check after dump completes — catches corrupt/truncated archives before they get synced to Google Drive

**2. `sync_backup_gdrive.sh` — Major reliability improvements**
- **Lock file**: Uses `flock` to prevent concurrent sync runs (two crons firing at once)
- **Trigger-based sync**: Only runs when `.sync_needed` file exists (created by db-backup after successful backup), or with `--force` flag. This means cron can run every 5 minutes cheaply — it exits immediately if there's nothing to do
- **Status-file guard replaces 5-minute age guard**: Instead of guessing if a backup is still writing (the old 300-second age check), it now reads `.last_backup.json` to confirm the backup completed successfully. No more race conditions, no more skipped backups
- **python3 dependency removed**: JSON log now uses `jq` (preferred) → `python3` (fallback) → simple overwrite (last resort). Shell injection risk eliminated by using env vars instead of string interpolation
- **Notify failures are non-fatal**: All calls to `notify_backup.sh` now have `|| true` so a notification failure doesn't kill the sync

**3. `notify_backup.sh` — Graceful degradation**
- Checks if `msmtp` is installed before trying to send. If missing, logs a warning instead of crashing the sync pipeline
- Individual email send failures are caught and logged (no longer crashes on first failure)

**4. `docker-compose.prod.yml` — Sync trigger integration**
- After every successful backup (both manual and scheduled), the db-backup container creates `.sync_needed` in the backups directory
- This allows the host sync cron to pick up new backups within minutes instead of waiting for the daily 2:15 AM run

**5. Backend API — Progress tracking**
- Added `backup_in_progress` boolean to `GET /api/settings/backup/status`
- Returns `true` when a `.trigger` file exists (backup queued/running)

**6. Frontend — Smart polling after trigger**
- After triggering a manual backup, the UI now polls every 3 seconds (up to 90s) until the backup completes
- Shows "Backup in progress..." with spinner during the entire operation
- Displays final result with file size on completion
- No more missed updates from the old single 5-second refresh

### Files

| File | Change |
|---|---|
| `backend/scripts/backup_db.sh` | EXIT trap + gzip validation |
| `backend/scripts/sync_backup_gdrive.sh` | Lock, trigger-based, status-file guard, jq fallback |
| `backend/scripts/notify_backup.sh` | msmtp check, graceful send failures |
| `docker-compose.prod.yml` | .sync_needed after backup success |
| `backend/app/routers/backup.py` | backup_in_progress field |
| `frontend/src/types/index.ts` | Added backup_in_progress to BackupStatus |
| `frontend/src/app/dashboard/settings/components/backups-tab.tsx` | Polling trigger UX |
| `backups/.gitignore` | Added .sync_needed |

### VPS Deployment Steps

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main

# Rebuild containers
docker compose -f docker-compose.prod.yml up -d --build backend db-backup

# Install jq on HOST for sync log (recommended)
sudo apt install -y jq

# Update cron: replace the single 2:15 AM entry with trigger-based sync
crontab -e
```

**New crontab entries** (replace old 2:15 AM entry):
```cron
# Check for new backups to sync (every 5 minutes — exits instantly if nothing to do)
*/5 * * * * cd /path/to/ssmspl && BACKUP_DIR=/path/to/ssmspl/backups ./backend/scripts/sync_backup_gdrive.sh >> /var/log/ssmspl-backup-sync.log 2>&1

# Daily safety-net sync (catches anything the trigger might have missed)
15 2 * * * cd /path/to/ssmspl && BACKUP_DIR=/path/to/ssmspl/backups ./backend/scripts/sync_backup_gdrive.sh --force >> /var/log/ssmspl-backup-sync.log 2>&1
```

### Verification

After deploying, test the manual trigger:
1. Go to Settings → Backups → click "Trigger Backup Now"
2. The button should show "Backup in progress..." with a spinner
3. After 10-20 seconds, it should show "Backup completed successfully (size)"
4. Within 5 minutes, the backup should appear as "Synced" in the GDrive column

---

## Deployment Update — 2026-04-02 (Direct Printing Setup Download)

### Module

Frontend — Ticket Management / POS Printing

### Summary

Added a download button for the direct printing setup script directly from the Printer Setup dialog, and renamed the "Save & Print" button to "Print" in the payment confirmation dialog.

### Changes

- Served `setup-direct-printing.bat` as a static file located at `/setup-direct-printing.bat`
- Added a Download button in the printer setup dialog footer (always visible) with a download icon
- Renamed the "Save & Print" button to "Print" (and "Saving..." to "Printing...") in the payment confirmation dialog

### Files Added / Modified

| File | Change |
|---|---|
| `frontend/public/setup-direct-printing.bat` | **NEW** — Served as static file |
| `frontend/src/app/dashboard/ticketing/page.tsx` | Added download button to Printer Setup dialog footer |

### VPS Deployment Steps

Frontend-only change. No DB migrations or backend restart needed.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main

docker compose -f docker-compose.prod.yml up --build -d frontend
```

---

## Deployment Update — 2026-04-02 (Data cutoff: hide pre-April 2026 tickets)

### Module

Backend (routers, services, core) + Frontend (date inputs)

### Summary

Client requested all March 2026 (test/pre-production) ticket data be hidden from non-SUPER_ADMIN users. Data is NOT deleted — just invisible to ADMIN, MANAGER, BILLING_OPERATOR, and TICKET_CHECKER roles.

### Changes

**Backend:**
- New `backend/app/core/data_cutoff.py` — hardcoded cutoff date `2026-04-01` with clamp/check utilities
- All ticket list, report, dashboard, and rate-change-log endpoints clamp dates at router level
- Individual ticket fetch (`GET /tickets/{id}`, QR, update) blocks pre-cutoff tickets for non-SUPER_ADMIN
- Verification service (QR scan, ticket number lookup) blocks pre-cutoff tickets

**Frontend:**
- All date inputs (`<input type="date">`) set `min="2026-04-01"` for non-SUPER_ADMIN users
- Affects: dashboard, reports, ticketing, rate-change-logs pages

### Files

| File | Change |
|---|---|
| `backend/app/core/data_cutoff.py` | NEW — cutoff constant + clamp/check functions |
| `backend/app/routers/tickets.py` | Clamp list/count dates, block individual ticket access |
| `backend/app/routers/reports.py` | Clamp dates on all 12 report + 8 PDF endpoints |
| `backend/app/routers/dashboard.py` | Clamp for_date on stats + today-summary |
| `backend/app/routers/rate_change_logs.py` | Clamp date_from/date_to |
| `backend/app/services/verification_service.py` | Block pre-cutoff tickets in QR/number lookups |
| `frontend/src/lib/utils.ts` | Export DATA_CUTOFF_DATE constant |
| `frontend/src/app/dashboard/page.tsx` | Add min to date picker |
| `frontend/src/app/dashboard/reports/page.tsx` | Add min to 3 date inputs |
| `frontend/src/app/dashboard/rate-change-logs/page.tsx` | Add min to 2 date inputs + user fetch |
| `frontend/src/app/dashboard/ticketing/page.tsx` | Add min to 3 date inputs |

### VPS Deployment Steps

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build backend frontend
```

No database migration needed — this is purely application-level filtering.

---

## Deployment Update — 2026-04-02 (Nginx fix for /health/backup endpoint)

### Module

Infrastructure — Nginx Config

### Changes

UptimeRobot was returning 404 for `https://api.carferry.online/health/backup` because the existing `location = /health` is an exact match and doesn't cover `/health/backup`. Added a dedicated `location = /health/backup` block in the API server block — no rate limiting, proxies straight to backend.

### Files

| File | Change |
|---|---|
| `nginx/conf.d/default.conf` | Added `location = /health/backup` block (no rate limit) |

### VPS Deployment Steps

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
docker compose -f docker-compose.prod.yml up -d --build nginx
# Verify
curl -s https://api.carferry.online/health/backup
# Expected: 503 {"status":"no_backup_data"} until first backup runs
```

---

## Deployment Update — 2026-04-02 (Backup Management UI + Backend API)

### Module

Full Stack — Settings Page Redesign + Backup API + Script Enhancements

### Changes

**1. Settings page redesigned with left sidebar tabs**
- Replaced stacked cards layout with a sidebar navigation: General, Appearance, Notifications, Backups
- Each section is now its own component for maintainability
- Backups tab only visible to SUPER_ADMIN role

**2. Backup management API (backend)**
- `GET /api/settings/backup/status` — returns last backup time, GDrive sync status, retention info
- `GET /api/settings/backup/history` — lists recent backup files with size and sync status
- `POST /api/settings/backup/trigger` — triggers manual backup via file-based trigger
- `GET /api/settings/backup/download/{filename}` — authenticated file download with path traversal protection
- Full CRUD for backup notification recipients (separate from daily report recipients)
- All endpoints gated to SUPER_ADMIN only

**3. Backup scripts enhanced**
- `backup_db.sh` now writes `.last_backup.json` status file after each run
- `sync_backup_gdrive.sh` now writes `.sync_status.json` and `.sync_log.json` for the API
- `db-backup` Docker entrypoint now polls for `.trigger` file every 10 seconds (manual backup support)

**4. New database table**
- `backup_notification_recipients` — stores emails for backup alerts (separate from daily report recipients)

### Files

| File | Change |
|---|---|
| `frontend/src/app/dashboard/settings/page.tsx` | Rewritten — sidebar tabs layout |
| `frontend/src/app/dashboard/settings/components/general-tab.tsx` | New — company info form |
| `frontend/src/app/dashboard/settings/components/appearance-tab.tsx` | New — theme management |
| `frontend/src/app/dashboard/settings/components/notifications-tab.tsx` | New — daily report recipients |
| `frontend/src/app/dashboard/settings/components/backups-tab.tsx` | New — backup management UI |
| `frontend/src/types/index.ts` | Added BackupFile, BackupStatus, BackupNotificationRecipient |
| `backend/app/routers/backup.py` | New — backup management API |
| `backend/app/models/backup_notification_recipient.py` | New — DB model |
| `backend/app/models/__init__.py` | Added model export |
| `backend/app/main.py` | Registered backup router |
| `backend/alembic/versions/a1b2c3d4e5f6_...py` | New — migration for recipients table |
| `backend/scripts/backup_db.sh` | Writes `.last_backup.json` status |
| `backend/scripts/sync_backup_gdrive.sh` | Writes `.sync_status.json` + `.sync_log.json` |
| `docker-compose.prod.yml` | Mounts backups to backend, trigger-aware entrypoint |
| `docker-compose.yml` | Mounts backups to backend (dev) |

### VPS Deployment Steps

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl

git pull origin main

# Run migration for new table
cd backend
source .venv/bin/activate
alembic upgrade head

# Restart all services (backend needs new volume mount, db-backup needs new entrypoint)
cd ..
docker compose -f docker-compose.prod.yml up -d --build backend db-backup

# Verify
curl -s https://api.carferry.online/health
```

---

## Deployment Update — 2026-04-02 (Multi-ticket time fix — frontend + backend)

### Module

Frontend — Multi-Ticketing + Backend — Ticket Service

### Changes

**1. Frontend: Print now shows actual generation time, not first ferry time**
- Root cause: Tailwind `print:hidden` CSS wasn't reliably hiding the main content div (First Ferry / Last Ferry schedule header) during `window.print()`.
- Fix: Replaced CSS-based print hiding with conditional rendering — main content is unmounted from DOM when printing.
- Replaced `printTime` React state with a synchronous `useRef` to eliminate batching race conditions.

**2. Backend: Multi-tickets now store actual generation time as departure**
- In `create_multi_tickets()`, if a ticket has no departure, the current server time is stamped as the departure before calling `create_ticket()`.
- Ensures listing page, reprints, and reports all show the correct generation time for off-hours tickets.

**3. DB fix for 5 historical tickets (applied on VPS 2026-04-02)**
- 5 multi-tickets had fake first-ferry departure times despite being generated between 00:25–04:18 AM.
- Fixed via:
```sql
UPDATE tickets
SET departure = (created_at AT TIME ZONE 'Asia/Kolkata')::time(0)
WHERE ticket_date = '2026-04-02'
  AND (
       (created_at AT TIME ZONE 'Asia/Kolkata')::time >= '23:00:00'::time
       OR
       (created_at AT TIME ZONE 'Asia/Kolkata')::time <= '06:15:00'::time
  );
-- UPDATE 5
```

### Files Modified

* `frontend/src/app/dashboard/multiticketing/page.tsx` — conditional rendering, ref-based print time
* `backend/app/services/ticket_service.py` — auto-stamp current time as departure for multi-tickets

### VCS

Frontend + Backend changes. No DB migrations.

### VPS Deployment Steps

Frontend rebuild + backend restart.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
cd backend && source .venv/bin/activate
sudo systemctl restart ssmspl-backend
cd ../frontend && npm run build
sudo systemctl restart ssmspl-frontend
```

---

## Deployment Update — 2026-04-02 (Automated Google Drive Backup)

### Module

Infrastructure — Backup System (server-side, no frontend UI)

### What This Does

Automatically uploads the daily PostgreSQL database backup to Google Drive so that a copy of the business data always exists off-server. If the Hostinger VPS dies, you can restore the database from the Google Drive copy.

### How It Works

| Time | What Happens | Where |
|---|---|---|
| **2:00 AM** | `backup_db.sh` (existing) dumps the PostgreSQL database to a compressed `.sql.gz` file | `./backups/` on VPS |
| **2:15 AM** | `sync_backup_gdrive.sh` (new) picks up the latest backup, uploads it to Google Drive, verifies file size, sends email notification | Google Drive `SSMSPL-Backups/` folder |

### Retention Policy

| Location | How Long | Managed By |
|---|---|---|
| VPS (`./backups/`) | 7 days | `backup_db.sh` (auto-deletes older files) |
| Google Drive (`SSMSPL-Backups/`) | 30 days | `sync_backup_gdrive.sh` (auto-deletes older files) |

### Safety Features

- **Race condition guard**: sync script waits until the backup file is at least 5 minutes old before uploading (prevents uploading a half-written dump)
- **Duplicate detection**: if today's backup already exists on Google Drive, upload is skipped
- **Size verification**: after upload, compares local vs remote file size to catch corruption
- **Email notifications**: sends SUCCESS/FAILED/WARNING emails to your inbox after every run
- **Non-fatal cleanup**: if Google Drive retention cleanup fails, the upload is still reported as successful

### Email Notifications

You will receive one email per day at ~2:15 AM:
- **[OK]** — backup uploaded successfully, includes file name and size
- **[ALERT]** — backup failed (no file found, upload error)
- **[WARN]** — backup uploaded but something was off (size mismatch, file too new)

### Files Added/Changed

| File | Change |
|---|---|
| `docker-compose.prod.yml` | Changed `db-backups` named Docker volume to `./backups` bind mount (so host scripts can access backup files) |
| `backend/scripts/sync_backup_gdrive.sh` | **New** — uploads latest backup to Google Drive via `rclone`, verifies, rotates old backups |
| `backend/scripts/notify_backup.sh` | **New** — sends email notification via `msmtp` (lightweight Gmail SMTP client) |
| `backups/.gitignore` | **New** — keeps `.sql.gz` files out of git |
| `docs/plans/2026-04-02-automated-gdrive-backup.md` | **New** — full implementation plan with step-by-step instructions |

### VPS Deployment Steps

**Prerequisites to install on VPS (one-time setup):**

```bash
# 1. Install rclone (Google Drive sync tool)
sudo apt update && sudo apt install -y rclone

# 2. Configure rclone with your Google account (interactive)
rclone config
#   - Name: gdrive
#   - Type: drive (Google Drive)
#   - Scope: 1 (full access)
#   - Auto config: n (headless server — it gives you a URL to open in your browser)
#   - Authorize in browser, paste code back

# 3. Verify Google Drive connection
rclone lsd gdrive:
rclone mkdir gdrive:SSMSPL-Backups

# 4. Install msmtp (email sender)
sudo apt install -y msmtp msmtp-mta

# 5. Configure Gmail SMTP — create /etc/msmtprc:
sudo tee /etc/msmtprc > /dev/null <<'MSMTP'
defaults
auth           on
tls            on
tls_trust_file /etc/ssl/certs/ca-certificates.crt
logfile        /var/log/msmtp.log

account        gmail
host           smtp.gmail.com
port           587
from           YOUR_GMAIL@gmail.com
user           YOUR_GMAIL@gmail.com
password       YOUR_16_CHAR_APP_PASSWORD

account default : gmail
MSMTP
sudo chmod 600 /etc/msmtprc

# To get an App Password: https://myaccount.google.com/apppasswords
# Select "Mail" > "Linux Computer" > copy the 16-char code

# 6. Test email
echo "Test from SSMSPL" | msmtp your-email@gmail.com
```

**Deploy the code and activate:**

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl

git pull origin main

# Copy existing backups from the old Docker volume before restarting
docker cp ssmspl-db-backup-1:/backups/. ./backups/

# Restart db-backup service (now uses bind mount)
docker compose -f docker-compose.prod.yml up -d db-backup

# Make scripts executable
chmod +x backend/scripts/sync_backup_gdrive.sh
chmod +x backend/scripts/notify_backup.sh

# Create log file
sudo touch /var/log/ssmspl-backup-sync.log
sudo chmod 644 /var/log/ssmspl-backup-sync.log

# Add cron job (runs at 2:15 AM daily, 15 min after backup_db.sh)
(sudo crontab -l 2>/dev/null; echo "15 2 * * * BACKUP_DIR=/path/to/ssmspl/backups BACKUP_NOTIFY_EMAIL=your-email@gmail.com /path/to/ssmspl/backend/scripts/sync_backup_gdrive.sh >> /var/log/ssmspl-backup-sync.log 2>&1") | sudo crontab -

# Verify cron is set
sudo crontab -l
```

**Test the full pipeline manually:**

```bash
# Trigger a backup
docker exec ssmspl-db-backup-1 /scripts/backup_db.sh

# Trigger the sync
BACKUP_DIR=./backups BACKUP_NOTIFY_EMAIL=your-email@gmail.com ./backend/scripts/sync_backup_gdrive.sh

# Check Google Drive
rclone ls gdrive:SSMSPL-Backups/

# You should also receive a success email
```

### How to Restore from Google Drive

If the VPS is lost and you need to recover:

```bash
# 1. List available backups
rclone ls gdrive:SSMSPL-Backups/

# 2. Download the one you want
rclone copy gdrive:SSMSPL-Backups/ssmspl_db_prod_YYYYMMDD_HHMMSS.sql.gz ./backups/

# 3. Restore into PostgreSQL (on the new server)
docker exec -i ssmspl-db-backup-1 /scripts/restore_db.sh /backups/ssmspl_db_prod_YYYYMMDD_HHMMSS.sql.gz
```

### Hostinger Snapshots (Bonus)

In addition to DB backups, take periodic full VPS snapshots from the Hostinger panel:
1. Log into Hostinger VPS dashboard > **Snapshots**
2. Create a snapshot before major deployments
3. Rotate old snapshots (Hostinger allows 1-3 depending on plan)

This covers the entire server state (OS, Docker, config, SSL certs), not just the database.

### This Feature Has No Frontend UI

This is a server-side cron job. There is no dashboard page to control it. You know it is working by:
1. Checking your email for the daily notification
2. Opening Google Drive > `SSMSPL-Backups/` folder to see the files
3. Checking the log: `cat /var/log/ssmspl-backup-sync.log`

---

## Deployment Update — 2026-04-02 (Fix model-to-DB mismatches causing 500 errors)

### Module

Backend — Alembic Migrations

### Changes

**1. Users table — missing columns (caused item master 500 error)**
- `failed_login_attempts` (INTEGER, default 0) and `locked_until` (TIMESTAMPTZ) were mapped in the User model but had no migration.
- Every authenticated request runs `select(User)` which includes ALL mapped columns — if any column is missing in the DB, the query fails with 500.
- This was the root cause of admin users getting "Internal Server Error" when editing items (or any other authenticated action).

**2. Portal users table — missing columns**
- `google_id` (VARCHAR 255, unique), `is_verified` (BOOLEAN, default false), `is_active` (BOOLEAN, default true) were mapped in the PortalUser model but had no migration.
- Would cause 500 on any portal user query (login, registration, OTP verification).

**3. Email OTPs table — missing table**
- The `email_otps` table was referenced by `EmailOtp` model and `otp_service.py` but was never created in the database.
- Would cause 500 on any OTP send/verify flow for portal users.

**4. Rate change logs table — missing columns (caused item rate edit 500 error)**
- The `rate_change_logs` table on production was missing `date`, `time`, and other columns mapped in the `RateChangeLog` model.
- Updating an item rate triggers `insert_rate_change_log()` which inserts into this table — the missing `date` column caused `UndefinedColumnError` and a 500 on every item rate edit.
- Migration safely adds missing columns with `IF NOT EXISTS` or creates the full table if it doesn't exist.

**5. Company table — missing `active_theme` column**
- Model maps `active_theme` but production DB didn't have the column. Would 500 on any `select(Company)` query.

**6. Payment transactions — column name mismatch**
- Production DB had `sabpaisa_txn_id`/`sabpaisa_message` but model expects `gateway_txn_id`/`gateway_message`. Renamed to match model.

**7. Other missing columns fixed across tables**
- `boats.branch_id`, `tickets.ref_no`, `ticket_items.vehicle_name`, `bookings.booking_date`, `refresh_tokens.portal_user_id` (+ made `user_id` nullable), `portal_users.google_id` — all added via migration.

**8. DDL script fully synced with models**
- Updated all CREATE TABLE statements to include every current column.
- Added PATCH sections for migrating existing databases.
- Added `rate_change_logs` CREATE TABLE (was missing entirely).

### Files Modified

* `backend/alembic/versions/b7a1c3d52e90_add_failed_login_and_locked_until_to_users.py` — migration for users table
* `backend/alembic/versions/c4e8f2a71d93_add_missing_portal_user_columns.py` — migration for portal_users table
* `backend/alembic/versions/d5f9a3b82e14_create_email_otps_table.py` — migration for email_otps table
* `backend/alembic/versions/e6a1b4c93f25_fix_rate_change_logs_table.py` — migration for rate_change_logs table
* `backend/alembic/versions/f7b2c5d84a36_fix_company_and_payment_transactions.py` — migration for company, payment_transactions, and remaining columns
* `backend/scripts/ddl.sql` — full DDL sync with current models

### VCS

Backend DB migrations + DDL update. All 20 models verified OK against live database after applying.

### VPS Deployment Steps

Rebuild Docker + run Alembic migrations inside the container.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl

git pull origin main

# Rebuild and restart
docker compose -f docker-compose.prod.yml up --build -d

# Apply migrations inside backend container
docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head
```

---

## Deployment Update — 2026-04-02 (Dashboard loose ends resolved)

### Module

Frontend — Dashboard + Backend — Dashboard Service

### Changes

**1. Branch cancellation counts now visible in dashboard**
- Added `cancelled_count` to the `TodaySummary.branch_breakdown` TypeScript interface.
- Updated the API response mapping to extract `cancelled_count` from backend data.
- Added a "Cancelled" column to the Branch Breakdown table — shows count in red when > 0, em-dash when zero.

**2. WebSocket vs HTTP race condition fixed**
- Added a `wsHasData` ref to track whether WebSocket has already delivered live stats for today.
- HTTP stats callback now skips `setStats()` when WS data is already present, preventing stale HTTP payloads from briefly overwriting fresh WebSocket data on initial page load.
- Guard resets when switching to a historical date so HTTP stats apply correctly there.

**3. Backend totals aggregation moved to Postgres**
- Replaced Python-level `sum()` list comprehensions in `get_today_summary()` with a single Postgres `SELECT` query using `func.count()`, `func.sum()`, and `case()`.
- Totals (`total_tickets`, `total_cancelled`, `total_revenue`) are now computed in one DB round trip instead of iterating branch results in Python.

**4. Spec updated**
- Updated `docs/dashboard_changes_summary.md` to mark all three functional loose ends as resolved.

### Files Modified

* `frontend/src/app/dashboard/page.tsx` — cancelled_count mapping, WS race guard, useRef import
* `backend/app/services/dashboard_service.py` — Postgres-level totals aggregation
* `docs/dashboard_changes_summary.md` — marked loose ends resolved

### VCS

Frontend + Backend changes. No DB migrations.

### VPS Deployment Steps

Frontend rebuild + backend restart.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main

# Backend
cd backend
source .venv/bin/activate
sudo systemctl restart ssmspl-backend

# Frontend
cd ../frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

---

## Deployment Update — 2026-04-01 (Receipt print layout fix + landline removal)

### Module

Frontend — Ticketing / Print Receipt

### Changes

**1. Receipt print — amount column no longer cut off on right edge**
- Added `table-layout: fixed` to the items table in both the QZ Tray HTML path and the `window.print()` path. Columns now honour their specified widths strictly instead of expanding to accommodate overflowing content, which was pushing the rightmost Amount column outside the printable area.
- Removed `white-space: nowrap` from right-aligned cells (`td.r`) so values wrap within their column rather than overflowing.
- Added `overflow: hidden` to cells and the receipt container as a hard clip safety net.
- Slightly widened fixed column sizes: 58 mm paper — num cols 36→38 px, amt col 42→46 px; 80 mm paper — num cols 44→46 px, amt col 50→56 px.
- Window-print scale adjusted from `0.92` to `0.90` and `transform-origin` changed to `top left` so the whole receipt scales inward from the left edge.

**2. Receipt print — landline phone number removed**
- `02348-248900` (Dabhol STD landline) no longer appears on printed tickets.
- `buildReceiptBodyHtml` now filters `branchPhone` before display: splits on commas and keeps only numbers that do not start with `0` (Indian STD landline pattern). Mobile numbers (e.g. `9767248900`) are unaffected.

### Files Modified

* `frontend/src/lib/print-receipt.ts` — table-layout, column widths, overflow fix, phone filter

### VCS

Frontend only. No backend changes. No DB migrations.

### VPS Deployment Steps

Frontend rebuild only.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

---

## Deployment Update — 2026-04-01 (Dashboard ordering, optional fields, multi-ticket print fix)

### Module

Frontend — Dashboard / Ticketing / Multi-Ticketing
Backend — Ticket Service

### Changes

**1. Dashboard — Today's Collection branch & payment mode ordering**
- Branch breakdown now displays in fixed route sequence: Dabhol → Dhopave, Veshvi → Bagmandle, Jaigad → Tavsal, Agardanda → Dighi, Vasai → Bhayandar, Virar → Safale. Branches not in the list appear at the end.
- Payment mode breakdown now displays in fixed order: Cash → UPI → Online.

**2. Ticketing & Multi-Ticketing — Vehicle number made optional**
- Removed frontend validation that blocked ticket submission when a vehicle item had no vehicle number in both single ticketing and multi-ticketing pages.
- Vehicle number field placeholder updated to "(optional)".

**3. Ticketing & Multi-Ticketing — UPI transaction/reference ID made optional**
- Removed frontend validation requiring a UPI reference ID before submitting in both single ticketing and multi-ticketing pages.
- Removed backend service validation (`ticket_service.py`) that returned HTTP 400 when UPI ref_no was empty.
- Reference ID field label updated to show "(optional)".

**4. Multi-Ticketing — Print time fix**
- Fixed: printed ticket was showing the first ferry schedule time instead of the actual ticket generation time.
- Added `print:hidden` to the main page content so the route info header (which contained First/Last Ferry times) no longer appears on the printed output.
- Ticket generation time is now captured at the exact moment of saving and displayed on each printed ticket as `Date: YYYY-MM-DD   Time: HH:MM`.

### Files Modified

* `frontend/src/app/dashboard/page.tsx` — branch/payment mode sort order
* `frontend/src/app/dashboard/ticketing/page.tsx` — vehicle no & UPI ref optional
* `frontend/src/app/dashboard/multiticketing/page.tsx` — vehicle no & UPI ref optional, print time fix
* `backend/app/services/ticket_service.py` — removed UPI ref_no required validation

### VPS Deployment Steps

Backend and frontend both changed. Backend restart required.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
docker compose up --build -d
```

Or if running directly:

```bash
# Backend
cd backend
source .venv/bin/activate
sudo systemctl restart ssmspl-backend

# Frontend
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

---

## Deployment Update — 2026-03-30 (QZ Tray silent printing integration)

### Module

Frontend — Ticket Management / POS Printing

### Commit ID

bd17987

### Changes

* **QZ Tray integration for silent receipt printing**: Receipts now print silently (no browser dialog) when QZ Tray is installed and a printer is configured.
* **Printer Setup dialog redesigned**: Shows live QZ Tray connection status (green/yellow/red dot), lists all printers detected by QZ Tray, allows selecting and saving the receipt printer. When QZ Tray is not found, displays step-by-step install instructions including the "Block Unsigned" setting.
* **Print path**: `printReceipt()` first attempts QZ Tray (silent); if QZ Tray is unavailable or no printer is saved, it falls back to `window.print()` (the existing path, which also supports `--kiosk-printing`).
* **New `qz-tray` npm dependency** added.

### Files Modified / Added

* `frontend/src/lib/qz-service.ts` *(new)*
* `frontend/src/lib/print-receipt.ts`
* `frontend/src/app/dashboard/ticketing/page.tsx`
* `frontend/package.json`, `frontend/package-lock.json`

### VPS Deployment Steps

Frontend-only change. No DB migration or backend restart needed.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
docker compose up --build -d frontend
```

Or if running Next.js directly:

```bash
cd frontend
npm install   # installs qz-tray
npm run build
sudo systemctl restart ssmspl-frontend
```

### Per-Machine Setup (one time per POS computer)

1. Download and install **QZ Tray** from https://qz.io/download
2. Launch QZ Tray — it appears as a tray icon (bottom-right)
3. Right-click tray icon → **Site Manager** → uncheck **Block Unsigned**
4. Open Ticket Management → click **Printer Setup** → click **Refresh**
5. Select the receipt printer from the dropdown and click **Save**

From that point on, receipts print silently on every ticket without any dialog.

---

## Deployment Update — 2026-03-30 (Direct Printing Setup for POS)

### Module

Frontend — Ticket Management / POS Printing

### Commit ID

a9d38d3

### Changes

* **No-dialog printing for Chrome and Edge**: Added a `setup-direct-printing.bat` file (served from the app) that automatically configures Chrome and Edge shortcuts with `--kiosk-printing`. Once run, receipts print instantly to the default printer without any browser popup appearing.
* **Printer Setup button** on the Ticket Management page header — opens a dialog with plain-language instructions and a one-click download of the setup file. Users just download it, double-click, and reopen their browser.
* The setup script handles Desktop, Taskbar, and Start Menu shortcuts for both Chrome and Edge automatically.

### Files Modified / Added

* `frontend/public/setup-direct-printing.bat` *(new)*
* `frontend/src/app/dashboard/ticketing/page.tsx`

### VPS Deployment Steps

Frontend-only change. No DB migration or backend restart needed.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
docker compose up --build -d frontend
```

Or if running Next.js directly:

```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Per-Machine Setup (one time per POS computer)

After deploying, each POS machine user should:
1. Open Ticket Management → click **Printer Setup**
2. Download the setup file and double-click it
3. If Windows SmartScreen appears → click **More info → Run anyway**
4. Close and reopen the browser from the desktop shortcut

---

## Deployment Update — 2026-03-30 (show_at_pos flag for Payment Modes)

### Module

Backend + Frontend — Payment Modes Master / Ticket Generation

### Commit ID

94761d4

### Changes

* **New `show_at_pos` field on payment modes**: Each payment mode now has a "Show at POS" toggle. When **on**, the mode appears in the payment confirmation dropdown during ticket generation at the counter. When **off**, it is hidden from POS (used only by portal/customer-app/online payments).
* **"Online" mode automatically set to `show_at_pos = false`** by the migration — it will no longer appear in the ticket confirmation dropdown.
* **Payment modes master page**: new "Show at POS" column in the table, displayed in the view modal, and a toggle switch in both the create and edit modal.
* **Ticket generation**: payment confirmation dropdown now only fetches payment modes with `show_at_pos = true`.

### Files Modified

* `backend/app/models/payment_mode.py`
* `backend/app/schemas/payment_mode.py`
* `backend/app/services/payment_mode_service.py`
* `backend/app/routers/payment_modes.py`
* `backend/scripts/ddl.sql`
* `backend/alembic/versions/a3c5d8e91f02_add_show_at_pos_to_payment_modes.py` *(new)*
* `frontend/src/types/index.ts`
* `frontend/src/app/dashboard/payment-modes/page.tsx`
* `frontend/src/app/dashboard/ticketing/page.tsx`

### VPS Deployment Steps

Both backend and frontend changed. **Database migration required.**

#### 0. SSH in and pull latest code

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
```

#### 1. Run the Alembic migration (adds show_at_pos column, sets Online → false)

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

Verify:
```sql
SELECT id, description, show_at_pos FROM payment_modes ORDER BY id;
-- "Online" row should show show_at_pos = false
```

#### 2. Restart the backend

```bash
sudo systemctl restart ssmspl
sudo systemctl status ssmspl
```

#### 3. Rebuild and restart the frontend

```bash
cd /path/to/ssmspl/frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

#### 4. Smoke test

1. Go to **Payment Mode Management** — confirm a "Show at POS" column is visible. "Online" should show "No".
2. Open the **Edit** modal for any mode — confirm the "Show at POS" toggle is present.
3. Open **Ticket Generation** → complete a ticket → open payment confirmation popup → confirm "Online" is **not** in the dropdown list.
4. Confirm Cash, UPI, and other POS modes are still present.

### Notes

* No changes to existing POS payment modes other than adding the flag (all default to `show_at_pos = true`).
* The `show_at_pos` filter is also applied to the `/api/payment-modes/count` endpoint for the master page pagination.

---

## Deployment Update — 2026-03-30 (Role-based access for Branch & Route Master)

### Module

Frontend — Branch Master / Route Master

### Commit ID

3feae36

### Changes

Role-based access control applied to Branch Master and Route Master pages:

| Role | Add New | Edit Existing | View |
|---|---|---|---|
| SUPER_ADMIN | ✅ | ✅ | ✅ |
| ADMIN | ❌ | ✅ | ✅ |
| MANAGER / BILLING_OPERATOR / TICKET_CHECKER | ❌ | ❌ | ✅ |

* **Add Branch / Add Route** button is only visible to SUPER_ADMIN
* **Edit** button in the table is only visible to SUPER_ADMIN and ADMIN
* All other roles see a read-only view (View button only)
* Branch page: current user is now fetched from `/api/auth/me` on mount to determine role

### Files Modified

* `frontend/src/app/dashboard/branches/page.tsx`
* `frontend/src/app/dashboard/routes/page.tsx`

### VPS Deployment Steps

Frontend-only change. No DB migration or backend restart needed.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
docker compose up --build -d frontend
```

Or if running Next.js directly (not Docker):

```bash
cd frontend
npm run build
# then restart your Next.js process / PM2 / systemd service
```

---

## Deployment Update — 2026-03-30 (2 decimal places system-wide + ticket tab order fix)

### Module

Frontend — Global UI / Ticketing

### Commit ID

9dce111

### Changes

* **Monetary amounts — 2 decimal places everywhere**: All amount/currency displays across the system now consistently show 2 decimal places (e.g. `100.00` instead of `100`). Previously, whole-number amounts dropped the decimal portion in several places.
  - `print-receipt.ts`: `fmtNum` now always uses `.toFixed(2)` (was stripping `.00` for whole numbers)
  - `dashboard/page.tsx`: `formatCurrency` changed from `maximumFractionDigits: 0` to `minimumFractionDigits: 2, maximumFractionDigits: 2`
  - `RevenueChart`, `ItemSplitChart`, `BranchComparisonChart`: added `minimumFractionDigits: 2, maximumFractionDigits: 2` to all revenue `toLocaleString` calls
  - `customer/history/page.tsx` and `customer/history/[id]/page.tsx`: added `minimumFractionDigits: 2`
  - `houseboat-booking/page.tsx`: added `minimumFractionDigits: 2, maximumFractionDigits: 2` to price display
* **Ticket generation — Tab key skips item name field**: In the ticket generation items table, pressing Tab from the Item ID field now jumps directly to the Qty field, bypassing the Item Name dropdown (which auto-fills from the ID anyway).

### Files Modified

* `frontend/src/lib/print-receipt.ts`
* `frontend/src/app/dashboard/page.tsx`
* `frontend/src/app/dashboard/ticketing/page.tsx`
* `frontend/src/app/customer/history/page.tsx`
* `frontend/src/app/customer/history/[id]/page.tsx`
* `frontend/src/app/houseboat-booking/page.tsx`
* `frontend/src/components/charts/RevenueChart.tsx`
* `frontend/src/components/charts/ItemSplitChart.tsx`
* `frontend/src/components/charts/BranchComparisonChart.tsx`

### VPS Deployment Steps

Frontend-only change. No DB migration or backend restart needed.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
docker compose up --build -d frontend
```

Or if running Next.js directly (not Docker):

```bash
cd frontend
npm run build
# then restart your Next.js process / PM2 / systemd service
```

---

## Deployment Update — 2026-03-30 (User Management filter layout fix)

### Module

User Management

### Commit ID

21d76ef

### Changes

* Fixed Route filter rendering outside the card boundary — caused by the `flex-1` search input consuming all horizontal space and pushing the Route dropdown out of the card's visible bounds
* Restructured filters bar into two explicit rows:
  - **Row 1**: Full-width search input
  - **Row 2**: Role, Status, Route dropdowns + Clear filters button
* Removed `sm:` responsive width variants on dropdowns — fixed widths keep the layout stable across all viewport sizes

### Files Modified

* `frontend/src/app/dashboard/users/page.tsx`

### Deployment Steps (VPS)

> **Important:** The route filter was not working because the backend service was not restarted after the previous deploy (`79411ba`). This update also serves as a reminder to restart the backend. No new backend code changes in this commit.

---

#### 0. SSH in and pull latest code

```bash
ssh <your-vps-user>@<vps-ip>
cd /var/www/ssmspl
git pull origin main
```

---

#### 1. Restart the backend (required for route filtering to work)

The backend must be running the code from commit `79411ba` for `route_filter` to take effect. If it hasn't been restarted since that deploy, do it now:

```bash
cd /var/www/ssmspl/backend
source .venv/bin/activate
sudo systemctl restart ssmspl
sudo systemctl status ssmspl
# Should show: active (running)
```

---

#### 2. Rebuild and restart the frontend

```bash
cd /var/www/ssmspl/frontend
npm run build
sudo systemctl restart ssmspl-frontend
sudo systemctl status ssmspl-frontend
# Should show: active (running)
```

---

#### 3. Smoke test

1. Go to **User Management**
2. The filters bar should show two rows: Search on top, Role / Status / Route on the bottom row — all inside the card border
3. Select a route from the Route dropdown — table should show only users on that route
4. Combine with Role or Status filter — both should apply together
5. Click **Clear filters** — all three dropdowns reset

### Notes

* No database migration in this commit.
* If route filtering still does not work after the backend restart, verify the backend is running from commit `79411ba` or later: `git -C /var/www/ssmspl log --oneline -5`

---

## Deployment Update — 2026-03-30 (Items Master & Item Rate Management UI fixes)

### Module

Frontend — Items Master / Item Rate Management

### Commit ID

bfbeb99

### Changes

* **Items Master**: Status filter now defaults to "Active" on page load — legacy V1 `_tmp_` items (inactive) are hidden by default. "Clear filters" resets back to Active, not All. The "Clear filters" button only appears when the user has deviated from the Active default.
* **Item Rate Management**: Replaced the `ID` column (non-sequential DB IDs with gaps from V1→V2 migration) with a sequential `#` row number (1, 2, 3…). Numbering is page-aware (page 2 at 10/page starts at 11). Column is non-sortable.

### Files Modified

* `frontend/src/app/dashboard/items/page.tsx`
* `frontend/src/app/dashboard/item-rates/page.tsx`

### VPS Deployment Steps

Frontend-only change. No DB migration or backend restart needed.

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
docker compose up --build -d frontend
```

Or if running Next.js directly (not Docker):

```bash
cd frontend
npm run build
# then restart your Next.js process / PM2 / systemd service
```

---

## Deployment Update — 2026-03-30 (Route Filter — User Management)

### Module

User Management

### Commit ID

79411ba

### Changes

* Added **Route** filter dropdown to the User Management filters bar (alongside Search, Role, Status)
* Selecting a route shows only users assigned to that route; "All Routes" shows everyone
* "Clear filters" button now also resets the route filter
* Backend: `route_filter` (integer route ID) query param added to `GET /api/users` and `GET /api/users/count`
* No database migration required — purely a query-layer change

### Files Modified

* `backend/app/routers/users.py`
* `backend/app/services/user_service.py`
* `frontend/src/app/dashboard/users/page.tsx`

### Deployment Steps (VPS)

> **Before you start:** No database migration in this update — only backend logic and frontend UI changed. This is a simple pull + restart.

---

#### 0. SSH in and pull latest code

```bash
ssh <your-vps-user>@<vps-ip>
cd /var/www/ssmspl
git pull origin main
```

Confirm the changed files are present:
```bash
git show --stat 79411ba
# Should list: backend/app/routers/users.py, backend/app/services/user_service.py,
#              frontend/src/app/dashboard/users/page.tsx
```

---

#### 1. Restart the backend

No migration needed — just restart to pick up the updated router and service.

```bash
cd /var/www/ssmspl/backend
source .venv/bin/activate
sudo systemctl restart ssmspl
sudo systemctl status ssmspl
# Should show: active (running)
```

---

#### 2. Rebuild and restart the frontend

```bash
cd /var/www/ssmspl/frontend
npm run build
sudo systemctl restart ssmspl-frontend
sudo systemctl status ssmspl-frontend
# Should show: active (running)
```

---

#### 3. Smoke test

1. Log in as Admin or Super Admin
2. Go to **User Management**
3. The filters bar should now show a **Route** dropdown after Status
4. Select any route — the table should immediately show only users assigned to that route and the count should update
5. Click **Clear filters** — the route filter resets along with all other filters
6. Verify the route filter works in combination with Role and Status filters

### Notes

* The Route dropdown is populated from the same active routes list already fetched for the Add/Edit User form — no extra API call.
* The filter applies `WHERE users.route_id = <selected_id>` at the DB level — it is not client-side filtering.
* Manager-role users already see only their own route's users by RBAC enforcement; the route filter has no additional effect for them but is still visible in the UI.

---

## Deployment Update — 2026-03-30 (Client Staff User Accounts + mobile_number)

### Module

Users / Staff Onboarding

### Commit ID

82782a6

### Changes

**Schema changes:**
* `users.email` made nullable — staff accounts can be created without an email; managers add email later via Admin > Users > Edit
* `users.mobile_number VARCHAR(20)` column added (nullable) — stores staff phone number
* Alembic migration `a9c4d2e81b37` covers `mobile_number` for app-managed deployments

**New seed file — `seed_users_client_staff.sql`:**
* 24 accounts across 5 branches: AGARDANDA-DIGHI, VESVI-BAGMANDLE, VIRAR-SAFALE, VASAI-BHAYANDAR, DABHOL-DHOPAVE
* Roles: MANAGER or BILLING_OPERATOR; each account bound to its route ID
* Multi-route managers (Rupesh Bhatkar) get one account per route: `rupesh.bhatkar.1` (Route 4), `rupesh.bhatkar.2` (Route 2)
* Email: personal Gmail used where provided in source data; `NULL` otherwise
* Phone numbers from source data stored in `mobile_number`
* Default password for all accounts: `Password@123` — **must be changed by each user on first login**
* No `ON CONFLICT` — duplicate username raises a hard error (intentional; usernames are system-wide unique)

### Files Modified / Created

* `backend/scripts/ddl.sql` _(two patches appended: email nullable + mobile_number column)_
* `backend/scripts/seed_users_client_staff.sql` _(new)_
* `backend/app/models/user.py` _(mobile_number field)_
* `backend/app/schemas/user.py` _(mobile_number in Create + Update schemas)_
* `backend/app/services/user_service.py` _(mobile_number passed on create/update)_
* `frontend/src/app/dashboard/users/page.tsx` _(mobile_number shown in user table)_
* `frontend/src/types/index.ts` _(User type updated)_
* `backend/alembic/versions/a9c4d2e81b37_add_mobile_number_to_users.py` _(new migration)_

### VPS Deployment Steps

#### Step 0 — SSH into the server and pull latest code

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
```

Verify the new files are present:

```bash
ls backend/scripts/seed_users_client_staff.sql   # should exist
git log --oneline -3                              # should show 82782a6 at top
```

#### Step 1 — Activate the Python virtual environment

```bash
source backend/.venv/bin/activate
# Prompt should show (.venv). If not found: python -m venv backend/.venv && source backend/.venv/bin/activate && pip install -r backend/requirements.txt
```

#### Step 2 — Extract DATABASE_URL for psql

```bash
DB_URL=$(grep DATABASE_URL backend/.env.production | cut -d= -f2- | tr -d "'" | sed 's/postgresql+asyncpg/postgresql/')
echo "$DB_URL"   # verify it looks like: postgresql://user:pass@host:5432/dbname
```

#### Step 3 — Apply DDL patches (email nullable + mobile_number column)

```bash
psql "$DB_URL" <<'SQL'
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mobile_number VARCHAR(20);
SQL
```

Expected output:
```
ALTER TABLE
ALTER TABLE
```

Verify:

```bash
psql "$DB_URL" -c "\d users" | grep -E 'email|mobile_number'
```

Expected — `email` has no `not null`, `mobile_number` is present:
```
 email           | character varying(255)  |           |          |
 mobile_number   | character varying(20)   |           |          |
```

#### Step 4 — Run the Alembic migration (marks migration as applied in alembic_version)

```bash
cd backend
alembic upgrade head
cd ..
```

Expected output ends with:
```
INFO  [alembic.runtime.migration] Running upgrade ... -> a9c4d2e81b37, add_mobile_number_to_users
```

If the column already exists from Step 3, Alembic will still mark the migration as done without error (the migration uses `ADD COLUMN IF NOT EXISTS`).

#### Step 5 — Seed the client staff user accounts

```bash
psql "$DB_URL" -f backend/scripts/seed_users_client_staff.sql
```

Expected output (one line per INSERT batch):
```
INSERT 0 1
INSERT 0 4
INSERT 0 1
INSERT 0 4
INSERT 0 1
INSERT 0 3
INSERT 0 1
INSERT 0 4
INSERT 0 1
INSERT 0 4
```

If you see an error like `ERROR: duplicate key value violates unique constraint "users_username_key"`, a user with that username already exists. Either:
- Skip that user (comment out their INSERT and re-run), or
- Update the existing record manually: `UPDATE users SET mobile_number='...', route_id=N WHERE username='...';`

#### Step 6 — Verify the accounts were created

```bash
psql "$DB_URL" <<'SQL'
SELECT username, full_name, role, route_id, mobile_number,
       CASE WHEN email IS NULL THEN '(no email yet)' ELSE email END AS email
FROM users
WHERE role IN ('MANAGER', 'BILLING_OPERATOR')
  AND username NOT IN ('manager', 'billing_operator')   -- exclude dev seed accounts
ORDER BY route_id, role DESC, username;
SQL
```

You should see all 24 accounts across routes 1, 2, 4, 5, and 7.

Count check:
```bash
psql "$DB_URL" -c "SELECT COUNT(*) FROM users WHERE username LIKE '%.%' AND role IN ('MANAGER','BILLING_OPERATOR');"
# Expected: 24
```

#### Step 7 — Restart the backend service

```bash
sudo systemctl restart ssmspl
sudo systemctl status ssmspl   # confirm Active: running
```

#### Rollback (if needed)

The seed inserts can be undone by deleting by username:

```bash
psql "$DB_URL" <<'SQL'
DELETE FROM users WHERE username IN (
  'rupesh.bhatkar.1','rupesh.bhatkar.2',
  'dinesh.balgude','sada.kharsaikar','machhindra.dharki','khizar.chogale',
  'rakesh.balpatil','pranay.devkar','aakash.padlekar','saqib.kunbi',
  'raj.sonawane','tushar.chaudhary','aadesh.naik','mahesh.kadam',
  'arbaz.shaikh','danish.kunbi','dilip.patil','digambar.bamne','prem.kadam',
  'sandip.pawar','aditi.natekar','prakash.bhuwad','imad.bamne','arbaz.chougle'
);
SQL
```

The schema changes (nullable email, mobile_number column) are safe to leave in place — they are backward-compatible.

---

## Deployment Update — 2026-03-30 (Item Rate V1→V2 Migration)

### Module

Item Rates / Seed Data / Audit Infrastructure

### Commit ID

3204a98

### Changes

**Audit & transition infrastructure (new, permanent):**
* Added `item_rate_history` table — append-only audit log for every rate CREATE / UPDATE / DEACTIVATE; never deleted
* Added `item_migration_map` table — permanent record of every item restructuring event across versions
* Added `item_name_snapshot` + `item_short_name_snapshot` columns to `ticket_items` — stores item name at time of ticket creation so history display is never corrupted by future item renames
* Added same snapshot columns to `booking_items`
* Dropped `DEFAULT uuid_generate_v4()` from `item_rates.updated_by` — random UUID default was silently producing misleading audit attribution
* Added `record_item_rate_change()` trigger on `item_rates` (INSERT/UPDATE) — auto-writes to `item_rate_history`, reads `updated_by` for attribution, reads `app.migration_notes` session variable for tagging

**V1 → V2 item consolidation (49 items → 21 items):**
* Items restructured to match official PDF rate sheet ("NEW ITEM ID & RATE")
* V1-only items deactivated (`is_active = FALSE`) — rows kept for FK integrity with old tickets
* Old item_rates deactivated (not deleted) — trigger records each as `DEACTIVATED`
* New 21-item V2 rates inserted for routes 1–5 and 7 (126 rows total)
* Route 6 (AMBET ↔ MHAPRAL) untouched — not in PDF

**Seed / script updates:**
* `seed_data.sql` items block replaced with V2 21-item structure; item_rates block rewritten for all 7 routes using `ON CONFLICT DO UPDATE` (idempotent)
* `seed_route_item_rates.py` rewritten — hardcoded from PDF, no Excel dependency, sets `app.migration_notes` session tag
* `migrate_v1_to_v2_items.py` — new 7-step idempotent migration script
* Old Excel-based `seed_route_item_rates.py` archived to `misc/old_seed_files/`

### Files Modified / Created

* `backend/scripts/ddl.sql` _(patch appended)_
* `backend/scripts/seed_data.sql` _(items + item_rates blocks replaced)_
* `backend/scripts/seed_route_item_rates.py` _(rewritten from PDF data)_
* `backend/scripts/migrate_v1_to_v2_items.py` _(new)_
* `misc/old_seed_files/seed_route_item_rates.py` _(archived V1 Excel-based script)_
* `data/item_rates/NEW ITEM ID & RATE.pdf` _(source PDF, already present)_

### Deployment Steps (VPS)

> **Before you start:** This migration is non-destructive — no rows are ever deleted, only deactivated. Every step is idempotent (safe to re-run). The app keeps working throughout; old rates remain active until Step 7 completes.

---

#### 0. SSH in and pull latest code

```bash
ssh <your-vps-user>@<vps-ip>
cd /var/www/ssmspl
git pull origin main
```

Confirm the new files are present:
```bash
ls backend/scripts/migrate_v1_to_v2_items.py   # should exist
ls backend/scripts/seed_route_item_rates.py     # rewritten
```

---

#### 1. Activate the Python environment

All Python commands in the steps below must be run from inside the `backend/` folder with the venv active. Do this once and keep the session open.

```bash
cd /var/www/ssmspl/backend
source .venv/bin/activate
```

You should see `(.venv)` in your prompt. If not, the venv path may differ — check with `ls .venv/`.

---

#### 2. Read your DATABASE_URL

The migration script reads it automatically from `.env.production`. Confirm it's there:

```bash
grep DATABASE_URL .env.production
# example output:
# DATABASE_URL=postgresql+asyncpg://ssmspl_user:password@localhost:5432/ssmspl_db
```

If the file is named differently (`.env` or `.env.prod`), pass it explicitly in the commands below using `--env .env`.

---

#### 3. Apply the DDL patch

This adds the two new audit tables, the snapshot columns, and the DB trigger. It is safe to run on a live database — it only adds things, never removes.

```bash
# Still inside /var/www/ssmspl/backend with venv active
# Extract the plain postgres URL (strip the +asyncpg driver prefix)
DB_URL=$(grep DATABASE_URL .env.production | cut -d= -f2- | tr -d "'" | sed 's/postgresql+asyncpg/postgresql/')

psql "$DB_URL" -f scripts/ddl.sql
```

You should see output like:
```
CREATE TABLE
CREATE TABLE
ALTER TABLE
ALTER TABLE
...
CREATE TRIGGER
```

If you see errors like `already exists` — that's fine, those parts were already applied.

**Verify the patch worked** — open psql and check:

```bash
psql "$DB_URL"
```

Once inside psql (`=#` prompt), run:

```sql
-- New tables should appear
\dt item_rate_history
\dt item_migration_map

-- Snapshot columns should be listed
\d ticket_items
-- look for: item_name_snapshot | character varying(60)

\d booking_items
-- look for: item_name_snapshot | character varying(60)

-- Trigger should be listed
\d item_rates
-- look for: Triggers: item_rate_audit AFTER INSERT OR UPDATE

\q
```

If any of the above are missing, re-run step 3 before continuing.

---

#### 4. Dry-run the migration (no writes)

This previews every change without touching the database. Read the output carefully.

```bash
# Still inside /var/www/ssmspl/backend with venv active
python scripts/migrate_v1_to_v2_items.py --dry-run
```

What to look for in the output:
- Step 0 prints counts — note how many `ticket_items` and `booking_items` rows need backfilling
- Steps 1–2 say how many snapshot rows will be written
- Step 5 lists every item that will be UPDATED or DEACTIVATED — verify the V2 names look correct
- Step 6 shows how many old item_rates will be deactivated
- Step 7 shows 126 INSERT/UPDATE lines (21 items × 6 routes)

If anything looks wrong, **stop here** and investigate before proceeding.

---

#### 5. Run the migration — one step at a time

Each step runs in its own transaction. Wait for each to complete and check the output before running the next.

```bash
# Step 1 — save item names into ticket_items rows (safe, additive only)
python scripts/migrate_v1_to_v2_items.py --step 1
# Expected output: "Backfilled: N rows"

# Step 2 — save item names into booking_items rows
python scripts/migrate_v1_to_v2_items.py --step 2
# Expected output: "Backfilled: N rows"

# Step 3 — snapshot current item_rates into audit history as V1 baseline
python scripts/migrate_v1_to_v2_items.py --step 3
# Expected output: "Seeded: N baseline rows into item_rate_history"

# Step 4 — record the old→new item mapping permanently
python scripts/migrate_v1_to_v2_items.py --step 4
# Expected output: "Inserted N rows into item_migration_map"

# Step 5 — rename items to V2 names, deactivate V1-only items
python scripts/migrate_v1_to_v2_items.py --step 5
# Expected output: lines like [UPDATE] item 4: 'EMPTY 3WHLR 5 ST RICKSHAW' → 'MAGIC/IRIS/CAR'
#                              lines like [DEACT]  item 22: 'TRUCK 10 WHLR'

# Step 6 — deactivate old V1 item_rates (not deleted — trigger records each)
python scripts/migrate_v1_to_v2_items.py --step 6
# Expected output: "Deactivated N rows"

# Step 7 — insert the 21 new V2 item_rates across 6 routes
python scripts/migrate_v1_to_v2_items.py --step 7
# Expected output: 126 [INSERT] or [UPDATE] lines, then "Inserted/updated: 126"
```

---

#### 6. Verify the final state in psql

```bash
psql "$DB_URL"
```

```sql
-- Active items should now be exactly 21
SELECT COUNT(*) FROM items WHERE is_active = TRUE;
-- expected: 21

-- Active rates: 21 items × 6 routes = 126
-- (route 6 AMBET-MHAPRAL has its own set, total may be slightly higher)
SELECT COUNT(*) FROM item_rates WHERE is_active = TRUE;
-- expected: ~126

-- Audit history should have entries
SELECT COUNT(*) FROM item_rate_history;
-- expected: > 0

-- No ticket rows should be missing their snapshot
SELECT COUNT(*) FROM ticket_items WHERE item_name_snapshot IS NULL;
-- expected: 0

SELECT COUNT(*) FROM booking_items WHERE item_name_snapshot IS NULL;
-- expected: 0

-- Quick sanity check — see the 21 active items
SELECT id, name, is_active FROM items WHERE is_active = TRUE ORDER BY id;
-- should list items 1–21 with V2 names

\q
```

---

#### 7. Restart the backend

```bash
sudo systemctl restart ssmspl
sudo systemctl status ssmspl   # confirm it's running (Active: active (running))
```

No frontend rebuild needed — this is a backend-only + database change.

---

#### If something goes wrong

Every step is idempotent — you can safely re-run any step. The script detects already-completed work and skips it.

If you need to investigate a specific step's output again:
```bash
python scripts/migrate_v1_to_v2_items.py --step <N> --dry-run
```

Nothing is irreversible at the data level — V1 items and old item_rates are deactivated, not deleted. They can be reactivated manually if needed.

### Notes

* **No data loss** — old ticket amounts (rate/levy) are stored directly in `ticket_items`. Item names preserved via `item_name_snapshot`.
* **No downtime** — steps 1–6 are purely additive/deactivation. Old rates remain active until step 7 completes.
* **Idempotent** — safe to re-run any step; already-complete work is detected and skipped.
* **Ongoing audit** — every future rate change is auto-recorded in `item_rate_history` via DB trigger. No app changes needed.
* Route 6 (AMBET ↔ MHAPRAL) rates were not in the PDF and are unchanged.

---

## Deployment Update — 2026-03-30

### Module

User Management

### Commit ID

ca08fc4

### Changes

* Made `email` optional when creating a new user — the "Add New User" form no longer requires an email address
* Email label changed from "Email *" to "Email" with placeholder text "(optional)"
* Backend `UserBase` schema updated: `email` is now `EmailStr | None` (defaults to `None`)
* Database `users.email` column changed from `NOT NULL` to nullable
* `MobileUserInfo` schema (checker app login response) updated: `email` is now `str | None`
* TypeScript types updated: `User.email: string | null`, `UserCreate.email?: string`
* User list table and User Details popup now display "—" when no email is on record
* Added amber warning banner to the "Forgot Password" page informing users without a registered email to contact their manager or admin

### Files Modified

* `backend/app/schemas/user.py`
* `backend/app/schemas/auth.py`
* `backend/app/models/user.py`
* `backend/app/services/user_service.py`
* `backend/alembic/versions/f3b7c1e92a05_make_user_email_nullable.py` _(new migration)_
* `frontend/src/types/index.ts`
* `frontend/src/app/dashboard/users/page.tsx`
* `frontend/src/app/forgot-password/page.tsx`
* `apps/checker/src/types/models.ts`

### Database Migrations

* `f3b7c1e92a05_make_user_email_nullable.py` — Removes the `NOT NULL` constraint from `users.email`. Multiple users with `NULL` email are allowed (PostgreSQL permits multiple NULLs in a UNIQUE column).

### Deployment Steps (VPS)

> **Before you start:** This is a simple, non-destructive change. The migration only removes a `NOT NULL` constraint — no rows are deleted or altered. The app keeps working throughout deployment.

---

#### 0. SSH in and pull latest code

```bash
ssh <your-vps-user>@<vps-ip>
cd /var/www/ssmspl
git pull origin main
```

Confirm the new migration file is present:
```bash
ls backend/alembic/versions/f3b7c1e92a05_make_user_email_nullable.py
# should print the file path — if not, the pull may have failed
```

---

#### 1. Activate the Python environment

```bash
cd /var/www/ssmspl/backend
source .venv/bin/activate
```

You should see `(.venv)` in your prompt.

---

#### 2. Run the Alembic migration

This alters the `users.email` column to allow `NULL`. It is instantaneous on any reasonable table size and fully safe to run on a live database.

```bash
alembic upgrade head
```

Expected output:
```
INFO  [alembic.runtime.migration] Running upgrade aef052bf16ec -> f3b7c1e92a05, make user email nullable
```

**Verify the migration worked:**

```bash
# Get your DB URL from the env file
DB_URL=$(grep DATABASE_URL .env.production | cut -d= -f2- | tr -d "'" | sed 's/postgresql+asyncpg/postgresql/')
psql "$DB_URL"
```

Once inside psql, run:

```sql
-- The email column should now show "nullable" (i.e. no "not null" in the Modifiers column)
\d users
-- Look for the email row — it should NOT have "not null" in the Modifiers column
-- e.g.:  email  | character varying(255) |
-- (not:  email  | character varying(255) | not null)

\q
```

If `not null` is still present, re-run `alembic upgrade head` and check for errors.

---

#### 3. Restart the backend

```bash
sudo systemctl restart ssmspl
sudo systemctl status ssmspl
# Should show: active (running)
```

---

#### 4. Rebuild and restart the frontend

```bash
cd /var/www/ssmspl/frontend
npm run build
sudo systemctl restart ssmspl-frontend
sudo systemctl status ssmspl-frontend
# Should show: active (running)
```

The build output will include the updated `users/page.tsx` and `forgot-password/page.tsx`.

---

#### 5. Smoke test

1. Log in as an admin or super admin
2. Go to **User Management → Add User**
3. Fill in Full Name, Username, Password, Role — **leave Email blank**
4. Click **Create User** — it should succeed without any email validation error
5. The new user should appear in the table with "—" in the Email column
6. Open the new user's details — Email row should show "—"
7. Visit `/forgot-password` — the amber "No email on your account?" banner should be visible

### Notes

* Existing users with emails are unaffected — the migration only relaxes the constraint.
* Users without email cannot use the "Forgot Password" self-service flow. They must ask an admin/manager to either reset their password directly via the **Edit User → Reset Password** panel, or add an email to their account via **Edit User → Email field**.
* The uniqueness constraint on `email` remains in place — only one user per email address is allowed. Multiple `NULL` values are permitted (PostgreSQL does not treat NULLs as equal in unique indexes).

---

## Deployment Update — 2026-03-12

### Module

Reports

### Commit ID

783fe3d

### Changes

* Added `branch_id` foreign key to Boat model, linking boats to branches
* Fixed "Failed to print report" error on Print 80mm button — caused by Decimal amounts serialized as strings being passed to `.toFixed()` without conversion
* Replaced `window.print()` with dedicated iframe-based A4 print template for all reports — includes company header, report title, date/branch/route filters, generated by/at metadata, data table, grand total, and payment mode breakdown
* Created new `print-report.ts` utility for clean self-contained A4 HTML printing
* Updated boat schema (BoatCreate, BoatUpdate, BoatRead) to include `branch_id`
* Merged two pre-existing Alembic head revisions into single migration chain

### Files Modified

* `backend/app/models/boat.py`
* `backend/app/schemas/boat.py`
* `backend/alembic/versions/d7e3f1a20b54_add_branch_id_to_boats_table.py`
* `frontend/src/app/dashboard/reports/page.tsx`
* `frontend/src/lib/print-branch-summary.ts`
* `frontend/src/lib/print-report.ts`

### Database Migrations

* `d7e3f1a20b54_add_branch_id_to_boats_table.py` — Adds `branch_id` (nullable FK to `branches`) on `boats` table. Also merges two pre-existing divergent heads.

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
alembic upgrade head
sudo systemctl restart ssmspl
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* After migration, assign `branch_id` to existing boats via API (`PATCH /api/boats/{id}` with `{"branch_id": <id>}`) or directly in DB: `UPDATE boats SET branch_id = <branch_id> WHERE id = <boat_id>;`
* Without assigning boats to branches, the Boat Name column in Ticket Details and Vehicle Wise Tickets reports will remain empty for existing tickets.
* The `boat_id` on tickets is nullable — it must be set during ticket creation for boat data to appear in reports.

---

## Deployment Update — 2026-03-12

### Module

reports / auth / ticketing / rate-change-logs

### Commit ID

31caa07

### Changes

* Added payment_mode filter to 5 report endpoints (itemwise-levy, ticket-details, user-wise-summary, vehicle-wise-tickets, branch-item-summary) — backend query filtering + frontend dropdown
* Added boat filter to ticket-details report
* Reordered report filters: Date → Route → Branch → Payment Mode → Boat → User
* Route-branch validation: selecting a route now restricts branch dropdown to that route's two branches; backend rejects mismatched route/branch for all roles
* Role-based filter locking: BILLING_OPERATOR gets route+branch locked; MANAGER gets route locked and can only select route branches; ADMIN/SUPER_ADMIN unrestricted
* Added `active_branch_id` column to users table — persists the operating branch selected at login on the server side
* Added `POST /api/auth/select-branch` endpoint — called on login branch selection to store active_branch_id in DB
* Billing operator branch enforcement: backend forces branch_id to active_branch_id in reports (`_scope_route_and_branch`, `_scope_branch_only`), ticket creation, ticket listing
* Frontend reports page auto-fills and locks branch from server-side active_branch_id for billing operators
* Frontend ticketing page prefers server-side active_branch_id over client-side cookie
* Frontend login page calls select-branch API on branch selection
* Switched login from email to username (backend schema, service, and frontend)
* Added rate_change_logs module: model, schema, service, router, frontend page — tracks item rate creates/updates/deletes with old and new values
* Added "Rate Change Logs" to RBAC menu for SUPER_ADMIN and ADMIN roles

### Files Modified

* `backend/alembic/versions/a1459da85ee6_add_active_branch_id_to_users.py`
* `backend/alembic/versions/e8f2a4b61c93_create_rate_change_logs_table.py`
* `backend/app/core/rbac.py`
* `backend/app/main.py`
* `backend/app/models/__init__.py`
* `backend/app/models/rate_change_log.py`
* `backend/app/models/user.py`
* `backend/app/routers/auth.py`
* `backend/app/routers/item_rates.py`
* `backend/app/routers/rate_change_logs.py`
* `backend/app/routers/reports.py`
* `backend/app/routers/tickets.py`
* `backend/app/schemas/auth.py`
* `backend/app/schemas/rate_change_log.py`
* `backend/app/schemas/user.py`
* `backend/app/services/auth_service.py`
* `backend/app/services/item_rate_service.py`
* `backend/app/services/rate_change_log_service.py`
* `backend/app/services/report_service.py`
* `frontend/src/app/dashboard/rate-change-logs/page.tsx`
* `frontend/src/app/dashboard/reports/page.tsx`
* `frontend/src/app/dashboard/ticketing/page.tsx`
* `frontend/src/app/login/page.tsx`
* `frontend/src/components/dashboard/sidebar-menu-config.ts`
* `frontend/src/types/index.ts`

### Database Migrations

* `a1459da85ee6_add_active_branch_id_to_users.py` — Adds `active_branch_id` (nullable FK to `branches`) on `users` table
* `e8f2a4b61c93_create_rate_change_logs_table.py` — Creates `rate_change_logs` table (id, item_rate_id, item_id, route_id, action, old_rate, new_rate, old_levy, new_levy, changed_by, changed_at)

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
alembic upgrade head
sudo systemctl restart ssmspl
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* Login now uses **username** instead of email. Ensure frontend login form sends `username` field. All existing dev credentials use usernames (superadmin, admin, manager, billing_operator, ticket_checker).
* After deploying, billing operators must log out and log back in to set their `active_branch_id` via the new select-branch API. Until they do, branch enforcement falls back to route-level scoping.
* The rate_change_logs table will start recording from this deployment forward — no historical backfill is needed.

---

## Deployment Update — 2026-03-12

### Module

ticketing

### Commit ID

31caa07

### Changes

* Ticket creation window now stays open after saving — form resets with empty item row, cursor focuses first input for immediate next ticket entry
* Last ticket info bar updates inline with payment mode, amount, change, and UPI ref from the just-created ticket
* Departure, route, branch, and ticket date selections are preserved between consecutive tickets
* Ticket list refreshes in background without blocking the operator

### Files Modified

* `frontend/src/app/dashboard/ticketing/page.tsx`

### Database Migrations

* None

### Deployment Steps (VPS)

Backend:
```bash
# No backend changes — skip
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* Frontend-only change. No backend restart or database migration needed.
* Operators no longer need to click "+ New Ticket" between consecutive tickets — the form auto-resets and focuses the first item input.

---

## Deployment Update — 2026-03-13

### Module

Seeder — Route Item Rates

### Commit ID

de8051a

### Changes

* Added `seed_route_item_rates.py` — idempotent Python script that reads route-wise item rates from an Excel file and upserts into the `item_rates` table
* Reads `data/item_rates/item_rates_list_final_all_routes.xlsx` (Marathi item names auto-identified and mapped to DB item IDs)
* Covers 6 routes: Dabhol-Dhopave, Vesavi-Bagmandale, Jaigad-Tavsal, Dighi-Agardanda, Vasai-Bhayander, Virar-Saphale (Route 6 Ambet-Mhapral untouched)
* Handles Vasai combined car+sedan row (expands to two item_rate entries)
* Supports `--dry-run` flag to preview changes without writing to DB
* Per-route and grand summary logging (added/updated/skipped counts)

### Files Modified

* `backend/scripts/seed_route_item_rates.py` (new)
* `data/item_rates/item_rates_list_final_all_routes.xlsx` (new — source Excel)

### Database Migrations

* None — script directly upserts into existing `item_rates` table.

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate

# Preview changes first
python scripts/seed_route_item_rates.py --dry-run --env .env.production

# Apply changes
python scripts/seed_route_item_rates.py --env .env.production
```

Frontend:
```bash
# No frontend changes — skip
```

### Notes

* Run with `--dry-run` first to verify the expected changes before applying.
* The script is idempotent — running it again will skip items that already have the correct rate.
* Route 6 (Ambet-Mhapral) is NOT in the Excel and will NOT be modified.
* Existing item_rates not present in the Excel (e.g. older item mappings) are left as-is — only adds and updates, no deletes.
* Requires `openpyxl` and `asyncpg` Python packages (already in backend dependencies).

---

## Deployment Update — 2026-03-15

### Module

Authentication / User Management

### Commit ID

50d1f19

### Changes

* Added username field to Edit User form (was previously only shown during user creation)
* Username validation: min 4 chars, max 50 chars, no spaces, unique across system
* Backend rejects duplicate usernames with HTTP 409 on user update
* Added `POST /api/users/{user_id}/reset-password` endpoint for admin password reset
* Endpoint restricted to ADMIN and SUPER_ADMIN roles only
* Password reset uses existing complexity validation (8+ chars, uppercase, lowercase, digit, special char)
* Audit logging on password reset (admin_user_id, target_user_id, timestamp)
* Reset Password section in Edit User modal visible only to ADMIN/SUPER_ADMIN
* Added AdminResetPassword Pydantic schema and admin_reset_password service function

### Files Modified

* `backend/app/routers/users.py`
* `backend/app/schemas/user.py`
* `backend/app/services/user_service.py`
* `frontend/src/app/dashboard/users/page.tsx`
* `frontend/src/types/index.ts`

### Database Migrations

* None — username column already has UNIQUE constraint in the database.

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
sudo systemctl restart ssmspl
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* No database migration required. The username column and its UNIQUE constraint already exist.
* SUPER_ADMIN passwords can only be reset by another SUPER_ADMIN.
* The admin reset password endpoint does NOT send any email notification — it is a manual admin action.
* Login continues to use username (not email) as implemented in the previous deployment.

---

## Deployment Update — 2026-03-15 (hotfix)

### Module

Authentication / User Management

### Commit ID

f53100e

### Changes

* Fixed 500 Internal Server Error on `POST /api/users/{id}/reset-password`
* Root cause: missing `await db.refresh(user)` after `db.commit()` in `admin_reset_password` service — SQLAlchemy expired the user instance, and accessing `user.route_id` triggered an unsupported async lazy load (`MissingGreenlet`)

### Files Modified

* `backend/app/services/user_service.py`

### Database Migrations

* None

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
sudo systemctl restart ssmspl
```

Frontend:
```bash
# No frontend changes — skip
```

### Notes

* One-line backend fix. No frontend or database changes required.
* The 422 errors seen when submitting weak passwords are expected Pydantic validation responses — the frontend already displays these correctly.

---

## Deployment Update — 2026-03-15

### Module

Authentication

### Commit ID

b9eb8e3

### Changes

* Removed 2-minute session lock (`_has_active_session()`, `SESSION_TIMEOUT_SECONDS = 120`, HTTP 409 rejection) from both web and mobile login flows
* New login now immediately overwrites the previous session — `_start_session()` generates a fresh UUID and stores it in `active_session_id`, invalidating any older JWT whose `sid` no longer matches
* Existing request validation unchanged: `get_current_user()` still checks `JWT.sid == DB.active_session_id` and returns 401 `session_expired_elsewhere` on mismatch
* Session heartbeat unchanged: `session_last_active` still updated every 30s on API requests, but no longer used to block logins
* Logout unchanged: clears `active_session_id` and `session_last_active` immediately

### Files Modified

* `backend/app/services/auth_service.py`
* `backend/app/routers/auth.py`

### Database Migrations

* None — no schema changes, uses existing `active_session_id` and `session_last_active` columns.

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
sudo systemctl restart ssmspl
```

Frontend:
```bash
# No frontend changes — skip
```

### Notes

* Backend-only change. No frontend rebuild or database migration needed.
* Users will no longer see "already logged in from another session" errors. Instead, logging in from a new browser/device silently invalidates the old session — the old browser gets redirected to `/login?reason=session_conflict` on its next API call.
* Rapid login/logout cycles, browser crashes, and page refreshes will no longer cause session lock issues.

---

## Deployment Update — 2026-03-16

### Module

Ticketing / Print Receipt

### Commit IDs

6165157, 045bd22, c69e76b

### Changes

* **Ticket modal stays open after creation** — fixed Radix Dialog dismiss race condition where closing the payment confirmation modal would also close the main ticket form modal. Added `isSavingRef` guard on the main dialog's `onOpenChange` and `onCloseAutoFocus` prevention on the payment dialog to stop focus interference.
* **Payment mode now printed on ticket receipt** — added `PAYMENT MODE: CASH` (or `CASH / UPI`, `UPI`, `CARD`, etc.) line in the header section of 80mm and 58mm thermal receipts. Supports split-payment labels (e.g. `CASH / UPI` when ticket is paid with multiple modes).
* Receipt data for reprints derives payment mode label from the ticket's `payments` array (or falls back to `payment_mode_name`).
* **Receipt layout cleanup** — removed duplicate CASH MEMO NO, PAYMENT MODE, and NET TOTAL from footer section. Removed footer DATE/TIME row. Moved `BY:` (created by) to the header row alongside PAYMENT MODE. Split the Marathi NOTE text with "Ferry Boatit Ticket Dakhvaa." on its own centered line. Removed unused `formatFooterDateTime` helper.
* **Receipt BY field uses username** — changed `BY:` on receipt from full name (e.g. "Super Administrator") to username (e.g. "superadmin") to prevent text wrapping on 80mm thermal paper.

### Files Modified

* `frontend/src/lib/print-receipt.ts` — added `paymentModeName` to `ReceiptData` interface; added `PAYMENT MODE:` and `BY:` in receipt header; removed duplicate footer rows; cleaned up NOTE text; removed dead code
* `frontend/src/app/dashboard/ticketing/page.tsx` — added `isSavingRef` to guard modal dismiss during save; added `onCloseAutoFocus` prevention on payment dialog; passes `paymentModeName` in both new-ticket and reprint receipt data

### Database Migrations

* None

### Deployment Steps (VPS)

Backend:
```bash
# No backend changes — skip
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* Frontend-only change. No backend restart or database migration needed.
* Payment mode on receipt is derived from the ticket's payment rows — if a ticket has multiple payment modes (e.g. CASH + UPI), the receipt shows `PAYMENT MODE: CASH / UPI`.
* The modal-stays-open fix addresses a Radix UI Dialog interaction where sibling dialog dismiss events could cascade. The `isSavingRef` ref prevents the main modal from closing during the save-and-reset flow.
* Operators can now create consecutive tickets without re-opening the modal — form resets, cursor focuses first item input, and branch/route/date context is preserved.

---

## Deployment Update — 2026-03-16

### Module

System Audit — Code Quality / Reports / User Management / Boats / DDL

### Commit ID

b0f7b7c

### Changes

* **Shared password validator (DRY fix)** — Extracted `validate_password_complexity()` from 3 duplicated copies (schemas/user.py, schemas/auth.py, schemas/portal_user.py) into a single shared module at `backend/app/core/validators.py`
* **Frontend password complexity validation** — Added client-side password validation matching backend rules (uppercase, lowercase, digit, special char) to: user create form, admin reset password form, and change-password page. Created shared `frontend/src/lib/password-validation.ts` utility
* **Report payment breakdowns show all modes** — Fixed itemwise-levy, branch-item-summary, and payment-mode reports to show ALL active payment modes (Cash, UPI, Card, Online) even when a mode has zero transactions in the selected period. Previously only modes with transactions appeared
* **DDL synced with migrations** — Added missing `active_branch_id`, `active_session_id`, and `session_last_active` columns to the `users` table definition in `backend/scripts/ddl.sql`
* **Removed dead boat branch_id** — Removed unused `branch_id` column from boat model (`backend/app/models/boat.py`) and boat schemas (`BoatCreate`, `BoatUpdate`, `BoatRead`). The column was defined but never used in any service, router, or UI
* **Payment issues audit log** — Created `analysis_issues/payment_issues.md` documenting all payment-related audit findings

### Files Modified

* `backend/app/core/validators.py` (new — shared password complexity validator)
* `frontend/src/lib/password-validation.ts` (new — frontend password validation utility)
* `backend/app/schemas/user.py` (import shared validator, remove local copy)
* `backend/app/schemas/auth.py` (import shared validator, remove local copy)
* `backend/app/schemas/portal_user.py` (import shared validator, remove local copy)
* `backend/app/models/boat.py` (remove branch_id column)
* `backend/app/schemas/boat.py` (remove branch_id from all schemas)
* `backend/app/services/report_service.py` (payment breakdown — load all active modes)
* `backend/scripts/ddl.sql` (add 3 missing user columns)
* `frontend/src/app/dashboard/users/page.tsx` (password validation on create + reset)
* `frontend/src/app/dashboard/change-password/page.tsx` (password complexity validation)

### Database Migrations

* None — DDL script updated for fresh deployments only. Existing databases already have these columns via Alembic migrations.

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
sudo systemctl restart ssmspl
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* Both backend and frontend need restart for the password validation and report fixes to take effect.
* No database migration needed — existing production databases already have all columns via Alembic. The DDL update only affects fresh database setups.
* The `boats.branch_id` column removal is a model/schema-only change. If the column exists in the production database, it will be ignored by SQLAlchemy (no migration needed to drop it). If you want to clean it up, run: `ALTER TABLE boats DROP COLUMN IF EXISTS branch_id;`
* Report payment breakdowns will now always show all 4 payment modes (Cash, UPI, Card, Online) in itemwise-levy, branch-item-summary, and payment-mode reports, even for periods with zero transactions in some modes.
* Frontend password inputs now show placeholder text indicating requirements: "Min 8 chars, upper, lower, digit, special"

---

## Deployment Update — 2026-03-16

### Module

Reports / Ticketing — Payment Mode Fix

### Commit ID

dae56e3

### Changes

* **Root cause fix: `tickets.payment_mode_id` was always CASH** — The frontend ticketing page set the header `payment_mode_id` to `paymentModes[0]` (CASH) when opening the create modal, then never updated it when the user selected a different mode (UPI, Card, etc.) in the payment confirmation modal. The `ticket_payement` rows stored the correct mode, but `tickets.payment_mode_id` was always CASH. All 12 report queries correctly grouped by the header field — the data was wrong, not the queries.
* **Frontend fix** — `handleSaveAndPrint()` now derives the header `payment_mode_id` from the payment row with the largest amount, instead of using the stale `formPaymentModeId` state
* **Backend defensive fix** — `create_ticket()` in `ticket_service.py` now overrides `payment_mode_id` from the primary payment row (largest amount) when `payments` are provided, ensuring correctness even if the client sends a stale value
* **Data migration** — Alembic migration `f9a5b3c72d16` updates all existing tickets' `payment_mode_id` from their `ticket_payement` rows (using `DISTINCT ON` to pick the payment row with the largest amount per ticket)

### Files Modified

* `frontend/src/app/dashboard/ticketing/page.tsx` — derive `payment_mode_id` from payment rows before API call
* `backend/app/services/ticket_service.py` — defensive `effective_payment_mode_id` derivation from payments
* `backend/alembic/versions/f9a5b3c72d16_fix_ticket_payment_mode_from_payments.py` (new — data migration)

### Database Migrations

* `f9a5b3c72d16_fix_ticket_payment_mode_from_payments.py` — Updates `tickets.payment_mode_id` for all tickets that have `ticket_payement` rows where the payment mode differs from the header. Uses `DISTINCT ON (ticket_id) ORDER BY amount DESC` to pick the primary payment mode.

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
alembic upgrade head
sudo systemctl restart ssmspl
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Post-Deployment Verification

```sql
-- Verify payment modes are now distributed (not all CASH)
SELECT pm.description, COUNT(*)
FROM tickets t
JOIN payment_modes pm ON pm.id = t.payment_mode_id
GROUP BY pm.description
ORDER BY COUNT(*) DESC;

-- Verify no tickets have mismatched header vs payment rows
SELECT t.id, t.payment_mode_id AS header_mode, tp.payment_mode_id AS payment_mode, tp.amount
FROM tickets t
JOIN ticket_payement tp ON tp.ticket_id = t.id
WHERE t.payment_mode_id != tp.payment_mode_id
  AND NOT EXISTS (
    SELECT 1 FROM ticket_payement tp2
    WHERE tp2.ticket_id = t.id AND tp2.amount > tp.amount
  )
LIMIT 10;
```

### Notes

* **Migration must run before backend restart** — `alembic upgrade head` fixes all historical tickets. Without it, existing reports will still show incorrect payment mode data.
* Both backend and frontend must be deployed together. The frontend fix prevents future tickets from having wrong `payment_mode_id`. The backend defensive fix is belt-and-suspenders.
* The multiticketing page (`/dashboard/multiticketing`) was NOT affected — it already correctly set `payment_mode_id: t.paymentModeId` from the user's selection.
* Tickets without `ticket_payement` rows (if any exist from very early data) will not be modified by the migration — their `payment_mode_id` stays as-is.
* The migration is not reversible — the original incorrect CASH values are not preserved anywhere.

---

## Update — 2026-03-16

### Module

Infrastructure / Documentation (non-deployment)

### Commit ID

6032e81

### Changes

* **Production readiness audit** — Completed full system audit covering backend, frontend, checker app, customer app, and infrastructure. Documented 8 CRITICAL, 15 HIGH, and 22 MEDIUM issues across security, data integrity, performance, and operational readiness for 12-branch / 2k-3k daily user production deployment.
* **Audit documentation** — Created local-only `analysis_issues/` folder (gitignored) containing:
  - `production_audit.md` — Full issue catalog (C-01 through C-08, H-01 through H-15, M-01 through M-22) with file references, impact, and fix guidance. Organized by severity with a phased remediation roadmap.
  - `payment_issues.md` — Payment-specific findings (AUDIT-PAY-01 through AUDIT-PAY-08) plus ongoing payment issue tracking from separate work.
* **`.gitignore` updated** — Added `analysis_issues/` to ensure audit docs are never committed to the repository.

### Key Findings (Summary)

**Critical (must fix before go-live):**
- C-01: Ticket ID race condition (missing advisory lock)
- C-02: Ferry overbooking (no capacity locking)
- C-03: Branch counter race condition (duplicate ticket numbers)
- C-04: Session tokens valid 30 min after logout (no revocation)
- C-05: ADMIN can create unlimited ADMIN accounts
- C-06: Admin password reset without user notification
- C-07: No automated database backups
- C-08: Duplicate check-ins possible in checker app (no idempotency)

**High (fix within first month):**
- Missing DB indexes for reports (will degrade after ~730k rows)
- Missing foreign keys on `ticket_payement.ticket_id` and `booking_items.item_id`
- No brute force protection (only 10/min IP-level rate limit)
- In-memory rate limiting (resets on restart, no sharing across instances)
- DB connection pool undersized (30 max for 2-3k users)
- No request body size limits (DoS vector)
- Mobile apps fall back to insecure token storage silently
- Single server architecture with no failover
- No monitoring or error tracking (Sentry DSN blank)
- Frontend CSP allows `unsafe-inline` and `unsafe-eval`

### Files Modified

* `.gitignore` — added `analysis_issues/` exclusion

### Database Migrations

* None

### Deployment Steps (VPS)

```bash
# No deployment needed — .gitignore is a repo-level change only.
# Audit docs are local-only and not deployed.
```

### Notes

* This is a documentation-only change. No backend/frontend restart needed.
* The `analysis_issues/` folder exists only on the developer's machine and is excluded from git. It will not appear in production deployments.
* Full audit details are in `analysis_issues/production_audit.md` (non-payment) and `analysis_issues/payment_issues.md` (payment-specific). Review these files locally for remediation planning.

---

## Deployment Update — 2026-03-16

### Module

Full-System Security Hardening (24 fixes)

### Commit ID

dc5ed99

### Changes

**Backend — Race Conditions & Data Integrity:**
* Added `pg_advisory_xact_lock` to ticket ID, ticket item ID, and ticket payment ID generation in `ticket_service.py` (4 locations) — prevents duplicate IDs under concurrent requests
* Added `capacity` column to `ferry_schedules` model and DDL (INTEGER NOT NULL DEFAULT 0) — enables overbooking prevention
* Added `payment_transactions` table definition to DDL (was only in Alembic, missing from canonical DDL)
* Added `UNIQUE` constraint on `verification_code` columns in tickets and bookings tables — prevents QR code collision
* Added `CHECK` constraints on `status` fields: tickets (CONFIRMED/CANCELLED/VERIFIED), bookings (PENDING/CONFIRMED/CANCELLED/VERIFIED), payment_transactions (INITIATED/SUCCESS/FAILED/ABORTED)
* Wired `_check_capacity()` call into `create_booking()` flow — function existed but was never called

**Backend — Auth & Authorization:**
* Added rate limiting to all 5 verification endpoints (30/min for lookups, 15/min for check-in)
* Added rate limiting to tickets listing (30/min), all 21 report endpoints (10/min), and rate-change-logs endpoints
* Added route-scope check to `admin_reset_password` — non-SUPER_ADMIN admins can no longer reset passwords for users on a different route (IDOR fix)
* Added account lockout: 5 failed login attempts triggers 15-minute lockout. Lockout counters committed immediately to persist across the HTTP exception rollback
* Added `SECRET_KEY` length >= 32 validation on startup via Pydantic field_validator

**Backend — Security Headers & Infrastructure:**
* Added `X-XSS-Protection: 0` and `X-Permitted-Cross-Domain-Policies: none` response headers
* Made gunicorn `forwarded_allow_ips` configurable via `FORWARDED_ALLOW_IPS` env var (documented rationale for Docker topology)
* Added security guardrail comments above `UserRead` and `PortalUserRead` schemas

**Frontend:**
* Removed `'unsafe-eval'` from CSP `script-src` directive in `next.config.ts` — not needed in production
* Removed `console.error()` calls from production dashboard page (lines 189, 219)
* Added redirect param support to admin and customer login pages — validates path starts with `/` and rejects protocol-relative URLs (`//`)

**Mobile (Checker App):**
* Removed insecure AsyncStorage token fallback from `storageService.ts` — SecureStore failure now returns null (forces re-login) instead of falling back to plaintext storage
* Added QR payload validation (rejects payloads > 500 chars) in `QRScannerScreen.tsx`
* Added manual entry upper bound (max 999999) in `HomeScreen.tsx`
* Removed unnecessary `android.permission.RECORD_AUDIO` from `app.json`

**Infrastructure / Docker:**
* Added Redis authentication (`--requirepass`) in production Docker compose + updated `RATE_LIMIT_STORAGE_URI` with password
* Pinned Docker image versions: `postgres:16.6-alpine`, `redis:7.4-alpine`, `nginx:1.27-alpine`, `node:20.18-alpine`, `python:3.12.8-slim`
* Added `FORWARDED_ALLOW_IPS` env var to backend service in production compose

### Files Modified

* `backend/app/services/ticket_service.py` — advisory locks + multi-ticket atomicity comment
* `backend/app/services/auth_service.py` — account lockout rewrite of authenticate_user
* `backend/app/services/booking_service.py` — _check_capacity call
* `backend/app/services/user_service.py` — route-scope check on admin_reset_password
* `backend/app/models/ferry_schedule.py` — capacity column
* `backend/app/models/ticket.py` — verification_code unique=True
* `backend/app/models/booking.py` — verification_code unique=True
* `backend/app/models/user.py` — failed_login_attempts + locked_until columns
* `backend/app/routers/verification.py` — rate limiting on all endpoints
* `backend/app/routers/reports.py` — rate limiting on all endpoints
* `backend/app/routers/tickets.py` — rate limiting on list endpoint
* `backend/app/routers/rate_change_logs.py` — rate limiting on all endpoints
* `backend/app/middleware/security.py` — X-XSS-Protection + X-Permitted-Cross-Domain-Policies
* `backend/app/config.py` — SECRET_KEY field_validator
* `backend/app/schemas/user.py` — security comment on UserRead
* `backend/app/schemas/portal_user.py` — security comment on PortalUserRead
* `backend/gunicorn.conf.py` — configurable forwarded_allow_ips
* `backend/scripts/ddl.sql` — capacity column, payment_transactions table, unique indexes, CHECK constraints, lockout columns
* `backend/Dockerfile` — pinned python:3.12.8-slim
* `frontend/next.config.ts` — removed unsafe-eval from CSP
* `frontend/src/app/dashboard/page.tsx` — removed console.error
* `frontend/src/app/login/page.tsx` — redirect param with validation
* `frontend/src/app/customer/login/page.tsx` — redirect param with validation
* `frontend/Dockerfile` — pinned node:20.18-alpine
* `apps/checker/src/services/storageService.ts` — removed AsyncStorage token fallback
* `apps/checker/src/screens/QRScannerScreen.tsx` — QR payload validation
* `apps/checker/src/screens/HomeScreen.tsx` — manual entry upper bound
* `apps/checker/app.json` — removed RECORD_AUDIO permission
* `docker-compose.prod.yml` — Redis auth, FORWARDED_ALLOW_IPS, pinned images
* `docker-compose.yml` — pinned postgres image

### Database Migrations

* **Required:** Run `alembic revision --autogenerate -m "security hardening"` then `alembic upgrade head` to apply:
  - `ferry_schedules.capacity` column (INTEGER NOT NULL DEFAULT 0)
  - `tickets.verification_code` UNIQUE constraint
  - `bookings.verification_code` UNIQUE constraint
  - `users.failed_login_attempts` column (if not already present)
  - `users.locked_until` column (if not already present)
* The DDL patches at the bottom of `ddl.sql` handle existing databases via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` and `ADD CONSTRAINT` statements. These are idempotent and can also be run directly.

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
alembic revision --autogenerate -m "security hardening"
alembic upgrade head
sudo systemctl restart ssmspl
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

Docker (if using Docker deployment):
```bash
docker compose -f docker-compose.prod.yml up --build -d
```

### Notes

* **Account lockout:** After 5 failed login attempts, the account is locked for 15 minutes. The lockout counter resets on successful login. The generic "Incorrect username or password" error message does not reveal whether the account is locked (prevents enumeration).
* **Rate limiting:** All verification endpoints now have rate limits (30/min for lookups, 15/min for check-in). All report endpoints are limited to 10/min. Ticket listing is 30/min. These are per-IP limits via slowapi + Redis.
* **Redis password:** Production Redis now requires authentication. The password defaults to `ssmspl_redis_prod` but can be overridden via `REDIS_PASSWORD` env var. The `RATE_LIMIT_STORAGE_URI` is updated to include the password.
* **Docker image pins:** Images are pinned to specific patch versions. Update these periodically for security patches.
* **Mobile app:** The checker app changes require a new build and deployment via Expo/EAS. The RECORD_AUDIO permission removal is a breaking change for app store metadata — update the store listing if needed.
* **Capacity check:** The `_check_capacity()` function treats capacity=0 as unlimited. Set capacity values on ferry schedules via the admin API to enable overbooking prevention.
* **Payment queries:** Additional payment gateway security queries (auth on /initiate, /simulate, TOCTOU on amounts, stale transactions) are logged in `analysis_issues/payment_issues.md` for future work. Payment simulation mode is left enabled per project decision.

---

## Deployment Update — 2026-03-16

### Module

Ticketing — Audit Integrity Fix + Receipt Label Rename

### Commit ID

937beb5

### Changes

* **Fixed ticket audit integrity — BY field no longer changes with logged-in user** — The receipt `BY:` field was sourced from the currently logged-in user (`user?.username`) instead of the original ticket creator. When a Superadmin logged in and reprinted a ticket originally created by a billing operator, the receipt would incorrectly show `BY: superadmin`. The `created_by` UUID was already correctly stored in the tickets table via `AuditMixin` at creation time — the bug was purely in the display layer.
* **Backend: added `created_by_username` to ticket API response** — New `_get_username()` helper in `ticket_service.py` resolves `tickets.created_by` UUID → `users.username`. The `_enrich_ticket()` function now includes `created_by_username` in every ticket response. Added `created_by_username` field to `TicketRead` Pydantic schema.
* **Frontend: receipt BY field now uses ticket creator, not current user** — Both print paths (new ticket creation and reprint) now use `ticket.created_by_username` with fallback to `user?.username` only if null.
* **Renamed "CASH MEMO NO" to "TICKET MEMO NO"** on thermal receipts (58mm and 80mm).

### Security Validation

* `created_by` is **immutable by design** — `TicketUpdate` schema has no `created_by` or `created_by_username` field
* `update_ticket()` only touches: departure, route_id, payment_mode_id, discount, amount, net_amount, is_cancelled, items
* No API endpoint allows modification of audit fields

### Files Modified

* `backend/app/services/ticket_service.py` — added `User` import, `_get_username()` helper, `created_by_username` in `_enrich_ticket()` (included in prior commit dae56e3)
* `backend/app/schemas/ticket.py` — added `created_by_username: str | None` to `TicketRead`
* `frontend/src/app/dashboard/ticketing/page.tsx` — changed `createdBy` from `user?.username` to `ticket.created_by_username || user?.username` in both new-ticket and reprint paths (included in prior commit dae56e3)
* `frontend/src/types/index.ts` — added `created_by_username` to `Ticket` interface
* `frontend/src/lib/print-receipt.ts` — renamed `CASH MEMO NO` to `TICKET MEMO NO`

### Database Migrations

* None — `created_by` UUID column already exists on tickets table via `AuditMixin`. No schema change needed.

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
sudo systemctl restart ssmspl
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* Both backend and frontend must be deployed together. The backend now returns `created_by_username` in ticket responses; the frontend expects it for receipt printing.
* No database migration needed — the `created_by` UUID was already stored correctly for all existing tickets. The fix only changes how it is resolved and displayed.
* The multi-ticketing page (`/dashboard/multiticketing`) print view does not display a `BY:` field and is unaffected.
* Fallback to `user?.username` only applies if `created_by_username` is null (e.g., very old tickets with no `created_by` set). All tickets created after the system's auth integration will have the correct value.

---

## Deployment Update — 2026-03-16

### Module

Rate Change Logs — 500 Error Fix

### Commit ID

ecf0df5

### Changes

* **Root cause: N+1 query pattern causing 500 under load** — The list endpoint executed 3 separate DB queries per row (item name via `Item`, route display name via `Route`+`Branch`×2, user full name via `User`) inside a Python loop. With the default 50-row page limit, each request triggered 150+ individual queries, causing timeouts and connection exhaustion under production load.
* **Service: replaced N+1 loop with single LEFT JOIN query** — `get_rate_change_logs()` now uses `outerjoin(Item)`, `outerjoin(Route)`, `outerjoin(BranchOne)`, `outerjoin(BranchTwo)`, `outerjoin(UpdatedByUser)` in a single SELECT. Removed the `_get_route_display_name()` helper (no longer needed).
* **Service: extracted shared filter helpers** — `_apply_role_filter()` (async, handles MANAGER/ADMIN/SUPER_ADMIN visibility) and `_apply_optional_filters()` (date_from, date_to, route_id, item_id) are now shared between `get_rate_change_logs()` and `count_rate_change_logs()`, eliminating duplicated filter logic.
* **Service: defensive null guard on count** — `result.scalar() or 0` prevents potential None return.
* **Schema: removed fragile alias pattern** — Replaced `change_date: DateType = Field(..., alias="date")` / `change_time: TimeType = Field(..., alias="time")` with direct field names `date` and `time`. Removed unnecessary `populate_by_name` config. This was the only schema in the project using aliases.
* **Contributing factor: missing DB columns** — The User model includes `failed_login_attempts` and `locked_until` columns (added in security hardening commit dc5ed99) but the corresponding `ALTER TABLE` statements from `ddl.sql` were never applied to the database. This causes `select(User)` to fail with `UndefinedColumnError`, breaking ALL authenticated endpoints including rate change logs.

### Files Modified

* `backend/app/services/rate_change_log_service.py` — N+1 → single JOIN query, shared filter helpers
* `backend/app/schemas/rate_change_log.py` — simplified field names, removed aliases

### Database Migrations

* **Required (from prior commit dc5ed99, never applied):**
```sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
```

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate

# Apply missing user columns (required — fixes 500 on ALL authenticated endpoints)
psql -U postgres -d ssmspl_db -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;"
psql -U postgres -d ssmspl_db -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;"

sudo systemctl restart ssmspl
```

Frontend:
```bash
# No frontend changes — skip
```

### Notes

* **The missing `failed_login_attempts` / `locked_until` columns affect ALL authenticated endpoints, not just rate change logs.** These were added to the User model in commit dc5ed99 (security hardening) but the DDL was never run on the database. The `ALTER TABLE ... IF NOT EXISTS` statements are idempotent and safe to run multiple times.
* Backend-only change. No frontend rebuild needed — the frontend already expects `date`, `time`, `item_name`, `route_name`, `updated_by_name` fields which are unchanged.
* The query optimization reduces rate change log list queries from ~150 per request to 1 (single JOIN). This eliminates the timeout/connection exhaustion under load.

---

## Deployment Update — 2026-03-16

### Module

Security Hardening — Second Pass (6 additional fixes)

### Commit ID

d6435e3

### Changes

* **Email case-sensitivity fix** — All 8 portal email lookup entry points in `portal_auth_service.py` now normalize emails to lowercase with `email = email.lower()` before DB queries. Prevents `TEST@example.com` and `test@example.com` being treated as different accounts. Also normalizes email on registration so new accounts are always stored lowercase.
* **Payment transaction expiry** — INITIATED payment transactions older than 30 minutes are now automatically rejected. The `initiate_checkout` and `simulate_checkout` endpoints add a `created_at >= now() - 30min` filter to INITIATED transaction queries. Stale transactions get "Invalid or expired payment link" response.
* **Booking amount locking (TOCTOU fix)** — `create_order` now locks the booking row with `SELECT ... FOR UPDATE` before reading the amount and creating a PaymentTransaction. Prevents race condition where booking amount changes between order creation and payment callback.
* **Duplicate transaction prevention** — `create_order` checks for an existing non-expired INITIATED transaction for the same booking before creating a new one. Reuses the existing transaction if found, preventing duplicate payment entries.
* **Session idle timeout** — Added 30-minute inactivity auto-logout to both admin portal (`DashboardShell.tsx`) and customer portal (`CustomerLayout.tsx`). Monitors mousedown, keydown, touchstart, and scroll events. Redirects to `/login?reason=idle_timeout` or `/customer/login?reason=idle_timeout` on timeout.
* **Disabled production source maps** — Added `productionBrowserSourceMaps: false` to `next.config.ts` to prevent source code exposure in production builds.

### Files Modified

* `backend/app/services/portal_auth_service.py` — email normalization with `.lower()` in all 8 functions
* `backend/app/routers/portal_auth.py` — email normalization in Google OAuth callback
* `backend/app/routers/portal_payment.py` — payment expiry filter, booking row lock, duplicate transaction check
* `frontend/src/components/dashboard/DashboardShell.tsx` — idle timeout useEffect
* `frontend/src/components/customer/CustomerLayout.tsx` — idle timeout useEffect
* `frontend/next.config.ts` — productionBrowserSourceMaps: false

### Database Migrations

* None — all changes are application-level logic. No schema changes required.

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
sudo systemctl restart ssmspl
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Remaining Items (Documented, Not Code-Fixable)

These items require external services or dependencies and are documented in `analysis_issues/remaining_hardening_items.md`:
* **RH-01**: No CAPTCHA on customer registration (needs reCAPTCHA API key)
* **RH-02**: No explicit CSRF tokens (mitigated by SameSite + CORS + Bearer tokens)
* **RH-03**: Offline queue stored in plaintext AsyncStorage (needs expo-crypto dep, SecureStore has 2KB limit)
* **RH-04**: No monitoring/error tracking (needs Sentry account + SDK)
* **RH-05**: No email notification on admin password reset (needs SMTP configured)

### Notes

* Both backend and frontend must be restarted for all changes to take effect.
* The email normalization is backward-compatible — existing lowercase emails in the database will match as before. If any existing portal users registered with uppercase emails, they can now log in with any case variation.
* The 30-minute idle timeout applies to both admin and customer portals. The timer resets on any user interaction (mouse, keyboard, touch, scroll). Browser tab visibility changes do NOT reset the timer.
* Payment transaction expiry does NOT cancel the associated booking — it only rejects the stale payment link. The booking remains in PENDING status and the user can initiate a new payment.

---

## Deployment Update — 2026-03-16

### Module

Security Hardening — Third Pass (8 fixes)

### Commit ID

5846453

### Changes

* **Access token TTL reduced from 30 to 5 minutes** — After logout, the access JWT is now valid for at most 5 minutes instead of 30. Refresh tokens (7-day) handle session continuity transparently. This minimizes the window where a stolen/leaked access token can be abused.
* **Role escalation prevention** — Non-SUPER_ADMIN users can no longer create ADMIN or SUPER_ADMIN accounts. The `create_user` service now checks `current_user.role == SUPER_ADMIN` before allowing ADMIN/SUPER_ADMIN role assignment. Returns 403 Forbidden otherwise.
* **DB connection pool tuning** — Changed from `pool_size=10, max_overflow=20` (30 max per worker) to `pool_size=5, max_overflow=10` (15 max per worker). With 5 Gunicorn workers, this caps at 75 total connections — safely under PostgreSQL's default `max_connections=100`.
* **Health endpoint simplified** — `/health` now returns only `{"status":"ok"}` instead of exposing app name, database connectivity status, and environment. Docker/nginx healthchecks continue to work since they only check HTTP 200.
* **Portal user password column widened** — `portal_users.password` changed from `VARCHAR(60)` to `VARCHAR(255)` to future-proof against hash algorithm changes. DDL patch included for existing databases.
* **6 performance indexes added** — Composite indexes on `tickets(ticket_date, branch_id, route_id)`, `bookings(travel_date, branch_id, route_id)`, `ticket_payement(ticket_id)`, `booking_items(booking_id)`, plus single-column indexes on `tickets(payment_mode_id)` and `bookings(portal_user_id)`. These prevent full table scans in report queries as data grows past 100k rows.
* **security.txt added** — `/.well-known/security.txt` provides vulnerability disclosure contact information.
* **Duplicate check-in prevention verified** — Confirmation that `verification_service.verify()` already returns 409 CONFLICT for already-verified bookings/tickets. No code change needed.

### Files Modified

* `backend/app/config.py` — ACCESS_TOKEN_EXPIRE_MINUTES: 30 → 5
* `backend/app/database.py` — pool_size: 10 → 5, max_overflow: 20 → 10
* `backend/app/main.py` — simplified health endpoint
* `backend/app/models/portal_user.py` — password String(60) → String(255)
* `backend/app/services/user_service.py` — role escalation check in create_user
* `backend/scripts/ddl.sql` — password column patch + 6 performance indexes
* `frontend/public/.well-known/security.txt` (new)

### Database Migrations

**Required — run these SQL statements on production:**

```sql
-- Password column width (safe — existing hashes are 60 chars, column grows to 255)
ALTER TABLE portal_users ALTER COLUMN password TYPE VARCHAR(255);

-- Performance indexes (idempotent — IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_tickets_date_branch_route ON tickets (ticket_date, branch_id, route_id);
CREATE INDEX IF NOT EXISTS idx_tickets_payment_mode ON tickets (payment_mode_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date_branch_route ON bookings (travel_date, branch_id, route_id);
CREATE INDEX IF NOT EXISTS idx_bookings_portal_user ON bookings (portal_user_id);
CREATE INDEX IF NOT EXISTS idx_ticket_payement_ticket_id ON ticket_payement (ticket_id);
CREATE INDEX IF NOT EXISTS idx_booking_items_booking_id ON booking_items (booking_id);
```

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate

# Run DDL patches
psql -U postgres -d ssmspl_db -f scripts/ddl.sql

sudo systemctl restart ssmspl
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* **Access token TTL change**: Users may notice slightly more frequent token refreshes (every 5 min instead of 30 min). This is transparent — the Axios interceptor handles refresh automatically. If users report being logged out unexpectedly, check that the refresh token flow is working correctly.
* **Connection pool change**: Monitor PostgreSQL connection count after deployment with `SELECT count(*) FROM pg_stat_activity;`. If connections are frequently exhausted under load, increase `pool_size` but ensure `pool_size × workers < max_connections`.
* **Index creation**: The `CREATE INDEX` statements may take a few seconds on large tables. They use `IF NOT EXISTS` so they're safe to re-run. For very large tables (500k+ rows), consider `CREATE INDEX CONCURRENTLY` instead (requires running outside a transaction).
* **Role escalation**: Existing ADMIN-created ADMIN accounts are NOT affected. The check only applies to new user creation going forward.

---

## Deployment Update — 2026-03-16

### Module

Architecture Hardening — Redis Token Blacklist + Automated DB Backups

### Commit ID

51a0a50

### Changes

* **Redis-based access token blacklist** — Tokens are now instantly invalidated on logout. When a user logs out, the access token's JTI (JWT ID) is stored in Redis with TTL = remaining token lifetime (max 5 minutes). Every authenticated request checks the JTI against the blacklist before granting access. If Redis is unavailable, the system falls back to the existing session-ID enforcement (graceful degradation).
* **JTI claim added to all access tokens** — Every access token now includes a unique `jti` (JWT ID) field generated via `uuid4()`. This is the key used for blacklist lookups.
* **Automated daily database backups** — New `db-backup` Docker service runs `pg_dump` daily at 2:00 AM. Backups are gzip-compressed and stored in a `db-backups` Docker volume. Old backups are automatically rotated after 7 days.
* **Backup and restore scripts** — `backend/scripts/backup_db.sh` (pg_dump + gzip + rotation) and `backend/scripts/restore_db.sh` (gunzip + psql with safety prompt).
* **Redis added to dev Docker compose** — Development environment now includes Redis for local testing of token blacklist and rate limiting.
* **DB connection pool tuned** — Changed from `pool_size=10, max_overflow=20` to `pool_size=5, max_overflow=10`. Prevents exceeding PostgreSQL's default `max_connections=100` when running multiple Gunicorn workers.

### Files Modified

* `backend/app/services/token_blacklist.py` (new — Redis blacklist service)
* `backend/scripts/backup_db.sh` (new — daily backup script)
* `backend/scripts/restore_db.sh` (new — restore script)
* `backend/app/core/security.py` — added JTI claim to access tokens
* `backend/app/dependencies.py` — blacklist check in get_current_user + get_current_portal_user
* `backend/app/services/auth_service.py` — blacklist access token on admin logout
* `backend/app/services/portal_auth_service.py` — blacklist access token on portal logout
* `backend/app/routers/auth.py` — pass access token to logout service
* `backend/app/routers/portal_auth.py` — pass access token to portal logout service
* `backend/app/main.py` — init/close Redis in app lifespan
* `backend/app/config.py` — added REDIS_URL setting
* `backend/app/database.py` — tuned pool_size and max_overflow
* `backend/.env.example` — documented REDIS_URL
* `docker-compose.yml` — added Redis service for dev
* `docker-compose.prod.yml` — added REDIS_URL env var + db-backup service + db-backups volume

### Database Migrations

* None — all changes are application-level. No schema changes.

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
sudo systemctl restart ssmspl
```

Frontend:
```bash
# No frontend changes — skip
```

Docker (if using Docker deployment):
```bash
# Rebuild with new backup service
docker compose -f docker-compose.prod.yml up --build -d
```

### Post-Deployment Verification

```bash
# Verify Redis connectivity (from backend container)
docker exec ssmspl-backend python -c "
import asyncio, redis.asyncio as r
async def test():
    c = r.from_url('redis://:ssmspl_redis_prod@redis:6379/0', decode_responses=True)
    await c.ping()
    print('Redis OK')
asyncio.run(test())
"

# Verify backup service is running
docker logs ssmspl-db-backup-1 --tail 5

# Trigger a manual backup to test
docker exec ssmspl-db-backup-1 /scripts/backup_db.sh

# List backups
docker exec ssmspl-db-backup-1 ls -lh /backups/
```

### Notes

* **Token blacklist requires Redis** — In production, Redis is already running for rate limiting. The blacklist uses Redis DB 0 (rate limiting uses DB 1). In development without Docker, set `REDIS_URL=` (empty) to disable the blacklist — session-ID enforcement remains as backup.
* **Backup volume** — Backups are stored in the `db-backups` Docker volume. To access backups from the host, use `docker cp` or mount the volume to a host directory. For off-site backup, add a cron job to copy from the volume to S3/GCS.
* **Restore procedure** — To restore from backup: `docker exec -i ssmspl-db-backup-1 /scripts/restore_db.sh /backups/<filename>.sql.gz`. The script has a 5-second safety delay before overwriting.
* **Connection pool tuning** — With `pool_size=5, max_overflow=10` and 5 Gunicorn workers, max connections = 75 (safely under PG's default 100). If you increase workers or add replicas, adjust accordingly.

---

## Deployment Update — 2026-03-17

### Module

Ticketing / Print Receipt — Restore Footer Summary

### Commit ID

7c12f83

### Changes

* **Restored footer summary rows on thermal receipt** — The bottom summary block (DATE, BY, TICKET MEMO NO, PAYMENT MODE, NET TOTAL) was previously removed in commit 045bd22. This block provides a quick reference below the tear-off line and has been brought back by user request.
* The footer `BY:` field uses the same audit-safe `created_by_username` as the header — it always shows the original ticket creator, not the currently logged-in user.

### Files Modified

* `frontend/src/lib/print-receipt.ts` — added 5 lines restoring footer summary block after the NOTE/HAPPY JOURNEY section

### Database Migrations

* None

### Deployment Steps (VPS)

Backend:
```bash
# No backend changes — skip
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* Frontend-only change. No backend restart or database migration needed.
* The footer repeats key info (date, time, operator, memo no, payment mode, net total) below the note section, before the QR code. Both header and footer BY fields are audit-safe.

---

## Deployment Update — 2026-03-25

### Module

Reporting Layer (backend)

### Commit ID

86a7f5f

### Changes

* Added complete async reporting layer (`backend/app/reporting/`) with 4 report types:
  * **Date-wise Amount** — daily revenue totals split by POS and Portal with grand total
  * **Payment Mode Report** — per-mode revenue breakdown across POS and Portal with grand total
  * **Item-wise Summary** — per-item quantities and net amounts with POS/Portal split, payment-mode breakdown, and internal integrity check (`grand_total == sum(payment_breakdown)`)
  * **Ferry-wise Item Summary** — per-departure-slot item quantities with POS/Portal columns; NULL departure (walk-in / open-schedule) kept as `None` internally and sorted last
* Added shared reporting infrastructure:
  * `filters.py` — `ReportFilters` dataclass, `DataSource` enum (`POS` / `PORTAL` / `ALL`), `get_source_flags()` helper
  * `query_helpers.py` — `apply_pos_filters` (uses `ticket_date`) and `apply_portal_filters` (uses `travel_date`, filters by `status == CONFIRMED`) with shared WHERE-clause logic
  * `merge.py` — `merge_by_key(skip_sum=...)` generic POS+Portal row merger; `skip_sum` prevents non-numeric key fields (rate, levy, departure) from being doubled on merge
  * `sorting.py` — `sort_by_departure_then_item` (NULL departure sorts last) and `sort_by_item_name` helpers
* Added `audit_reporting.py` — standalone async validation script (86 checks across 13 sections, all PASS):
  * Financial consistency: `date_wise == payment_mode == item_wise == 2035`
  * Source isolation: `ALL == POS + PORTAL` for all 3 report types
  * Payment mode filters: no cross-source leakage
  * Cancellation handling: cancelled tickets, cancelled items, and PENDING bookings all excluded
  * Date alignment: Portal correctly uses `travel_date` not `booking_date`
  * Item-wise row detail and integrity check
  * Ferry-wise row detail and sort order
  * Edge cases: empty date range, POS-only mode, Portal-only mode
  * Merge correctness: no duplicate rows, totals additive
  * Performance: 4 reports on ~1000 rows completed in 72ms

### Files Added

* `backend/app/reporting/__init__.py`
* `backend/app/reporting/filters.py`
* `backend/app/reporting/merge.py`
* `backend/app/reporting/query_helpers.py`
* `backend/app/reporting/sorting.py`
* `backend/app/reporting/reports/__init__.py`
* `backend/app/reporting/reports/date_wise_amount.py`
* `backend/app/reporting/reports/payment_mode_report.py`
* `backend/app/reporting/reports/item_wise_summary.py`
* `backend/app/reporting/reports/ferry_wise_item_summary.py`
* `backend/audit_reporting.py` (dev/validation script — not deployed)

### Database Migrations

* None

### Deployment Steps (VPS)

Backend:
```bash
cd backend
sudo systemctl restart ssmspl
```

Frontend:
```bash
# No frontend changes — skip
```

### Notes

* Backend-only change. No database migration needed.
* The reporting layer is consumed by existing report router endpoints — no new routes added in this commit. Report routers wire `ReportFilters` from request query params and call the appropriate `get_*` function.
* `audit_reporting.py` is a local-only validation script that runs against `ssmspl_db_test`. It is not deployed to production.
* Test files live under `backend/tests/` which is in `.gitignore` — unit tests (45 tests across `tests/unit/test_item_wise_summary.py` and `tests/unit/test_ferry_wise_item_summary.py`) and integration tests (40 tests across `tests/test_item_wise_summary.py` and `tests/test_ferry_wise_item_summary.py`) are present locally but not committed.

---

## Deployment Update — 2026-03-25

### Module

Reports — Thermal Print (frontend)

### Commit ID

e55312d

### Changes

* Added `frontend/src/lib/print-itemwise-summary.ts` — pure-text thermal formatter for the Item Wise Summary report:
  * `formatItemWiseForPrint(reportData, metaData): string` — returns a strict ≤ 40-char-per-line monospace string ready for `<pre>` or direct ESC/POS output
  * `enforceWidth(line)` safety guard applied to every output line — no line can exceed 40 chars
  * Item-wrap rule: **first chunk carries Rate / Qty / Net columns**; overflow chunks appear on subsequent lines with no numeric columns (matches legacy thermal behavior)
  * TOTAL row and payment breakdown lines dynamically right-anchored to column 40 regardless of amount magnitude
  * `printItemWiseSummary()` — iframe-based printer using `<pre>` with `font-family: monospace; font-size: 10px; line-height: 1.2; @page { size: 80mm auto; margin: 0 }`
  * Debug helper: `console.log` of per-line lengths emitted on every format call (remove before go-live)
* Added `frontend/src/components/reports/ItemWisePrintView.tsx` — standalone React component wrapping the formatter in a `<pre>` preview with a `window.print()` Print button; `@media print` hides all other page elements
* Updated `frontend/src/app/dashboard/reports/page.tsx`:
  * Added `handlePrintItemwiseThermal()` — resolves branch name, route label, and payment mode label from current filter state then calls `printItemWiseSummary()`
  * Added **Print 80mm** button in the report header action bar, visible when the **Item Wise Summary** tab is active and has data (mirrors existing Branch Summary button)

### Files Added

* `frontend/src/lib/print-itemwise-summary.ts`
* `frontend/src/components/reports/ItemWisePrintView.tsx`

### Files Modified

* `frontend/src/app/dashboard/reports/page.tsx`

### Database Migrations

* None

### Deployment Steps (VPS)

Backend:
```bash
# No backend changes — skip
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* Frontend-only change. No backend restart or database migration needed.
* The `console.log("[ItemWisePrint] line lengths:", ...)` debug statement in `formatItemWiseForPrint` should be removed once printing is validated on a real thermal printer.
* `ItemWisePrintView` component is available for embedding in dialogs or standalone pages — it is not yet wired into any route, only the reports page uses the iframe path (`printItemWiseSummary`) via the Print 80mm button.
* Column layout: Item 18 chars (left) + Rate 6 (right) + Qty 5 (right) + Net 9 (right) = 38 chars total, leaving 2-char margin on 40-char paper.

---

## Deployment Update — 2026-03-25

### Module

Reports — Thermal Print refinement (frontend)

### Commit ID

818b9ba

### Changes

* `COL_ITEM` increased from 18 → 20; data rows now fill exactly 40 chars (`20+6+5+9 = 40`) with no trailing gap
* Added `normalizePaymentLabel()` with `PAYMENT_LABEL_MAP` lookup table and partial-match fallbacks:
  * `CASH` / any name containing "CASH" → `CASH MEMO`
  * `UPI`, `GPAY`, `UPI/GPAY`, `PHONEPE`, `PAYTM`, or any name containing those terms → `GPAY`
  * `ONLINE` / any name containing "ONLINE" → `ONLINE`
  * Unrecognised modes fall back to raw uppercased name
* iframe CSS fixed: explicit `margin: 0; padding: 0` on `body`; `margin: 0; padding: 0 2px` on `pre`; removed overreaching `* { margin:0; padding:0 }` reset that was suppressing pre padding; `@media print` block mirrors same rules
* Header blank line between BRANCH NAME and ITEM WISE SUMMARY confirmed in place (no change needed)

### Files Modified

* `frontend/src/lib/print-itemwise-summary.ts`

### Database Migrations

* None

### Deployment Steps (VPS)

Backend:
```bash
# No backend changes — skip
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* Frontend-only change. No backend restart or database migration needed.
* If the client's payment modes in the database use different names (e.g. "Cash Payment", "Google Pay"), add them to `PAYMENT_LABEL_MAP` in `print-itemwise-summary.ts` before go-live.

---

## Deployment Update — 2026-03-25

### Module

Reports — Thermal Print column/wrap fix (frontend)

### Commit ID

e445fc3

### Changes

* Column widths updated: `COL_ITEM` 20 → 22, `COL_QTY` 5 → 4, `COL_NET` 9 → 8 (total remains 40)
* `splitItemName()` rewritten — no longer hard-breaks mid-word; only splits at spaces; a single word longer than 22 chars is placed on its own line intact and `enforceWidth()` caps the final printed line at 40 chars
* First-line-carries-values rule (rate/qty/net on first item line, overflow lines text-only) confirmed correct and unchanged

### Files Modified

* `frontend/src/lib/print-itemwise-summary.ts`

### Database Migrations

* None

### Deployment Steps (VPS)

Backend:
```bash
# No backend changes — skip
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* Frontend-only change. No backend restart or database migration needed.

---

## Deployment Update — 2026-03-26

### Module

Reports — Thermal Print item-row wrapping fix (frontend)

### Commit ID

73edd76

### Changes

* Removed `splitItemName()` and replaced item-row rendering with `buildItemLines(name, rateStr, qtyStr, netStr)`:
  * Greedy first-line fill — adds words to `firstLine` until the next word would exceed `COL_ITEM` (22 chars)
  * **First line always carries rate / qty / net columns** — structurally guaranteed, not dependent on chunk ordering
  * Remaining words wrap onto subsequent text-only lines using the same word-boundary logic
  * Safety guard: if no word fits within `COL_ITEM` (e.g. single oversized token), forces the first word onto line 1 so values always have a label
* Upgraded debug console output to verbose per-line format: `console.log(i, line, "| length:", line.length)` inside `==== FORMATTED OUTPUT START/END ====` markers

### Files Modified

* `frontend/src/lib/print-itemwise-summary.ts`
* `frontend/src/app/dashboard/reports/page.tsx` (diagnostic console.log lines)

### Database Migrations

* None

### Deployment Steps (VPS)

Backend:
```bash
# No backend changes — skip
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* Frontend-only change. No backend restart or database migration needed.
* After deploying, open DevTools console and click "Print 80mm". Confirm every row's line 0 ends with rate/qty/net values. Remove all console.log debug statements once confirmed.

---

## Deployment Update — 2026-03-26

### Module

Reports — Multiple print buttons fix + stale chunk 404 (frontend)

### Commit ID

b8edf75

### Changes

* Fixed duplicate print buttons on Item Wise Summary and Branch Summary tabs:
  * Root cause: the A4 "Print" button had no condition — it rendered for every report type
  * Fix: wrapped A4 "Print" button in `activeReport.key !== "itemwise-levy" && activeReport.key !== "branch-item-summary"` guard
  * Button matrix is now: thermal reports → `Print 80mm` + `Download PDF` only; all other reports → `Print` (A4) + `Download PDF`

### Files Modified

* `frontend/src/app/dashboard/reports/page.tsx`

### Database Migrations

* None

### Deployment Steps (VPS)

Backend:
```bash
# No backend changes — skip
```

Frontend:
```bash
cd frontend
rm -rf .next        # REQUIRED — clears stale chunk hashes causing 404 errors
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* The `rm -rf .next` step is critical. Without it, browsers with a cached old HTML page will request old chunk filenames that no longer exist after rebuild, producing 404 errors and "Refused to execute script" MIME type errors. This is not a code bug — it is a stale build artifact issue.
* Users who see 404 chunk errors after deployment must hard-refresh their browser: Ctrl+Shift+R (Windows/Linux) or Cmd+Shift+R (Mac).

---

## Deployment Update — 2026-03-26

### Module

Reports — Debug cleanup + dead code removal (frontend)

### Commit ID

b2df6f9

### Changes

* Removed all diagnostic `console.log` statements that were added during tracing:
  * `reports/page.tsx`: `PRINT FUNCTION HIT` and `FORMATTER USED` lines removed from `handlePrintItemwiseThermal`
  * `print-itemwise-summary.ts`: `==== FORMATTED OUTPUT START/END ====` block removed from `formatItemWiseForPrint`
* Deleted `frontend/src/components/reports/ItemWisePrintView.tsx` — component was never imported or used anywhere in the app; the reports page exclusively uses the iframe-based `printItemWiseSummary` path

### Files Modified

* `frontend/src/app/dashboard/reports/page.tsx`
* `frontend/src/lib/print-itemwise-summary.ts`

### Files Deleted

* `frontend/src/components/reports/ItemWisePrintView.tsx`

### Database Migrations

* None

### Deployment Steps (VPS)

Frontend:
```bash
cd frontend
rm -rf .next
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* Frontend-only change. No backend restart or database migration needed.
* `rm -rf .next` before build is mandatory to clear stale chunk hashes that cause 404 errors in the browser.

---

## Deployment Update — 2026-03-26

### Module

Reports — Item Wise Summary Thermal Print

### Commit ID

cc71408

### Changes

* Rewrote `buildPrintHtml` in `print-itemwise-summary.ts` to use HTML `<table>` layout instead of `<pre>` plain-text approach
* Root cause of column misalignment: `<pre>` with manually padded strings relies on equal glyph widths, which browser print contexts cannot guarantee (especially with bold text). CSS `col` widths + browser-native table layout is always pixel-accurate
* New implementation matches the confirmed-working architecture of `print-branch-summary.ts`
* Key CSS: `"Courier New"` 12px explicit font, `col.num { width: 48px }`, `td.r { text-align: right; white-space: nowrap }`, `transform: scale(0.92)` at print time
* `printItemWiseSummary` now calls `buildPrintHtml(reportData, metaData)` directly (no intermediate plain-text formatter)
* `formatItemWiseForPrint` (plain-text ESC/POS formatter) remains unchanged for future ESC/POS use

### Files Modified

* `frontend/src/lib/print-itemwise-summary.ts`

### Deployment Steps

```bash
# On VPS frontend
rm -rf .next
npm run build
sudo systemctl restart ssmspl-frontend
```

> Note: `rm -rf .next` is required before every build to prevent stale chunk 404 errors in browser.

---

## Deployment Update — 2026-03-26

### Module

Frontend — Ticketing / Multi-ticketing (single-payment enforcement)

### Commit ID

8223dd0

### Changes

**Ticketing page** (`/dashboard/ticketing`):
* UPI mode: hides "Amount Received" and "Change" fields — these are Cash-only
* UPI mode: received-amount validation (`> 0`, `>= net_amount`) no longer fires for UPI
* UPI mode: `autoFocus` now lands on the UPI Reference ID input, not the hidden Amount Received field
* Extracted `isUpiMode` derived variable — replaces duplicate inline `paymentModes.find(...)` calls

**Multi-ticketing page** (`/dashboard/multiticketing`):
* Added `refNo: string` field to `TicketGrid` interface
* Switching payment mode on a ticket now clears its `refNo` (prevents stale UPI refs)
* UPI ref_no input field shown inline per ticket card when UPI payment mode is selected
* Validation: UPI ticket without a `ref_no` blocks Save & Print (alert message)
* Save & Print button disabled when any UPI ticket is missing its ref_no
* Fixed payload: `ref_no` now sent from `t.refNo.trim() || null` instead of hardcoded `null`

### Files Modified

* `frontend/src/app/dashboard/ticketing/page.tsx`
* `frontend/src/app/dashboard/multiticketing/page.tsx`

### Database Migrations

* None

### Deployment Steps (VPS)

Backend:
```bash
# No backend changes — skip
```

Frontend:
```bash
cd frontend
rm -rf .next
npm run build
sudo systemctl restart ssmspl-frontend
```

### Notes

* Frontend-only change. No backend restart or database migration needed.
* Split payment (multiple payment rows per ticket) is now fully impossible from the frontend. Single payment mode per ticket is enforced at UI, validation, and payload level.
* The `received_amount` / Change display is Cash-only. UPI tickets only require a Reference ID.
* Multi-ticketing previously hardcoded `ref_no: null` for all tickets — UPI batch tickets now correctly carry their reference IDs to the backend.

---

## Deployment Update — 2026-03-30

### Module

Rate Change Logs

### Commit ID

6800341

### Changes

* Fixed default date filter on Rate Change Logs page — was filtering to today only, making the page always appear empty on load
* Default now shows last 30 days (`dateFrom = today - 30 days`, `dateTo = today`)

### Files Modified

* `frontend/src/app/dashboard/rate-change-logs/page.tsx`

### Database Migrations

* None

### Deployment Steps (VPS)

**Step 1 — Verify / create the `rate_change_logs` table**

The table is created by Alembic migration `e8f2a4b61c93` and is **not** in `ddl.sql`. Check whether it already exists:

```bash
psql -U ssmspl_user -d ssmspl_db -c "\dt rate_change_logs"
```

- If the table **does not exist**, run the migration:
  ```bash
  cd backend
  source .venv/bin/activate
  alembic upgrade head
  sudo systemctl restart ssmspl
  ```
- If it **already exists**, skip this step — `alembic upgrade head` is idempotent but will skip re-creating it.

**Step 2 — Deploy frontend**

```bash
cd frontend
rm -rf .next
npm run build
sudo systemctl restart ssmspl-frontend
```

### Important Notes

* **Log data starts from when the migration is first applied.** There is no historical backfill — changes made before `e8f2a4b61c93` was deployed will not appear.
* **Only rate changes are logged**, not levy changes. A log entry is created only when a PATCH to `/api/item-rates/{id}` includes the `rate` field and the new value differs from the old value.
* **Initial rate creation (POST) does not log.** Only subsequent edits via the Item Rates page are tracked.
* If the page shows "Failed to load rate change logs", the table likely doesn't exist yet — run Step 1.
* If the page shows "No rate change logs found", the table exists but is empty — make a rate change via Item Rates to verify the logging pipeline is working.

---

## Deployment Update — 2026-04-01 (Ticket Checker Accounts + Checker App v1.1.0)

### Module

Backend — User Seed / Checker Mobile App

### Commit IDs

* `fe56a9d` — Checker app v1.1.0 (username login, bug fixes)
* `fd375ff` — Ticket checker seed script

### Changes

**Checker App (v1.1.0 / versionCode 2):**
* Login switched from email to username — matches backend `LoginRequest.username`
* Backend error messages now surfaced directly on login failure
* Manual ticket lookup now requires a Branch ID input when type is "ticket"
* QR scanner: fixed double-scan race condition; use `useWindowDimensions` for orientation safety
* `TicketDetailsModal`: null-safe `net_amount`, deduplicated `checked_in_at` row
* `clearAll()` now fully clears all AsyncStorage keys on logout
* Verification history: better merge logic; failed manual lookups appear in recent list

**New Ticket Checker Accounts (6 users, default password `Password@123`):**

| Username | Full Name | Route |
|---|---|---|
| `dhanashri.jadhav` | Dhanashri Rajendra Jadhav | Route 3 — JAIGAD-TAVSAL |
| `sapna.shete` | Sapna Rajesh Shete | Route 1 — DABHOL-DHOPAVE |
| `zahoor.hasware` | Zahoor Mahmood Hasware | Route 4 — AGARDANDA-DIGHI |
| `digambar.bamne.tc` | Digambar Shivaji Bamne | Route 5 — VASAI-BHAYANDAR |
| `tejas.saldurkar` | Tejas Sharad Saldurkar | Route 2 — VESVI-BAGMANDALE |
| `vikrant.nijai` | Vikrant Premnath Nijai | Route 7 — VIRAR-SAFALE |

> ⚠ `digambar.bamne` already exists as BILLING_OPERATOR on Route 5. A separate `.tc` account was created. If a single account is preferred, run: `UPDATE users SET role = 'TICKET_CHECKER' WHERE username = 'digambar.bamne';` (removes billing-operator access).

### Files Added

* `backend/scripts/seed_ticket_checkers_2026_04_01.sql` *(new)*
* `apps/checker/src/` — multiple files updated
* `apps/checker/app.json` — version bumped to 1.1.0 / versionCode 2

### VPS Deployment Steps

**Step 1 — Pull and run the seed script**

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
psql -U ssmspl_user -d ssmspl_db -f backend/scripts/seed_ticket_checkers_2026_04_01.sql
```

The script will print a table of the 6 new accounts on success.

**Step 2 — APK**

The updated APK (v1.1.0) is available at:
https://expo.dev/artifacts/eas/j9inccPskGhmPkjbDBrNx5.apk

---

## Deployment Update — 2026-04-02 (Payment mode POS visibility toggle)

### Module

Backend — Payment Modes / Ticket Service
Frontend — Payment Mode Master

### Changes

**1. `show_at_pos` flag on payment modes**
- Added a `show_at_pos` boolean column to the `payment_modes` table (default `TRUE`).
- When `FALSE`, the payment mode is hidden from the POS ticket-payment dropdown but remains active in the system for portal/customer-app revenue tracking.
- "Online" is set to `FALSE` automatically by the migration — it was causing confusion at counters since it is exclusively used for customer portal / CCAvenue gateway payments, not counter-collected payments.
- Card is already `is_active = FALSE` on the live server so it is unaffected.

**2. Payment Mode Master page — "Show at POS" toggle**
- The payment mode master (`/dashboard/payment-modes`) now shows a **"Show at POS"** column (Yes/No badge) for every mode.
- The Create and Edit dialogs include a **"Show at POS"** toggle switch with a helper note: *"Turn off for portal/online-only modes."*
- The View detail modal also shows the Show at POS status.

**3. Multi-ticket POS init — POS query fixed**
- `ticket_service.py`: the multi-ticket init endpoint now filters payment modes by both `is_active = TRUE` **and** `show_at_pos = TRUE`, matching the behaviour already in place on the single-ticket page.
- Previously the multi-ticket form still showed "Online" in its payment mode dropdown even though the single-ticket form already filtered it out.

**4. Seed data updated**
- `seed_data.sql`: payment modes INSERT now explicitly sets `show_at_pos` per mode (`FALSE` for Online, `TRUE` for Cash / UPI / Card) so fresh dev installs are consistent with production.

### Files Modified

* `backend/app/models/payment_mode.py` — added `show_at_pos` mapped column *(committed earlier)*
* `backend/app/schemas/payment_mode.py` — added `show_at_pos` to Create / Update / Read schemas *(committed earlier)*
* `backend/app/services/payment_mode_service.py` — added `show_at_pos` filter support *(committed earlier)*
* `backend/app/routers/payment_modes.py` — exposed `show_at_pos` query param on list / count endpoints *(committed earlier)*
* `frontend/src/types/index.ts` — added `show_at_pos` to `PaymentMode`, `PaymentModeCreate`, `PaymentModeUpdate` *(committed earlier)*
* `frontend/src/app/dashboard/payment-modes/page.tsx` — Show at POS column, toggle in dialogs *(committed earlier)*
* `frontend/src/app/dashboard/ticketing/page.tsx` — POS payment mode fetch already used `show_at_pos=true` *(committed earlier)*
* `backend/alembic/versions/a3c5d8e91f02_add_show_at_pos_to_payment_modes.py` — migration *(committed earlier)*
* `backend/scripts/ddl.sql` — `show_at_pos BOOLEAN NOT NULL DEFAULT TRUE` column *(committed earlier)*
* `backend/app/services/ticket_service.py` — multi-ticket POS query now filters by `show_at_pos = TRUE`
* `backend/scripts/seed_data.sql` — explicit `show_at_pos` values per payment mode

### VPS Deployment Steps

**Step 1 — Pull and run migration**

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
cd backend
source .venv/bin/activate
alembic upgrade head
```

The migration adds `show_at_pos` to `payment_modes` and automatically sets `show_at_pos = FALSE` for the "Online" mode.

**Step 2 — Restart backend**

```bash
sudo systemctl restart ssmspl-backend
```

**Step 3 — Rebuild and restart frontend**

```bash
cd ../frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

---

## Deployment Update — 2026-04-02 (QZ Tray — certificate-based silent printing)

### Module

Backend — QZ Tray signing endpoint
Frontend — QZ Tray service
Tools — Direct printing setup script

### Changes

**1. Switched from "Allow Unsigned" to certificate-based signing**
- Previously QZ Tray required "Allow Unsigned" to be manually checked in its settings on every POS machine — any site could print silently, which is a security gap.
- Now uses a self-signed SSMSPL certificate (`ssmspl-qz.crt`). QZ Tray only trusts this specific certificate, so only the SSMSPL app can print silently.
- The certificate is embedded directly in `qz-service.ts`. No separate file needs to be copied to the browser machine.

**2. Server-side signing (`/api/qz/sign`)**
- QZ Tray requires the certificate's matching private key to sign a challenge string during connection.
- A new authenticated endpoint `POST /api/qz/sign` handles signing — the private key never leaves the backend server.
- Only logged-in staff can trigger the signing, so anonymous users cannot initiate silent printing.
- Uses `pycryptodome` (`Crypto.Signature.pkcs1_15`, `Crypto.Hash.SHA`) for RSA-SHA1 signing (QZ Tray's required algorithm).

**3. `tools/setup-direct-printing.bat` rewritten**
- Old: created browser shortcuts with `--kiosk-printing` flag.
- New: automatically imports the SSMSPL certificate fingerprint into QZ Tray's `allowed.dat` file so the certificate is trusted without manual Site Manager steps. Also removes the fingerprint from `blocked.dat` if it was ever accidentally blocked. Restarts QZ Tray automatically if it is running.

### Files Modified / Added

* `backend/app/routers/qz.py` *(new)* — `/api/qz/sign` signing endpoint
* `backend/app/main.py` — registers the QZ router
* `frontend/src/lib/qz-service.ts` — embedded cert, server-side signing, removed "Allow Unsigned" mode
* `tools/setup-direct-printing.bat` — auto-imports cert fingerprint into QZ Tray allowed list
* `.gitignore` — added `*.key` and `*.crt` (raw PEM files are not committed; cert is embedded in code)

### VPS Deployment Steps

**Step 1 — Pull and install new dependency**

```bash
ssh user@your-vps-ip
cd /path/to/ssmspl
git pull origin main
cd backend
source .venv/bin/activate
pip install pycryptodome
```

**Step 2 — Restart backend**

```bash
sudo systemctl restart ssmspl-backend
```

**Step 3 — Rebuild and restart frontend**

```bash
cd ../frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

**Step 4 — On each POS machine (one time)**

Run `tools/setup-direct-printing.bat` as Administrator. This imports the certificate fingerprint into QZ Tray automatically. QZ Tray must already be installed.

If the .bat fails (permissions), manually import via QZ Tray:
- Right-click QZ Tray tray icon → Site Manager → click **+** → select `ssmspl-qz.crt`


Distribute to all ticket checkers. They log in with their **username** (not email) and the default password `Password@123`.

---

## Deployment Update — 2026-04-02 (Emergency Recovery & Dashboard Enhancements)

### Summary
This was a complex multi-stage deployment executed directly on the live VPS to deploy dashboard branch sorting, POS visibility toggles, and to fundamentally repair a completely locked Alembic migration state.

### Commits
* `b3524e7` — Dashboard logic enhancements
* `0355b49` — POS toggle & TS build fix (`@ts-ignore` on qz-tray import)
* `e74a85d` — Reprint script / React batch print race condition fix

### Changes & Patches
1. **Frontend sorting:** Dashboard branches are now strictly sorted by route topology instead of Postgres group order.
2. **Missing Types:** Next.js build failed locally in Docker (`qz-tray` missing types). Bypassed with `@ts-ignore`.
3. **Database Ghost Conflicts:** The `users` table already contained `mobile_number` and `ferry_schedules` contained `capacity` from previous manual DDL updates. This caused `alembic upgrade head` to repeatedly crash and roll back, stranding missing columns.
4. **Database Fix (Manual Overrides):** Instead of fighting Alembic, we natively applied safely-gated (`IF NOT EXISTS`) SQL to manually inject:
    * `payment_modes.show_at_pos` (And hid 'online' from the frontend mapping)
    * `users.failed_login_attempts` & `users.locked_until` (Which cured the `PATCH /api/item-rates/11` HTTP 500 auth crash)
    * `portal_users.google_id`, `is_verified`, `is_active`
5. **Rate Change Logs:** The ghost `rate_change_logs` table missing all tracking fields was cleanly dropped and rebuilt.

### Manual SQL Executed on Live DB
```sql
-- Fix Auth / Items 500 Crash
ALTER TABLE users ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- Rebuild Rate Change Logs completely natively
DROP TABLE IF EXISTS rate_change_logs;
CREATE TABLE rate_change_logs (
    id BIGSERIAL PRIMARY KEY,
    date DATE NOT NULL,
    time TIME NOT NULL,
    route_id INTEGER NOT NULL REFERENCES routes(id),
    item_id INTEGER NOT NULL REFERENCES items(id),
    old_rate NUMERIC(38, 2),
    new_rate NUMERIC(38, 2),
    updated_by_user UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Complete Alembic
alembic stamp head
```

### Manual Data Patches
```sql
-- Fix Multi-Ticketing "Fake morning schedule" generated times for off-hours tickets
UPDATE tickets
SET departure = (created_at AT TIME ZONE 'Asia/Kolkata')::time(0)
WHERE ticket_date = '2026-04-02' 
  AND (
       (created_at AT TIME ZONE 'Asia/Kolkata')::time >= '23:00:00'::time 
       OR 
       (created_at AT TIME ZONE 'Asia/Kolkata')::time <= '06:15:00'::time
  );
```

---

## Deployment Update — 2026-04-03

### Module

Reports / Tickets — Security Hardening

### Commit ID

1dacca4

### Changes

* **CRITICAL FIX**: Billing operators could see reports for ALL branches when `active_branch_id` was NULL in the database. Root cause: `if user.active_branch_id:` evaluated to False when NULL, silently skipping the entire branch-forcing block.
* `_scope_route_and_branch()` now returns **403 Forbidden** if billing operator has no `active_branch_id`, instead of silently allowing all-branch access
* `_scope_branch_only()` — same fix applied
* `/branch-summary` and `/branch-summary/pdf` — billing operators now scoped to their single active branch (was showing both route branches)
* Scoped users (MANAGER/BILLING_OPERATOR) with no `route_id` assigned now get 403 instead of silent pass-through
* `tickets.py` — list/count/create endpoints all deny billing operators missing active branch with clear error message
* Frontend: "Generate Report" button is disabled with error text when billing operator has no branch context

### Files Modified

* `backend/app/routers/reports.py`
* `backend/app/routers/tickets.py`
* `frontend/src/app/dashboard/reports/page.tsx`

### Database Migrations

* None

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
sudo systemctl restart ssmspl
```

Frontend:
```bash
cd frontend
rm -rf .next
npm run build
sudo systemctl restart ssmspl-frontend
```

### Important Notes

* After deploying, billing operators whose `active_branch_id` is NULL will immediately get a 403 error on reports, tickets, and ticket creation. They must **log out and log back in** to select their operating branch.
* To check which users have NULL `active_branch_id`:
  ```sql
  SELECT username, role, active_branch_id FROM users WHERE role = 'BILLING_OPERATOR' AND active_branch_id IS NULL;
  ```
* To manually fix without requiring re-login:
  ```sql
  UPDATE users SET active_branch_id = <branch_id> WHERE username = '<username>';
  ```

---

## Deployment Update — 2026-04-05

### Module

Reports — Dropdown Fix for Billing Operators

### Commit ID

75e749a

### Changes

* **Root cause of blank dropdowns + 403 error**: `/api/boats` endpoint only allowed SUPER_ADMIN, ADMIN, MANAGER — returned 403 for billing operators. The reports page used `Promise.all` to fetch all dropdowns (branches, routes, payment modes, users, boats), so one 403 rejection killed ALL fetches. Result: every dropdown appeared blank even though route/branch state was correctly set by the auto-lock logic.
* Added `BILLING_OPERATOR` to boats list/count read roles (`_ferry_read_roles`). Write/create/update/delete remain restricted to SUPER_ADMIN/ADMIN/MANAGER.
* Replaced `Promise.all` with `Promise.allSettled` in `fetchDropdowns()` so each API call succeeds or fails independently — one restricted endpoint no longer blocks others from loading.

### Files Modified

* `backend/app/routers/boats.py`
* `frontend/src/app/dashboard/reports/page.tsx`

### Database Migrations

* None

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
sudo systemctl restart ssmspl
```

Frontend:
```bash
cd frontend
rm -rf .next
npm run build
sudo systemctl restart ssmspl-frontend
```

---

## Deployment Update — 2026-04-05

### Module

Reports — Payment Mode Breakdown Calculation Fix

### Commit ID

c34bf80

### Changes

* **CRITICAL FIX**: Payment mode breakdown (Cash Memo / G-Pay shares) did not add up to the grand total in Item Wise Summary and Branch Item Summary reports.
* **Root cause**: Grand total was calculated from **item-level** data (`(TicketItem.rate + levy) * quantity`, excluding cancelled items), but the payment breakdown was calculated from **ticket-level** data (`Ticket.net_amount`). When individual ticket items were cancelled but the parent ticket was not, `Ticket.net_amount` still included the cancelled items' amounts while the grand total excluded them — causing a mismatch.
* **Fix**: Payment breakdown now uses the same item-level calculation as the grand total: `sum((TicketItem.rate + TicketItem.levy) * TicketItem.quantity)` with `TicketItem.is_cancelled = false` AND `Ticket.is_cancelled = false` filters.
* Affected reports: `get_item_wise_summary` (Item Wise Summary) and `get_branch_item_summary` (Branch Item Summary).

### Files Modified

* `backend/app/services/report_service.py`

### Database Migrations

* None

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
sudo systemctl restart ssmspl
```

### Verification

After deploying, generate an Item Wise Summary report and verify that:
1. The sum of all payment mode amounts equals the grand total exactly
2. Check for dates where individual ticket items were cancelled (not full ticket cancellations) — these were the cases that triggered the mismatch

---

## Deployment Update — 2026-04-05

### Module

Reports / Ticketing — Financial Calculation Hardening

### Commit ID

bfac6a2

### Changes

* **Item Breakdown report**: Added `Ticket.is_cancelled == False` and `Booking.is_cancelled == False` filters to item-level queries. Previously only checked `TicketItem.is_cancelled` — a cancelled ticket with inconsistent item flags could leak revenue into the report.
* **Full ticket cancellation**: Now zeros out `Ticket.amount` and `Ticket.net_amount` when cancelling. Previously retained original values in DB even after cancellation — reports excluded them via CASE expressions, but stored data was misleading for manual reconciliation queries.
* **Schema documentation fix**: `TicketItemRead.amount` formula corrected from `rate * (quantity + levy)` to `quantity * (rate + levy)`.

### Files Modified

* `backend/app/services/report_service.py`
* `backend/app/services/ticket_service.py`
* `backend/app/schemas/ticket.py`

### Database Migrations

* None

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
sudo systemctl restart ssmspl
```

### Known Design Difference (NOT a bug)

Reports fall into two categories that show different totals when discounts are applied:

| Category | Reports | Basis |
|----------|---------|-------|
| **NET** (after discount) | Revenue, Branch Summary, Payment Mode, Date Wise, User Wise, Ticket Details | `Ticket.net_amount` |
| **GROSS** (before discount) | Item Breakdown, Item Wise Summary, Vehicle Wise, Branch Item Summary | `(rate + levy) * quantity` |

If a ticket has ₹100 in items and ₹10 discount: NET reports show ₹90, GROSS reports show ₹100. This is by design — item-level reports show what items were sold, not what was collected after discount. If discounts are rare/zero, totals will match across all reports.

---

## Deployment Update — 2026-04-06

### Module

Ticketing — Multi-Ticket Separation, Time-Lock Toggle, Cancel/Reprint, Hardening

### Commit IDs

d724ef6, 0b92ffd, a6d4440, a27fff1

### Changes

**Feature 1 — Multi-Ticket Separation (Cosmetic)**

Added `is_multi_ticket` (BOOLEAN, default FALSE) and `generated_at` (TIMESTAMPTZ) columns to `tickets` table. Normal ticketing page now filters with `is_multi_ticket=false` — multi-tickets no longer appear in the normal listing. Multi-ticketing page shows only `is_multi_ticket=true` tickets. This is purely cosmetic — reports, dashboard, and all revenue calculations remain unchanged and continue to include all tickets.

**Feature 2 — Multi-Ticketing Listing with Cancel & Reprint**

Multi-ticketing page now shows a "Today's Multi-Tickets" DataTable below the creation form. Features:
- Reprint button (visible to SUPER_ADMIN, ADMIN, MANAGER) — reprints using the shared 80mm thermal receipt format
- Cancel button (visible to SUPER_ADMIN only) — cancels ticket with confirmation dialog
- Cancelled ticket rows are greyed out (opacity-50) for visual distinction
- Listing auto-refreshes after ticket creation or cancellation

**Feature 3 — Time-Lock Toggle**

New "Operations" tab in Settings (SUPER_ADMIN only) with a toggle to enable/disable ferry schedule time-lock. When disabled, both normal and multi-ticketing screens are open simultaneously regardless of ferry schedules. Useful for admin overrides during irregular operations.

- New `time_lock_enabled` column on `company` table (BOOLEAN, default TRUE)
- New API endpoints: `GET/PUT /api/settings/time-lock`
- Backend: `_is_time_lock_enabled()` check integrated into `get_ticketing_status()`, `_validate_off_hours()`, `_validate_normal_hours()`, and `get_multi_ticket_init()`

**Feature 4 — Mutual Exclusivity (committed earlier as 0b92ffd)**

Normal and multi-ticketing screens are now mutually exclusive per branch based on ferry schedules:
- Normal window: first ferry - 45min to last ferry + 30min
- Multi window: everything outside that range
- No overlap — `multi_open = not normal_open`

**Feature 5 — Double-Submit Prevention**

Added `!e.repeat` guard on all keyboard submission handlers (Enter, Alt+S) across both ticketing pages to prevent key auto-repeat from creating duplicate tickets. Also fixed `ItemSearchSelect` component's Enter handler.

### Files Modified

* `backend/app/models/company.py` — added `time_lock_enabled` column
* `backend/app/schemas/company.py` — added field to `CompanyRead`
* `backend/app/routers/settings.py` — new time-lock GET/PUT endpoints
* `backend/app/services/ticket_service.py` — time-lock checks, mutual exclusivity, `is_multi_ticket` filter
* `backend/scripts/ddl.sql` — added `time_lock_enabled`, `is_multi_ticket`, `generated_at` columns
* `frontend/src/app/dashboard/multiticketing/page.tsx` — listing, cancel, reprint, receipt format, `!e.repeat`
* `frontend/src/app/dashboard/ticketing/page.tsx` — `is_multi_ticket=false` filter, `!e.repeat` guards
* `frontend/src/app/dashboard/settings/page.tsx` — Operations tab
* `frontend/src/app/dashboard/settings/components/operations-tab.tsx` — new component
* `frontend/src/components/dashboard/DataTable.tsx` — `rowClassName` prop
* `frontend/src/types/index.ts` — `time_lock_enabled` on Company

### Database Migrations

* `d724ef6` added `is_multi_ticket` and `generated_at` to tickets via Alembic (already deployed)
* `time_lock_enabled` on company table — requires migration or manual DDL:
  ```sql
  ALTER TABLE company ADD COLUMN time_lock_enabled BOOLEAN NOT NULL DEFAULT TRUE;
  ```

### Deployment Steps (VPS)

Backend:
```bash
cd backend
source .venv/bin/activate
alembic upgrade head
sudo systemctl restart ssmspl
```

Frontend:
```bash
cd frontend
npm run build
sudo systemctl restart ssmspl-frontend
```

### Verification

1. Open normal ticketing page — verify multi-tickets are NOT listed
2. Open multi-ticketing page — verify only multi-tickets are listed, with cancel/reprint buttons
3. Create a multi-ticket — verify it appears in the listing and prints on 80mm format
4. Cancel a ticket (as SUPER_ADMIN) — verify row turns grey, cancel/reprint buttons disappear
5. Log in as BILLING_OPERATOR — verify cancel button is NOT visible, reprint is NOT visible
6. Log in as MANAGER — verify reprint is visible, cancel is NOT visible
7. Settings > Operations > toggle time-lock OFF — verify both ticketing screens become available
8. Toggle time-lock ON — verify mutual exclusivity resumes based on ferry schedules
9. Generate any report — verify totals unchanged (cancelled tickets excluded, multi-tickets included)
