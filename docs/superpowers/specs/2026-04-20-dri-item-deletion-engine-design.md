# D Drive DRI-Driven Item Deletion Engine — Design Spec

**Date:** 2026-04-20
**Supersedes (for "Process Reconciliation" flow only):** `2026-04-18-admin-d-drive-parameter-master-design.md`
**Database scope:** `ssmspl_admin` (Server 2) — `ssmspl_db_prod` is never touched

---

## 1. Relationship to the Previous Feature

Yesterday's feature built a **rate/levy reduction** engine and wired it to the D Drive "Process Reconciliation" button. This spec **replaces** that engine in the D Drive main flow with an **item-deletion** engine.

**What happens to the previous code:**
- Backend service `admin_adjustment_engine.py` is **renamed** → `admin_rate_reduction_engine.py` (preserved for a future sub-screen).
- Its router endpoints (`/api/admin/d-drive/adjustment/dry-run`, `/commit`) are **removed** — the new engine gets the same endpoints.
- Frontend `AdjustmentModal.tsx` and `DryRunPreview.tsx` are **rewritten** to drive the deletion engine.
- All audit/backup tables remain — the new engine reuses them with a new `operation_type` field.

---

## 2. Behavior

Admin enters an adjustment amount → system finds unprotected CASH ticket_items → deletes entire lines (no partial rate modification) → ticket totals recalculate. The ticket metadata (id, date, operator, timestamp) stays untouched. The ticket reprint looks original.

---

## 3. Protection Model

**Rule-level flag.** Each `parameter_master` row gets `is_protected` (BOOLEAN, default FALSE).

- A rule with `is_protected=TRUE` defines items that **must never be deleted** (Adult Passenger, Child, Ambulance, Daily Passes, Luggage, Special Ferry, etc.).
- A rule with `is_protected=FALSE` defines items that **are eligible for deletion** (luxury cars, premium add-ons, etc.).
- Priority order among unprotected rules determines selection order during deletion.
- Protected rules are evaluated first to build a protection set; that set is then excluded from every unprotected rule's candidate list.

**Minimum remaining per item:** `min_remaining_per_item` (INT, default 0). For unprotected items, 0 means "delete all if needed." Kept as a config knob for future flexibility but typically stays 0.

---

## 4. Dual-Plan Dry-Run (Recommended + Requested)

The dry-run computes **two plans**:

**Recommended plan:**
1. Compute `max_possible_adjustment` = sum of all eligible unprotected items' value
2. Compute `recommended_adjustment` = `max_possible_adjustment` rounded DOWN to the nearest clean number:
   - `< ₹1,000` → round down to nearest ₹100
   - `₹1,000 – ₹10,000` → round down to nearest ₹500
   - `> ₹10,000` → round down to nearest ₹1,000
3. Build the deletion set that achieves **exactly** `recommended_adjustment` (walks items in rule-priority + selection-order until cumulative delete value reaches the target; stops at the first item that would overshoot).

**Requested plan:**
1. Target = min(`requested_adjustment`, `max_possible_adjustment`).
2. Build the deletion set that achieves as close as possible to the target, **always rounding down** (never overshooting). Since items are discrete, actual applied ≤ target.

Both plans are stored in `admin_adjustments_log.dry_run_summary` (one JSONB object with both). The status is `DRY_RUN`.

**Dry-run response to frontend contains:**
- `batch_id`
- `cash_total_before`
- `requested_adjustment`, `recommended_adjustment`, `max_possible_adjustment`
- `recommended_plan`: `{applied, tickets: [...], item_ids: [...]}`
- `requested_plan`: `{applied, tickets: [...], item_ids: [...]}`
- `diff_items`: list of ticket_item_ids present in `requested_plan` but not in `recommended_plan` (for UI highlighting)

---

## 5. Commit

`POST /api/admin/d-drive/adjustment/commit` body: `{batch_id, plan_choice: "recommended" | "requested"}`

1. Load stored `dry_run_summary`
2. Pick the chosen plan's `item_ids`
3. Acquire `pg_advisory_xact_lock(branch_id, date_range_hash)`
4. BEGIN transaction:
   - INSERT full ticket and ticket_item rows into `tickets_backup` and `ticket_items_backup` (JSONB snapshots — full restore possible)
   - INSERT one row per deleted item into `admin_adjustment_details` with `operation_type='DELETE'`
   - `DELETE FROM ticket_items WHERE id = ANY(:item_ids)`
   - `UPDATE tickets SET net_amount = (SELECT COALESCE(SUM((rate+levy)*quantity), 0) FROM ticket_items WHERE ticket_id = tickets.id AND is_cancelled = false) WHERE id = ANY(:affected_ticket_ids)`
   - UPDATE log: `status='COMMITTED'`, `executed_at=NOW()`, `plan_choice=<chosen>`
5. COMMIT
6. On any failure: rollback + mark `FAILED` in a separate session

---

## 6. Schema Changes (single new migration)

**`parameter_master`** — add 2 columns:
- `is_protected BOOLEAN NOT NULL DEFAULT FALSE`
- `min_remaining_per_item INT NOT NULL DEFAULT 0`

**`admin_adjustment_details`** — add 1 column:
- `operation_type VARCHAR(10) NOT NULL DEFAULT 'MODIFY' CHECK (operation_type IN ('MODIFY','DELETE'))`

**`admin_adjustments_log`** — add 1 column:
- `plan_choice VARCHAR(15) CHECK (plan_choice IN ('recommended','requested'))` — nullable (not set until commit)

Alembic migration chains from `e1a2b3c4d5f6`.

---

## 7. Guards (unchanged + additions)

- Reject if eligible ticket_item count > 5,000 (count BEFORE load)
- Reject if `requested_adjustment <= 0`
- Reject if `max_possible_adjustment == 0` (nothing to delete)
- CASH tickets only (`payment_modes.name = 'CASH'`)
- `is_cancelled = false` on both tickets and ticket_items
- Protected items excluded at query level
- Concurrent commits on same branch+date blocked by advisory lock
- Deterministic ordering: rule `priority_order ASC` → `ticket_selection_order` → secondary `ticket_id ASC, ticket_item_id ASC`

---

## 8. Frontend Changes

**Parameter Master screen** (RuleModal):
- Add "Protected item rule" toggle (`is_protected`) — UI note: "Items matching this rule will NEVER be deleted during reconciliation."
- Add "Min remaining per item" numeric input (default 0, hidden if `is_protected=true`)

**D Drive screen** (unchanged for summary/ticket list):
- "Process Reconciliation" → new `AdjustmentModal`

**Adjustment Modal** (rewritten):
- Step 1: amount input + "Run Trial Preview" button
- Step 2: large modal (≥ 90% viewport width or full-screen) with:
  - Top banner: summary stats (Cash Before, Requested, Recommended, Max Possible, Cash After, Tickets Affected, Items Removed)
  - Plan toggle: `[ Recommended ₹9,000 ]  [ Requested ₹10,000 → ₹9,820 ]`
  - Warning line if requested > recommended: "Custom amount removes X additional items (highlighted below)"
  - Per-ticket breakdown table:
    - One card/row per affected ticket
    - Columns: Ticket ID, Branch, Original Amount, Original Items (all), Items To Be Removed (strikethrough), Final Items, Final Amount
    - When "Requested" plan is active, items in `diff_items` are highlighted in orange/amber to show they're the "extras" beyond Recommended
  - Footer buttons: `Back`, `Confirm & Apply Recommended`, `Confirm & Apply Requested`

---

## 9. Reprint Behavior

The existing ticket reprint path (`qz.router` / `pdf_service`) reads `ticket_items` live from the DB. No caching in the admin portal. After deletion, reprints naturally reflect the new item set. **No separate code change needed** — just verify the reprint endpoint does not bypass the DB read. (Verification step in the plan.)

---

## 10. Audit / Reversibility

- `tickets_backup` stores full JSONB snapshot of every affected ticket (pre-adjustment)
- `ticket_items_backup` stores full JSONB snapshot of every deleted ticket_item
- `admin_adjustment_details` has one row per deleted item: `operation_type='DELETE'`, `old_rate`, `old_levy`, `new_rate=0`, `new_levy=0`, `rate_delta=old_rate`, `levy_delta=old_levy`, `total_delta=(old_rate+old_levy)*quantity`, `matched_rule_id`
- Manual restore (not automated in this feature): admin can re-INSERT from `ticket_items_backup` if needed

---

## 11. Open Items (Out of Scope)

- The future sub-screen for the rate/levy reduction engine
- Automated "Undo" UI for admin_adjustments_log entries (manual DB restore for now)
- Per-user / per-branch authorization beyond existing SUPER_ADMIN + ADMIN-with-access model
