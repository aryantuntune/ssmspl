# Ticket date-edit: renumber on collision

**Date:** 2026-05-21
**Branch:** `admin` (admin-portal / Server 2 only — the editable-date feature is admin-only)
**Builds on:** commit `829ce0e` (editable date + optimistic locking + collision/audit guards)

## Problem

Ticket numbers reset per `(branch, date)` — every day a branch's tickets count up from 1.
When an operator edits a ticket to move it to an **earlier date**, the original number
(`#257`) frequently already exists on that target date. The previous behavior **rejected**
the edit with `409 Conflict` ("Ticket #257 already exists … Pick a different date or branch."),
so the move could not be completed.

## Desired behavior

A date move must always succeed. When the moved ticket's number is already taken on the
target `(branch, date)`, the system **renumbers** it to `max(ticket_no on target) + 1` —
appending it after that day's last ticket. If the original number is still free on the
target date, it is **kept** (renumber only on actual collision).

## Design

Single contained change to `update_ticket()` in `backend/app/services/ticket_service.py`,
replacing the collision *rejection* with collision *renumbering*:

1. When `ticket_date` or `branch_id` changes, lock the target `Branch` row
   (`SELECT … FOR UPDATE`) — the same serialization the create path uses — so two
   concurrent moves into the same day cannot both grab the same `MAX+1`.
2. Run the existing collision probe (another row with same `branch_id` + `ticket_date` +
   `ticket_no`, different `id`).
3. **On collision:** set `ticket.ticket_no = MAX(ticket_no) + 1` over all *other* rows in the
   target `(branch, date)` — **including cancelled rows** (they still occupy their number, so
   the new number can never re-collide). Mirrors the create-path numbering.
4. **No collision:** leave `ticket_no` unchanged.

### Decisions

- **Branch change uses the same logic.** The collision probe already fires on branch *or*
  date change; a collision from either trigger renumbers, rather than leaving a contradictory
  409 path.
- **The source day keeps its gap.** When `#257` leaves today, today's sequence skips 257 —
  unchanged from prior date-edit behavior.
- **MAX counts cancelled tickets** so a reassigned number can never collide with an existing
  (even cancelled) row.
- **No DB / schema change.** Pure Python logic; the `version` column already exists on
  Server 2 from `829ce0e`.

### Surfaced to the operator

- **Audit:** the existing `TICKET_DATE_EDIT` activity log payload gains `old_ticket_no` /
  `new_ticket_no` when a renumber occurred (router compares the loaded vs returned `ticket_no`).
- **UI:** the PATCH response already returns the new `ticket_no`. The ticketing edit dialog
  shows a dismissible info banner; the multiticketing dialog shows an `alert()` (matching each
  screen's existing message pattern):
  *"Ticket #257 moved to 12-05-2026. Its old number was already used that day, so it became
  #401 (added after the day's last ticket)."*

## Verification

Direct `update_ticket` exercise against `ssmspl_db_test` (all passing):

| Scenario | Expected |
|---|---|
| Move to a date where the number is taken | renumbered to `MAX+1` |
| Move to a date where the number is free | number kept |
| Collision where the target's max number belongs to a **cancelled** ticket | renumbered past it |
| Same-date no-op | number kept |
| `version` after edit | incremented |
| Pre-existing collision row | untouched |
