# Admin D Drive + Parameter Master — Design Spec

**Date:** 2026-04-18  
**Domain:** admin.carferry.online only  
**Database scope:** `ssmspl_admin` (Server 2) — `ssmspl_db_prod` (Server 1) is never touched

---

## 1. System Context

```
Server 1: ssmspl_db_prod  (PostgreSQL 16.6, Docker, port 5433)
          └─ logical replication via ssmspl_pub → [SSH tunnel :15432]
Server 2: ssmspl_sync     (PostgreSQL 16.13, native)
          └─ logical replication via admin_pub → (same host)
Server 2: ssmspl_admin    (PostgreSQL 16.13, native)  ← admin portal reads/writes here only
```

All admin-local tables are created only in `ssmspl_admin`. They are never published upstream. Admin-local IDs use a 10M+ offset to avoid collision with replicated rows.

---

## 2. Feature Overview

### Screen 1 — D Drive
Central dashboard for reviewing branch-wise ticket collections. Allows SUPER_ADMIN and toggled ADMIN users to view all tickets with filters and trigger a two-phase adjustment workflow on CASH tickets only.

### Screen 2 — Parameter Master
Rule configuration screen. SUPER_ADMIN manages rules that define how adjustments are distributed. ADMIN users see it read-only.

---

## 3. Access Control

### Role permissions

| Feature | SUPER_ADMIN | ADMIN (if toggled on) |
|---|---|---|
| D Drive — view | ✅ | ✅ |
| D Drive — trigger adjustment | ✅ | ✅ |
| Parameter Master — view | ✅ | ✅ read-only |
| Parameter Master — create/edit/reorder rules | ✅ | ❌ |
| User Access toggle management | ✅ | ❌ |

### Per-user admin portal access toggle (`admin_user_access`)
SUPER_ADMIN sees a new "User Access" tab in Settings. It lists all users with role `ADMIN` replicated from `ssmspl_admin`. SUPER_ADMIN toggles `is_granted` per user. On every request from an ADMIN user when `ADMIN_PORTAL_MODE=true`, the backend checks `admin_user_access.is_granted` and `users.is_active`. Result is cached in request state (no repeated DB calls per request). SUPER_ADMIN bypasses this check.

---

## 4. Database Schema (admin-local tables only)

### 4.1 `parameter_master`
```sql
id                          SERIAL PRIMARY KEY,
priority_order              INT NOT NULL UNIQUE,
branch_scope                INT REFERENCES branches(id),        -- NULL = all branches
item_id                     INT REFERENCES items(id),           -- NULL = all items
payment_mode                VARCHAR(20) NOT NULL DEFAULT 'CASH',
ticket_conditions           JSONB NOT NULL DEFAULT '{}',
item_conditions             JSONB NOT NULL DEFAULT '{}',
ticket_selection_order      VARCHAR(20) NOT NULL                -- FIFO|LIFO|HIGHEST_VALUE|LOWEST_VALUE
                            CHECK (ticket_selection_order IN ('FIFO','LIFO','HIGHEST_VALUE','LOWEST_VALUE')),
max_adjustment_per_ticket   NUMERIC(9,2),
max_adjustment_per_item     NUMERIC(9,2),
max_total_adjustment_per_rule NUMERIC(9,2),
stop_on_match               BOOLEAN NOT NULL DEFAULT FALSE,
is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
created_by                  UUID REFERENCES users(id)
```

### 4.2 `tickets_backup`
```sql
id                  BIGSERIAL PRIMARY KEY,
adjustment_batch_id UUID NOT NULL REFERENCES admin_adjustments_log(id),
ticket_id           BIGINT NOT NULL,                            -- indexed
original_data       JSONB NOT NULL,                             -- full row snapshot
backed_up_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
```
Index: `(adjustment_batch_id, ticket_id)`

### 4.3 `ticket_items_backup`
```sql
id                  BIGSERIAL PRIMARY KEY,
adjustment_batch_id UUID NOT NULL REFERENCES admin_adjustments_log(id),
ticket_item_id      BIGINT NOT NULL,                            -- indexed
ticket_id           BIGINT NOT NULL,
original_data       JSONB NOT NULL,
backed_up_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
```
Index: `(adjustment_batch_id, ticket_item_id)`

### 4.4 `admin_adjustments_log`
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
branch_id           INT NOT NULL REFERENCES branches(id),
date_range_start    DATE NOT NULL,
date_range_end      DATE NOT NULL,
adjustment_amount   NUMERIC(9,2) NOT NULL,
dry_run_summary     JSONB,                                      -- stored execution plan from dry-run
total_tickets_affected INT,
total_items_affected   INT,
row_count_checked   INT,
status              VARCHAR(20) NOT NULL DEFAULT 'DRY_RUN'
                    CHECK (status IN ('DRY_RUN','IN_PROGRESS','COMMITTED','FAILED')),
error_message       TEXT,
executed_at         TIMESTAMPTZ,
created_by          UUID NOT NULL REFERENCES users(id),
created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### 4.5 `admin_adjustment_details`
```sql
id              BIGSERIAL PRIMARY KEY,
adjustment_id   UUID NOT NULL REFERENCES admin_adjustments_log(id),
ticket_id       BIGINT NOT NULL,
ticket_item_id  BIGINT NOT NULL,
old_rate        NUMERIC(9,2) NOT NULL,
old_levy        NUMERIC(9,2) NOT NULL,
new_rate        NUMERIC(9,2) NOT NULL,
new_levy        NUMERIC(9,2) NOT NULL,
rate_delta      NUMERIC(9,2) NOT NULL,
levy_delta      NUMERIC(9,2) NOT NULL,
total_delta     NUMERIC(9,2) NOT NULL,
matched_rule_id INT REFERENCES parameter_master(id)
```

### 4.6 `admin_user_access`
```sql
id              SERIAL PRIMARY KEY,
user_id         UUID NOT NULL UNIQUE REFERENCES users(id),
is_granted      BOOLEAN NOT NULL DEFAULT FALSE,
is_super_admin  BOOLEAN NOT NULL DEFAULT FALSE,
granted_by      UUID REFERENCES users(id),
granted_at      TIMESTAMPTZ,
updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
```

### 4.7 `ticket_items` — admin-local column addition
```sql
ALTER TABLE ticket_items ADD COLUMN last_adjustment_id UUID REFERENCES admin_adjustments_log(id);
```

---

## 5. Backend Architecture

### Namespace
`backend/app/admin/` — loaded conditionally only when `ADMIN_PORTAL_MODE=true`.

### Routers (`/api/admin/`)

| Router file | Endpoints |
|---|---|
| `routers/d_drive.py` | `GET /d-drive/tickets`, `GET /d-drive/summary`, `POST /d-drive/adjustment/dry-run`, `POST /d-drive/adjustment/commit`, `GET /d-drive/adjustment/{id}` |
| `routers/parameter_master.py` | `GET /parameter-master/rules`, `POST /parameter-master/rules`, `PUT /parameter-master/rules/{id}`, `PATCH /parameter-master/rules/{id}/status`, `POST /parameter-master/rules/reorder`, `POST /parameter-master/rules/{id}/preview` |
| `routers/user_access.py` | `GET /user-access`, `PUT /user-access/{user_id}` |

### Services

| Service file | Responsibility |
|---|---|
| `services/d_drive_service.py` | Filter + paginate tickets, aggregate branch summaries, payment mode breakdown |
| `services/adjustment_engine.py` | Two-phase dry-run + commit, guards, rule pipeline |
| `services/parameter_master_service.py` | CRUD for rules, priority reordering, preview matching |
| `services/user_access_service.py` | Grant/revoke per-user portal access |

### Models (new files in `backend/app/models/`)
`parameter_master.py`, `admin_adjustments_log.py`, `admin_adjustment_details.py`, `tickets_backup.py`, `ticket_items_backup.py`, `admin_user_access.py`

---

## 6. Adjustment Engine (Two-Phase)

### Phase 1 — Dry-Run (no writes)

```
1. COUNT eligible CASH ticket_items for branch + date_range — guard: ≤ 5,000
2. Validate: adjustment_amount > 0, ≤ total eligible cash net_amount
3. Load active rules ORDER BY priority_order ASC
4. For each rule:
   a. Filter ticket_items by branch_scope, item_id, item_conditions
   b. Order tickets by ticket_selection_order + secondary ticket_id ASC
   c. Iterate items, compute rate_delta/levy_delta per item
   d. Respect max_adjustment_per_item, max_adjustment_per_ticket, max_total_adjustment_per_rule
   e. Accumulate remaining_amount; stop loop strictly when remaining_amount == 0
   f. If stop_on_match: break after this rule
5. Build execution_plan (deterministic list of {ticket_item_id, new_rate, new_levy, deltas})
6. Store execution_plan in admin_adjustments_log (status=DRY_RUN)
7. Return: summary (before/after totals, ticket count, item count) + capped detail rows (≤ 50)
```

### Phase 2 — Commit (single atomic transaction)

```
1. Load stored execution_plan from admin_adjustments_log by batch_id (do NOT recompute)
2. Acquire pg_advisory_xact_lock(branch_id, date_range_hash) — blocks concurrent commits
3. UPDATE admin_adjustments_log SET status='IN_PROGRESS'  ← separate connection/savepoint so log survives rollback
4. BEGIN TRANSACTION:
   a. INSERT tickets_backup (JSONB snapshot of affected tickets)
   b. INSERT ticket_items_backup (JSONB snapshot of affected ticket_items)
   c. UPDATE ticket_items SET rate=new_rate, levy=new_levy, last_adjustment_id=batch_id
      WHERE id IN (plan item IDs)
   d. UPDATE tickets SET net_amount = subquery(SUM of updated ticket_items)
      WHERE id IN (affected ticket IDs only — optimized grouped SUM)
   e. INSERT admin_adjustment_details (one row per modified item)
   f. UPDATE admin_adjustments_log SET status='COMMITTED', executed_at=NOW(), total_tickets_affected, total_items_affected
5. COMMIT
6. On any failure: ROLLBACK → UPDATE admin_adjustments_log SET status='FAILED', error_message=...
```

### Guards summary
- `ticket_item count > 5,000` → reject before loading dataset
- `adjustment_amount > total eligible cash` → reject
- `adjustment_amount ≤ 0` → reject
- UPI and ONLINE tickets → excluded at query level (`payment_modes.name = 'CASH'`)
- `remaining_amount == 0` → stop loop immediately, no overshoot
- Concurrent same branch+date commit → blocked by advisory lock

---

## 7. Frontend Architecture

### New pages
```
frontend/src/app/dashboard/d-drive/
  page.tsx
  components/
    FilterBar.tsx
    BranchSummaryCards.tsx
    TicketTable.tsx
    AdjustmentModal.tsx       -- amount entry + dry-run trigger
    DryRunPreview.tsx         -- before/after summary + confirm/cancel
    
frontend/src/app/dashboard/parameter-master/
  page.tsx
  components/
    RuleTable.tsx             -- priority-ordered, drag-to-reorder (SUPER_ADMIN)
    RuleModal.tsx             -- create/edit form
    PreviewModal.tsx          -- matching ticket preview per rule
```

### Settings addition
New "User Access" tab in `frontend/src/app/dashboard/settings/` — visible to SUPER_ADMIN only on admin portal. Lists all ADMIN users with `is_granted` toggle switch per user.

### UI style
Uses existing component system (`components/ui/Card`, `Table`, `Button`, `Badge`, `Dialog`). Tailwind CSS variables — adapts automatically to light/dark theme. No custom hardcoded colors.

### D Drive UI flow
1. Filter bar → apply filters
2. Branch summary cards (cash/upi/online totals, ticket count, "Process Reconciliation" button)
3. Paginated ticket table (all modes visible, 50/page)
4. Click "Process Reconciliation" → modal: enter amount → "Run Dry-Run Preview"
5. Dry-run preview: before/after summary table → "Confirm & Apply" or "Cancel"
6. Commit → success summary with updated totals

### Parameter Master UI flow
- Rule table: priority #, branch, item, selection order, max/rule, stop-on-match, status, actions
- "New Rule" button (SUPER_ADMIN) → RuleModal with all fields
- "Preview" button → shows matching ticket count for that rule
- "Enable/Disable" toggle (SUPER_ADMIN)
- ADMIN users: same table, all action buttons hidden

---

## 8. Screen Toggle Integration

"D Drive" and "Parameter Master" added to `TOGGLEABLE_SCREENS` in `admin_screen_service.py`. SUPER_ADMIN can hide them from ADMIN users via existing Screen Access tab in Settings.

---

## 9. Domain Isolation

- All routes: `/api/admin/*`
- All pages: `/dashboard/d-drive/*`, `/dashboard/parameter-master/*`
- Routers only registered when `ADMIN_PORTAL_MODE=true`
- Nginx: all traffic via `admin.carferry.online` (existing conf, no changes needed)
- `ssmspl_db_prod` is never connected to, written to, or referenced by any admin-local code

---

## 10. Alembic Migration Strategy

Single migration file per new table group:
1. `add_admin_user_access_table`
2. `add_parameter_master_table`
3. `add_admin_adjustment_tables` (log + details + backups)
4. `add_ticket_items_last_adjustment_id`

All migrations run only against `ssmspl_admin`. Apply via `alembic upgrade head` on Server 2.

---

## 11. Open Items (pending client input)

- `ticket_conditions` and `item_conditions` JSONB field format — exact rule predicates not yet defined by client. Engine designed to be pluggable; rule evaluation logic will be added once client specifies.
- `max_adjustment_per_item` distribution logic within a rule — client to define once business rules are confirmed. For now, pro-rated by item value is the default fallback within a rule pass.
