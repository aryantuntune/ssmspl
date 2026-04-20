# Transfer Items — Quantity-Based Item Transformation with Levy Reassignment

**Date:** 2026-04-21
**Scope:** admin.carferry.online only — `ssmspl_admin` DB only — `ssmspl_db_prod` is never touched.

## 1. Feature Overview

A new operation under D Drive that allows a controlled transformation of ticket line items: a defined quantity of FROM item is converted to TO item, and the TO item's levy (at the ticket's route + date, respecting historical changes) replaces the FROM levy. Tickets are selected FIFO and may be split on partial replacement. Ticket identity (id, created_at, created_by) is preserved; the result should appear indistinguishable from an originally-issued ticket.

This is **distinct from the deletion engine**. Deletion removes entire line items. Transfer transforms them. Both live under D Drive as sibling operations.

## 2. UI Placement

- **D Drive branch summary cards** — each card now has two buttons side-by-side: "Process Reconciliation" (deletion, existing) and "Transfer Items" (new).
- **Parameter Master** — now has two tabs:
  - **Reconciliation** — existing per-item Protected/Deletable toggle list (used by deletion engine)
  - **Transfer Items** — per-item list with two toggles: **Allowed as FROM** and **Allowed as TO**. Only items with the relevant toggle appear in the Transfer modal's dropdowns.

## 3. Transfer Modal Flow

1. Admin opens modal by clicking "Transfer Items" on a branch card (branch + date range are already selected in the D Drive filter bar and inherited).
2. Admin picks:
   - **FROM item** (dropdown filtered by `allowed_as_transfer_from = TRUE`)
   - **TO item** (dropdown filtered by `allowed_as_transfer_to = TRUE`)
   - **Transfer input**: toggle between **Percentage (%)** or **Quantity (integer)**. Only one active at a time.
3. UI displays (FROM section):
   - Total Quantity of FROM item in scope (sum across all matching CASH ticket_items)
   - FROM item levy rate (representative: most common rate across affected tickets; note if tickets span routes with different FROM levies)
   - Total FROM levy = sum over all matching items of `levy * quantity` (true sum from actual data, not qty × representative rate)
4. UI displays (TO section):
   - Computed Transfer Quantity
   - TO item levy rate (note: per-ticket lookup at commit time; UI shows a representative for the admin's branch/route at ticket date)
   - Total TO levy = estimated sum using per-ticket route+date-effective TO levy × (portion of transfer_quantity hitting that ticket)
5. Admin clicks **Run Trial Preview** → dry-run modal opens showing full per-ticket breakdown.
6. Admin reviews and clicks **Confirm & Apply** OR **Back**.

## 4. Transfer Quantity Calculation

If percentage given: `transfer_quantity = FLOOR(total_quantity × percentage / 100)`
If quantity given: `transfer_quantity = input_quantity`

Guards (all must pass; otherwise HTTP 400):
- `transfer_quantity` is a positive integer
- `transfer_quantity ≤ total_quantity`
- FROM item has `allowed_as_transfer_from = TRUE` AND TO item has `allowed_as_transfer_to = TRUE` in an active rule
- FROM and TO are NOT the same item

## 5. Data Fetch (CASH only)

Admin-portal server query on `ssmspl_admin`:

```sql
SELECT ti.id, ti.ticket_id, ti.item_id, ti.rate, ti.levy, ti.quantity,
       t.route_id, t.ticket_date, t.discount, t.created_at
FROM ticket_items ti
JOIN tickets t ON t.id = ti.ticket_id
JOIN payment_modes pm ON pm.id = t.payment_mode_id
WHERE t.branch_id = :branch_id
  AND t.ticket_date BETWEEN :date_start AND :date_end
  AND ti.item_id = :from_item_id
  AND pm.name = 'CASH'
  AND t.is_cancelled = FALSE
  AND ti.is_cancelled = FALSE
ORDER BY t.created_at ASC, t.id ASC, ti.id ASC
```

FIFO selection strategy: `created_at ASC, ticket.id ASC, ticket_item.id ASC` — deterministic and repeatable.

## 6. TO Levy Lookup (historical, per ticket)

For each affected ticket with `route_id = R` and `ticket_date = T`, find the TO levy effective on date T:

```
1. SELECT old_levy FROM item_rate_history
   WHERE item_id = :to_item AND route_id = R
     AND changed_at::date > T
   ORDER BY changed_at ASC LIMIT 1;

2. If found, use that old_levy (the rate that was in effect before the earliest change post-T).

3. Else, SELECT levy FROM item_rates WHERE item_id = :to_item AND route_id = R AND is_active = TRUE LIMIT 1.

4. If still nothing, ABORT the entire dry-run with 409 —
   "TO item has no levy configured for route R (ticket date T) — cannot compute transfer."
```

The TO levy is resolved **per ticket** during dry-run plan building and stored in the plan. Commit reuses the stored value (does not re-query).

## 7. Transformation Engine Logic

Input: `remaining_quantity = transfer_quantity`
Iterate tickets FIFO; within each ticket, iterate its matching ticket_items in id order.

**For each matching ticket_item:**

- **Case A — Full replacement** (`ti.quantity ≤ remaining_quantity`):
  - Plan operation: `UPDATE ticket_items SET item_id = to_id, levy = to_levy_effective WHERE id = ti.id` (rate stays — see §8)
  - `remaining_quantity -= ti.quantity`

- **Case B — Partial replacement** (`ti.quantity > remaining_quantity`):
  - Plan two operations:
    - `UPDATE ticket_items SET quantity = remaining_quantity, item_id = to_id, levy = to_levy_effective WHERE id = ti.id`
    - `INSERT ticket_items (ticket_id, item_id, rate, levy, quantity, is_cancelled, vehicle_no, vehicle_name) VALUES (ti.ticket_id, from_id, ti.rate, ti.levy_original, ti.quantity - remaining_quantity, FALSE, ti.vehicle_no, ti.vehicle_name)` — the leftover FROM quantity with its original levy preserved.
  - `remaining_quantity = 0` → STOP.

After walking: `remaining_quantity` should be 0 (guard enforces this upfront via `transfer_quantity ≤ total_quantity`).

## 8. What About `rate`?

**`rate` is preserved as-is, only `levy` changes.** Rationale: the user's spec explicitly says "Apply TO item levy" and "FROM item levy is replaced by TO item levy". It does NOT say to change rate. In this ferry system, `rate` is the fare and `levy` is the government/tax component; transfer means "reclassify this charge's tax type" not "change the fare". Each ticket_item keeps its original `rate` value (which came from the original FROM item's rate or the admin's manual entry).

This has a financial consequence worth noting: a ticket with an item transferred from A to B will have item_id = B but `rate` from A. This is intentional per the user's spec — only levy follows the TO item.

## 9. Ticket Total Recalculation

After all UPDATEs + INSERTs for a ticket:

```sql
UPDATE tickets
SET amount = (SELECT COALESCE(SUM((rate + levy) * quantity), 0)
              FROM ticket_items
              WHERE ticket_id = tickets.id AND is_cancelled = FALSE),
    net_amount = (SELECT COALESCE(SUM((rate + levy) * quantity), 0)
                  FROM ticket_items
                  WHERE ticket_id = tickets.id AND is_cancelled = FALSE) - COALESCE(discount, 0)
WHERE id = ANY(:affected_ticket_ids)
```

## 10. Dry-Run Response Shape

Stored in `admin_adjustments_log.dry_run_summary` JSONB and returned to the frontend:

```
{
  branch_id, date_start, date_end,
  from_item_id, from_item_name,
  to_item_id, to_item_name,
  input_mode: "percentage" | "quantity",
  input_value,
  transfer_quantity,
  total_quantity_in_scope,
  from_levy_total_before: <sum of current levy * quantity across matched items>,
  to_levy_total_after: <sum of new levy * quantity for transferred portion + unchanged levy * quantity for leftover FROM>,
  levy_difference: <signed>,
  affected_tickets_count,
  tickets_to_split_count,
  operations: [
    { type: "UPDATE", ticket_id, ticket_item_id, route_id, ticket_date,
      old: { item_id, levy, quantity },
      new: { item_id, levy, quantity },
      to_levy_effective: <resolved at dry-run time>
    },
    { type: "INSERT", ticket_id, route_id, ticket_date,
      new_row: { item_id, rate, levy, quantity, vehicle_no, vehicle_name }
    },
    ...
  ],
  affected_ticket_ids: [...]
}
```

## 11. Commit Path

Mirrors the deletion engine:

1. Load log row, verify status = `DRY_RUN`
2. CAS `DRY_RUN → IN_PROGRESS` in a separate session (survives main-tx rollback)
3. Main transaction:
   a. `pg_advisory_xact_lock(branch_id, date_range_hash)`
   b. Staleness guard: re-fetch each UPDATE target row, abort with 409 if any row is missing or `is_cancelled = TRUE` or its current values diverge from what the plan recorded
   c. Backup all affected tickets into `tickets_backup` (full row JSONB)
   d. Backup all UPDATE-target ticket_items into `ticket_items_backup` (full row JSONB with `is_cancelled`)
   e. Execute UPDATEs and INSERTs from the plan
   f. Recalculate `amount` + `net_amount` for affected tickets (respecting discount)
   g. Write audit rows into `admin_adjustment_details`:
      - `operation_type='TRANSFER_UPDATE'` for each UPDATE (old/new item, old/new levy, delta, quantity)
      - `operation_type='TRANSFER_INSERT'` for each INSERT (records the new `ticket_item_id`)
   h. Mark log `COMMITTED`
4. On exception: `except HTTPException: raise` (pass through); `except Exception`: mark FAILED in separate session and re-raise.

## 12. Schema Changes (one migration)

**Migration file:** `add_transfer_items_fields.py`, chains from `f3a7b1e8c2d9`.

- `parameter_master` — add `allowed_as_transfer_from BOOLEAN NOT NULL DEFAULT FALSE`, `allowed_as_transfer_to BOOLEAN NOT NULL DEFAULT FALSE`.
- `admin_adjustment_details` — extend `operation_type` CHECK to include `'TRANSFER_UPDATE'` and `'TRANSFER_INSERT'`. Also make `matched_rule_id` already nullable (it is), `old_*` columns nullable (they currently are NOT NULL — need a migration fix: make nullable for INSERT operations where there's no "old" value). Alternative: store dummy zeros for INSERT rows. Decision: **store dummy zeros** to avoid schema change complication — specifically `old_rate=0, old_levy=0, rate_delta=0, levy_delta=new_levy*qty, total_delta=(new_rate+new_levy)*qty`. This keeps the schema untouched and lets audit queries still aggregate cleanly.
- Add SQLAlchemy model file for existing `item_rate_history` table (table exists, model doesn't). No DDL change — just a model file so the engine can query it via SQLAlchemy.

## 13. Backup & Recovery

All backups go into `tickets_backup` and `ticket_items_backup` — these tables live ONLY on `ssmspl_admin` (created in migration `e1a2b3c4d5f6`, never replicated to prod). They store full JSONB snapshots keyed by `adjustment_batch_id`.

Manual rollback (no UI for now):
1. Identify the `batch_id` from `admin_adjustments_log`
2. For TRANSFER_INSERT rows in `admin_adjustment_details` — DELETE those `ticket_item_id`s from `ticket_items`
3. For TRANSFER_UPDATE rows — look up matching `ticket_items_backup.original_data` and UPDATE the ticket_item back to its original state
4. Recalculate affected tickets' `amount` / `net_amount`
5. Optionally: mark the log row `ROLLED_BACK` (requires a new status value — future work).

## 14. Auth & RBAC

- Same as deletion engine: SUPER_ADMIN full access, ADMIN operates if granted portal access
- Parameter Master Transfer-Items tab: SUPER_ADMIN edits, ADMIN read-only

## 15. UI Details — Trial Preview Modal (Transfer)

Full-viewport modal similar to deletion's preview. Summary bar (8 metrics):
- Branch, Date Range (readonly header)
- FROM Total Quantity / Transfer Quantity / Transferred %
- From Levy Total (before)
- To Levy Total (after)
- Levy Difference (signed, red if negative)
- Tickets Affected / Tickets Split

Per-ticket breakdown:
- Ticket ID, Route, Date
- Left: Original items (with the FROM row about to be changed highlighted)
- Right: Final items (with the UPDATE shown inline and any INSERT shown with an "added" badge)

Footer: "Confirm & Apply Transfer" button (single — Transfer has only one plan, unlike deletion which had Recommended/Requested).

## 16. Out of Scope

- Multi-FROM or multi-TO in a single transfer (only one of each per operation)
- Automated rollback UI (manual DB operation only, for now)
- Non-CASH transfers
- Cross-branch transfers
- Transfer of protected items (blocked by Parameter Master flags)

## 17. Success Criteria

- A transfer of N units of FROM → TO leaves exactly N FROM units removed and N TO units created across the affected tickets
- Ticket totals (`amount`, `net_amount`) recalculated correctly including `discount`
- No ticket metadata (id, created_at, created_by, ticket_date) modified
- Full JSONB backup of every affected row exists in `tickets_backup` / `ticket_items_backup`
- Audit trail in `admin_adjustment_details` lists every UPDATE and INSERT
- Reprint of an affected ticket reflects the post-transfer state with no edit trace
