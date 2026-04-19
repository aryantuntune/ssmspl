# DRI Item Deletion Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Replace D Drive's Process Reconciliation flow with an item-deletion engine. Dual-plan dry-run (Recommended rounded-down + Requested capped) with per-ticket breakdown. Rule-level `is_protected` flag prevents deletion of human / essential items. Old rate-reduction code preserved but disconnected from the UI.

**Architecture:** Two-phase (dry-run → commit). Dry-run builds both plans and stores them in `admin_adjustments_log.dry_run_summary`. Commit loads stored plan, DELETEs chosen ticket_items, recalculates `tickets.net_amount`, writes `admin_adjustment_details` with `operation_type='DELETE'`.

**Tech Stack:** FastAPI async, SQLAlchemy 2.0, asyncpg, PostgreSQL 16, Alembic; Next.js 16, React 19, TypeScript strict.

---

## File Map

### Modified / Renamed Backend
| File | Change |
|---|---|
| `backend/app/services/admin_adjustment_engine.py` | RENAME → `admin_rate_reduction_engine.py` (preserve old code) |
| `backend/app/services/admin_adjustment_engine.py` | NEW file — item-deletion engine (same filename, same public API signature: `dry_run`, `commit`) |
| `backend/app/models/parameter_master.py` | Add `is_protected` and `min_remaining_per_item` |
| `backend/app/models/admin_adjustment_details.py` | Add `operation_type` |
| `backend/app/models/admin_adjustments_log.py` | Add `plan_choice` |
| `backend/app/routers/admin_d_drive.py` | Update `adjustment_commit` to accept `plan_choice`, update dry-run response docs |
| `backend/app/routers/admin_parameter_master.py` | Add `is_protected` and `min_remaining_per_item` to `RuleOut` and `RuleCreate` |

### New Backend
| File | Purpose |
|---|---|
| `backend/alembic/versions/f3a7b1e8c2d9_add_dri_deletion_fields.py` | Migration: add the 4 new columns |

### Modified Frontend
| File | Change |
|---|---|
| `frontend/src/app/dashboard/d-drive/components/AdjustmentModal.tsx` | Rewrite as step-based (amount → large preview) |
| `frontend/src/app/dashboard/d-drive/components/DryRunPreview.tsx` | Rewrite as large modal with dual plans and per-ticket breakdown |
| `frontend/src/app/dashboard/parameter-master/components/RuleModal.tsx` | Add `is_protected` toggle and `min_remaining_per_item` input |
| `frontend/src/app/dashboard/parameter-master/components/RuleTable.tsx` | Show "Protected" indicator badge |

---

## Task 1: Alembic Migration + Model Updates

**Files:**
- Create: `backend/alembic/versions/f3a7b1e8c2d9_add_dri_deletion_fields.py`
- Modify: `backend/app/models/parameter_master.py`
- Modify: `backend/app/models/admin_adjustment_details.py`
- Modify: `backend/app/models/admin_adjustments_log.py`

- [ ] **Step 1: Write migration** `backend/alembic/versions/f3a7b1e8c2d9_add_dri_deletion_fields.py`

```python
"""add_dri_deletion_fields

Revision ID: f3a7b1e8c2d9
Revises: e1a2b3c4d5f6
Create Date: 2026-04-20 00:00:00.000000

"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'f3a7b1e8c2d9'
down_revision: Union[str, None] = 'e1a2b3c4d5f6'
branch_labels: Union[str, None] = None
depends_on: Union[str, None] = None


def upgrade() -> None:
    # parameter_master
    op.add_column('parameter_master', sa.Column('is_protected', sa.Boolean(), server_default='false', nullable=False))
    op.add_column('parameter_master', sa.Column('min_remaining_per_item', sa.Integer(), server_default='0', nullable=False))

    # admin_adjustment_details
    op.add_column('admin_adjustment_details', sa.Column('operation_type', sa.String(length=10), server_default='MODIFY', nullable=False))
    op.create_check_constraint('ck_adj_details_op_type', 'admin_adjustment_details', "operation_type IN ('MODIFY','DELETE')")

    # admin_adjustments_log
    op.add_column('admin_adjustments_log', sa.Column('plan_choice', sa.String(length=15), nullable=True))
    op.create_check_constraint('ck_adj_log_plan_choice', 'admin_adjustments_log', "plan_choice IS NULL OR plan_choice IN ('recommended','requested')")


def downgrade() -> None:
    op.drop_constraint('ck_adj_log_plan_choice', 'admin_adjustments_log', type_='check')
    op.drop_column('admin_adjustments_log', 'plan_choice')
    op.drop_constraint('ck_adj_details_op_type', 'admin_adjustment_details', type_='check')
    op.drop_column('admin_adjustment_details', 'operation_type')
    op.drop_column('parameter_master', 'min_remaining_per_item')
    op.drop_column('parameter_master', 'is_protected')
```

- [ ] **Step 2: Update `backend/app/models/parameter_master.py`** — add these lines inside the `ParameterMaster` class, right after `is_active`:

```python
    is_protected: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    min_remaining_per_item: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
```

- [ ] **Step 3: Update `backend/app/models/admin_adjustment_details.py`** — add imports and the column. At the top add `from sqlalchemy import CheckConstraint, String`. Add `__table_args__` to the class:

```python
class AdminAdjustmentDetails(Base):
    __tablename__ = "admin_adjustment_details"
    __table_args__ = (
        CheckConstraint(
            "operation_type IN ('MODIFY','DELETE')",
            name="ck_adj_details_op_type",
        ),
    )

    # ...existing columns...

    operation_type: Mapped[str] = mapped_column(String(10), nullable=False, server_default="MODIFY")
```

Place `operation_type` as the last column.

- [ ] **Step 4: Update `backend/app/models/admin_adjustments_log.py`** — inside the existing `__table_args__` tuple, ADD a second CheckConstraint. And add a `plan_choice` column after `error_message`:

```python
    __table_args__ = (
        CheckConstraint(
            "status IN ('DRY_RUN','IN_PROGRESS','COMMITTED','FAILED')",
            name="ck_adj_log_status",
        ),
        CheckConstraint(
            "plan_choice IS NULL OR plan_choice IN ('recommended','requested')",
            name="ck_adj_log_plan_choice",
        ),
    )

    # ...existing columns...

    plan_choice: Mapped[str | None] = mapped_column(String(15), nullable=True)
```

- [ ] **Step 5: Verify compilation**

```bash
cd D:/workspace/ssmspl/backend
python -c "import py_compile; [py_compile.compile(f, doraise=True) for f in ['app/models/parameter_master.py', 'app/models/admin_adjustment_details.py', 'app/models/admin_adjustments_log.py', 'alembic/versions/f3a7b1e8c2d9_add_dri_deletion_fields.py']]; print('ok')"
```

- [ ] **Step 6: Commit**

```bash
git add backend/alembic/versions/f3a7b1e8c2d9_add_dri_deletion_fields.py backend/app/models/parameter_master.py backend/app/models/admin_adjustment_details.py backend/app/models/admin_adjustments_log.py
git commit -m "feat: add DRI deletion schema fields (is_protected, operation_type, plan_choice)"
```

---

## Task 2: Preserve Old Engine + Scaffold New Engine File

**Files:**
- Rename: `backend/app/services/admin_adjustment_engine.py` → `backend/app/services/admin_rate_reduction_engine.py`
- Create: `backend/app/services/admin_adjustment_engine.py` (new, empty scaffold)

- [ ] **Step 1: Rename the old engine file**

```bash
cd D:/workspace/ssmspl
git mv backend/app/services/admin_rate_reduction_engine.py backend/app/services/admin_rate_reduction_engine.py 2>/dev/null || true
git mv backend/app/services/admin_adjustment_engine.py backend/app/services/admin_rate_reduction_engine.py
```

- [ ] **Step 2: Create stub `backend/app/services/admin_adjustment_engine.py`**

```python
"""
Item-deletion adjustment engine for D Drive Process Reconciliation.
Separate from admin_rate_reduction_engine.py (the rate/levy mutation engine, reserved for future sub-screen).
"""
# Full implementation added in Task 3.

import uuid
from datetime import date
from sqlalchemy.ext.asyncio import AsyncSession


async def dry_run(
    db: AsyncSession,
    branch_id: int,
    date_start: date,
    date_end: date,
    adjustment_amount: float,
    created_by: uuid.UUID,
) -> dict:
    raise NotImplementedError("Implemented in Task 3")


async def commit(
    db: AsyncSession,
    batch_id: str,
    plan_choice: str,
    confirmed_by: uuid.UUID,
) -> dict:
    raise NotImplementedError("Implemented in Task 3")
```

- [ ] **Step 3: Verify the router still imports**

```bash
cd D:/workspace/ssmspl/backend
python -c "import py_compile; py_compile.compile('app/routers/admin_d_drive.py', doraise=True); py_compile.compile('app/services/admin_adjustment_engine.py', doraise=True); py_compile.compile('app/services/admin_rate_reduction_engine.py', doraise=True); print('ok')"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/admin_adjustment_engine.py backend/app/services/admin_rate_reduction_engine.py
git commit -m "refactor: preserve rate-reduction engine, scaffold new deletion engine"
```

---

## Task 3: Full Deletion Engine Implementation

**File:** `backend/app/services/admin_adjustment_engine.py`

- [ ] **Step 1: Replace the stub with the full engine**

```python
"""
Item-deletion adjustment engine for D Drive Process Reconciliation.
Computes Recommended + Requested plans in dry-run, stores both in the log,
and DELETEs chosen ticket_items on commit.
"""
import hashlib
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal, ROUND_DOWN
from sqlalchemy import func, select, text, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.database import AsyncSessionLocal
from app.models.ticket import Ticket, TicketItem
from app.models.payment_mode import PaymentMode
from app.models.parameter_master import ParameterMaster
from app.models.admin_adjustments_log import AdminAdjustmentsLog
from app.models.admin_adjustment_details import AdminAdjustmentDetails
from app.models.tickets_backup import TicketsBackup
from app.models.ticket_items_backup import TicketItemsBackup
from app.models.item import Item

MAX_ITEM_ROWS = 5000


def _date_lock_hash(date_start: date, date_end: date) -> int:
    raw = f"{date_start}{date_end}".encode()
    return int(hashlib.md5(raw).hexdigest(), 16) % (2**31 - 1)


def _round_down_to_clean(amount: Decimal) -> Decimal:
    """Smart rounding: <1k->100, 1k-10k->500, >10k->1000."""
    if amount < Decimal("1000"):
        step = Decimal("100")
    elif amount <= Decimal("10000"):
        step = Decimal("500")
    else:
        step = Decimal("1000")
    return (amount // step) * step


async def _count_eligible_unprotected_items(
    db: AsyncSession, branch_id: int, date_start: date, date_end: date, protected_item_ids: set[int]
) -> int:
    q = (
        select(func.count(TicketItem.id))
        .select_from(TicketItem)
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id == branch_id,
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
            PaymentMode.name == "CASH",
        )
    )
    if protected_item_ids:
        q = q.where(~TicketItem.item_id.in_(protected_item_ids))
    return (await db.execute(q)).scalar_one()


async def _fetch_cash_total(
    db: AsyncSession, branch_id: int, date_start: date, date_end: date
) -> Decimal:
    q = (
        select(func.coalesce(func.sum(Ticket.net_amount), 0))
        .select_from(Ticket)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id == branch_id,
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
            PaymentMode.name == "CASH",
        )
    )
    return Decimal(str((await db.execute(q)).scalar_one()))


def _order_clause(rule: ParameterMaster):
    order = rule.ticket_selection_order
    item_value = (TicketItem.rate + TicketItem.levy) * TicketItem.quantity
    if order == "LIFO":
        return [Ticket.id.desc(), TicketItem.id.asc()]
    if order == "HIGHEST_VALUE":
        return [item_value.desc(), Ticket.id.asc(), TicketItem.id.asc()]
    if order == "LOWEST_VALUE":
        return [item_value.asc(), Ticket.id.asc(), TicketItem.id.asc()]
    return [Ticket.id.asc(), TicketItem.id.asc()]  # FIFO default


async def _build_deletion_plan(
    db: AsyncSession,
    branch_id: int,
    date_start: date,
    date_end: date,
    target_amount: Decimal,
    protected_item_ids: set[int],
) -> tuple[list[int], Decimal, dict[int, list[dict]]]:
    """
    Build a deletion plan that deletes items until cumulative value reaches target_amount
    without overshoot. Walks rules in priority_order; within each rule uses ticket_selection_order.
    Returns (item_ids_to_delete, actual_applied, per_ticket_detail).
    per_ticket_detail maps ticket_id -> list of item dicts to be deleted.
    """
    if target_amount <= 0:
        return [], Decimal("0"), {}

    # Load active UNPROTECTED rules in priority order
    rules_result = await db.execute(
        select(ParameterMaster)
        .where(ParameterMaster.is_active == True, ParameterMaster.is_protected == False)
        .order_by(ParameterMaster.priority_order)
    )
    rules = list(rules_result.scalars().all())

    deletion_ids: list[int] = []
    deletion_set: set[int] = set()  # for duplicate prevention across rules
    applied = Decimal("0")
    per_ticket: dict[int, list[dict]] = {}
    remaining = target_amount

    for rule in rules:
        if remaining <= 0:
            break

        # Per-rule cap
        max_per_rule = Decimal(str(rule.max_total_adjustment_per_rule)) if rule.max_total_adjustment_per_rule else None
        rule_cap = min(remaining, max_per_rule) if max_per_rule else remaining
        if rule_cap <= 0:
            continue

        # Fetch candidate items for this rule
        q = (
            select(
                TicketItem.id.label("tiid"),
                TicketItem.ticket_id,
                TicketItem.item_id,
                TicketItem.rate,
                TicketItem.levy,
                TicketItem.quantity,
                Item.name.label("item_name"),
            )
            .select_from(TicketItem)
            .join(Ticket, Ticket.id == TicketItem.ticket_id)
            .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
            .join(Item, Item.id == TicketItem.item_id)
            .where(
                Ticket.branch_id == branch_id,
                Ticket.ticket_date >= date_start,
                Ticket.ticket_date <= date_end,
                Ticket.is_cancelled == False,
                TicketItem.is_cancelled == False,
                PaymentMode.name == "CASH",
            )
            .order_by(*_order_clause(rule))
        )
        if protected_item_ids:
            q = q.where(~TicketItem.item_id.in_(protected_item_ids))
        if rule.item_id:
            q = q.where(TicketItem.item_id == rule.item_id)

        rows = (await db.execute(q)).all()

        max_per_ticket = Decimal(str(rule.max_adjustment_per_ticket)) if rule.max_adjustment_per_ticket else None
        rule_spent = Decimal("0")
        ticket_spent: dict[int, Decimal] = {}

        for r in rows:
            if r.tiid in deletion_set:
                continue
            if rule_spent >= rule_cap or remaining <= 0:
                break

            item_value = (Decimal(str(r.rate)) + Decimal(str(r.levy))) * r.quantity

            # Overshoot check — never delete an item whose value would exceed remaining
            if item_value > remaining or item_value > (rule_cap - rule_spent):
                continue

            # Per-ticket cap
            if max_per_ticket is not None:
                tspent = ticket_spent.get(r.ticket_id, Decimal("0"))
                if item_value > (max_per_ticket - tspent):
                    continue
                ticket_spent[r.ticket_id] = tspent + item_value

            deletion_ids.append(r.tiid)
            deletion_set.add(r.tiid)
            applied += item_value
            rule_spent += item_value
            remaining -= item_value
            per_ticket.setdefault(r.ticket_id, []).append({
                "ticket_item_id": r.tiid,
                "item_id": r.item_id,
                "item_name": r.item_name,
                "rate": float(r.rate),
                "levy": float(r.levy),
                "quantity": r.quantity,
                "line_value": float(item_value),
            })

        if rule.stop_on_match and rule_spent > 0:
            break

    return deletion_ids, applied, per_ticket


async def _snapshot_tickets_for_preview(
    db: AsyncSession, ticket_ids: list[int]
) -> dict[int, dict]:
    """Return ticket_id -> {original_amount, all_items} for the preview UI."""
    if not ticket_ids:
        return {}
    q = (
        select(
            Ticket.id.label("ticket_id"),
            Ticket.net_amount,
            Ticket.branch_id,
            TicketItem.id.label("tiid"),
            TicketItem.item_id,
            TicketItem.rate,
            TicketItem.levy,
            TicketItem.quantity,
            Item.name.label("item_name"),
        )
        .select_from(Ticket)
        .join(TicketItem, TicketItem.ticket_id == Ticket.id)
        .join(Item, Item.id == TicketItem.item_id)
        .where(Ticket.id.in_(ticket_ids), TicketItem.is_cancelled == False)
        .order_by(Ticket.id.asc(), TicketItem.id.asc())
    )
    rows = (await db.execute(q)).all()
    result: dict[int, dict] = {}
    for r in rows:
        if r.ticket_id not in result:
            result[r.ticket_id] = {
                "ticket_id": r.ticket_id,
                "branch_id": r.branch_id,
                "original_amount": float(r.net_amount),
                "items": [],
            }
        result[r.ticket_id]["items"].append({
            "ticket_item_id": r.tiid,
            "item_id": r.item_id,
            "item_name": r.item_name,
            "rate": float(r.rate),
            "levy": float(r.levy),
            "quantity": r.quantity,
            "line_value": float((Decimal(str(r.rate)) + Decimal(str(r.levy))) * r.quantity),
        })
    return result


async def dry_run(
    db: AsyncSession,
    branch_id: int,
    date_start: date,
    date_end: date,
    adjustment_amount: float,
    created_by: uuid.UUID,
) -> dict:
    requested = Decimal(str(adjustment_amount)).quantize(Decimal("0.01"))
    if requested <= 0:
        raise HTTPException(status_code=400, detail="Adjustment amount must be positive")

    # Load protected item IDs from protected rules
    protected_result = await db.execute(
        select(ParameterMaster.item_id)
        .where(ParameterMaster.is_active == True, ParameterMaster.is_protected == True)
    )
    protected_item_ids = {row[0] for row in protected_result.all() if row[0] is not None}

    # Guard 1: row count
    item_count = await _count_eligible_unprotected_items(db, branch_id, date_start, date_end, protected_item_ids)
    if item_count > MAX_ITEM_ROWS:
        raise HTTPException(status_code=400, detail=f"Too many eligible ticket items ({item_count}). Reduce the date range. Max: {MAX_ITEM_ROWS}")
    if item_count == 0:
        raise HTTPException(status_code=400, detail="No unprotected items available for deletion in this branch / date range")

    cash_total = await _fetch_cash_total(db, branch_id, date_start, date_end)

    # Compute max_possible_adjustment: total value of all eligible unprotected items
    max_possible = Decimal("0")
    max_possible_q = (
        select(func.coalesce(func.sum((TicketItem.rate + TicketItem.levy) * TicketItem.quantity), 0))
        .select_from(TicketItem)
        .join(Ticket, Ticket.id == TicketItem.ticket_id)
        .join(PaymentMode, PaymentMode.id == Ticket.payment_mode_id)
        .where(
            Ticket.branch_id == branch_id,
            Ticket.ticket_date >= date_start,
            Ticket.ticket_date <= date_end,
            Ticket.is_cancelled == False,
            TicketItem.is_cancelled == False,
            PaymentMode.name == "CASH",
        )
    )
    if protected_item_ids:
        max_possible_q = max_possible_q.where(~TicketItem.item_id.in_(protected_item_ids))
    max_possible = Decimal(str((await db.execute(max_possible_q)).scalar_one()))

    if max_possible <= 0:
        raise HTTPException(status_code=400, detail="No value available for deletion")

    recommended_amount = _round_down_to_clean(max_possible)
    if recommended_amount <= 0:
        recommended_amount = max_possible  # fallback for very small amounts

    # Build both plans
    rec_ids, rec_applied, rec_detail = await _build_deletion_plan(db, branch_id, date_start, date_end, recommended_amount, protected_item_ids)

    req_target = min(requested, max_possible)
    req_ids, req_applied, req_detail = await _build_deletion_plan(db, branch_id, date_start, date_end, req_target, protected_item_ids)

    # Diff items: in requested but not in recommended
    rec_id_set = set(rec_ids)
    diff_items = [tid for tid in req_ids if tid not in rec_id_set]

    # Build preview snapshots
    all_affected_ticket_ids = list(set(list(rec_detail.keys()) + list(req_detail.keys())))
    ticket_snapshots = await _snapshot_tickets_for_preview(db, all_affected_ticket_ids)

    def build_tickets_view(plan_detail: dict[int, list[dict]]) -> list[dict]:
        out = []
        for tid, items in plan_detail.items():
            snap = ticket_snapshots.get(tid, {"ticket_id": tid, "branch_id": branch_id, "original_amount": 0.0, "items": []})
            deleted_ids = {it["ticket_item_id"] for it in items}
            final_items = [i for i in snap["items"] if i["ticket_item_id"] not in deleted_ids]
            final_amount = sum(i["line_value"] for i in final_items)
            out.append({
                "ticket_id": tid,
                "branch_id": snap["branch_id"],
                "original_amount": snap["original_amount"],
                "original_items": snap["items"],
                "items_to_remove": items,
                "final_items": final_items,
                "final_amount": final_amount,
            })
        return sorted(out, key=lambda t: t["ticket_id"])

    execution_plan = {
        "branch_id": branch_id,
        "date_start": str(date_start),
        "date_end": str(date_end),
        "requested_adjustment": str(requested),
        "recommended_adjustment": str(recommended_amount),
        "max_possible_adjustment": str(max_possible),
        "cash_total_before": str(cash_total),
        "recommended_plan": {
            "applied": str(rec_applied),
            "item_ids": rec_ids,
            "tickets": build_tickets_view(rec_detail),
        },
        "requested_plan": {
            "applied": str(req_applied),
            "item_ids": req_ids,
            "tickets": build_tickets_view(req_detail),
        },
        "diff_items": diff_items,
    }

    log = AdminAdjustmentsLog(
        branch_id=branch_id,
        date_range_start=date_start,
        date_range_end=date_end,
        adjustment_amount=float(requested),
        dry_run_summary=execution_plan,
        total_tickets_affected=len(req_detail),
        total_items_affected=len(req_ids),
        row_count_checked=item_count,
        status="DRY_RUN",
        created_by=created_by,
    )
    db.add(log)
    await db.flush()
    await db.refresh(log)

    return {
        "batch_id": str(log.id),
        "cash_total_before": float(cash_total),
        "requested_adjustment": float(requested),
        "recommended_adjustment": float(recommended_amount),
        "max_possible_adjustment": float(max_possible),
        "recommended_plan": {
            "applied": float(rec_applied),
            "tickets": execution_plan["recommended_plan"]["tickets"],
            "item_ids": rec_ids,
        },
        "requested_plan": {
            "applied": float(req_applied),
            "tickets": execution_plan["requested_plan"]["tickets"],
            "item_ids": req_ids,
        },
        "diff_items": diff_items,
    }


async def commit(
    db: AsyncSession,
    batch_id: str,
    plan_choice: str,
    confirmed_by: uuid.UUID,
) -> dict:
    if plan_choice not in ("recommended", "requested"):
        raise HTTPException(status_code=400, detail="plan_choice must be 'recommended' or 'requested'")

    result = await db.execute(
        select(AdminAdjustmentsLog).where(AdminAdjustmentsLog.id == batch_id)
    )
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Adjustment batch not found")
    if log.status != "DRY_RUN":
        raise HTTPException(status_code=400, detail=f"Batch is not in DRY_RUN state (current: {log.status})")

    plan = log.dry_run_summary[f"{plan_choice}_plan"]
    item_ids: list[int] = plan["item_ids"]
    tickets_view: list[dict] = plan["tickets"]

    if not item_ids:
        raise HTTPException(status_code=400, detail="No items in selected plan")

    # Mark IN_PROGRESS in a separate session
    async with AsyncSessionLocal() as log_session:
        async with log_session.begin():
            await log_session.execute(
                update(AdminAdjustmentsLog)
                .where(AdminAdjustmentsLog.id == batch_id)
                .values(status="IN_PROGRESS", plan_choice=plan_choice)
            )

    try:
        date_hash = _date_lock_hash(log.date_range_start, log.date_range_end)
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:a, :b)"),
            {"a": log.branch_id, "b": date_hash},
        )

        ticket_ids = list({t["ticket_id"] for t in tickets_view})

        # Backup affected tickets
        tickets_result = await db.execute(select(Ticket).where(Ticket.id.in_(ticket_ids)))
        for ticket in tickets_result.scalars().all():
            db.add(TicketsBackup(
                adjustment_batch_id=log.id,
                ticket_id=ticket.id,
                original_data={
                    "id": ticket.id,
                    "net_amount": str(ticket.net_amount),
                    "amount": str(ticket.amount),
                    "discount": str(ticket.discount) if ticket.discount is not None else None,
                    "branch_id": ticket.branch_id,
                    "ticket_date": str(ticket.ticket_date),
                },
            ))

        # Backup items being deleted (full row snapshot)
        items_result = await db.execute(select(TicketItem).where(TicketItem.id.in_(item_ids)))
        item_rows_by_id: dict[int, TicketItem] = {}
        for ti in items_result.scalars().all():
            item_rows_by_id[ti.id] = ti
            db.add(TicketItemsBackup(
                adjustment_batch_id=log.id,
                ticket_item_id=ti.id,
                ticket_id=ti.ticket_id,
                original_data={
                    "id": ti.id,
                    "ticket_id": ti.ticket_id,
                    "item_id": ti.item_id,
                    "rate": str(ti.rate),
                    "levy": str(ti.levy),
                    "quantity": ti.quantity,
                    "vehicle_no": ti.vehicle_no,
                    "vehicle_name": ti.vehicle_name,
                },
            ))

        # Audit details — one row per deleted item
        for t in tickets_view:
            for it in t["items_to_remove"]:
                ti = item_rows_by_id.get(it["ticket_item_id"])
                if ti is None:
                    continue
                rate_dec = Decimal(str(ti.rate))
                levy_dec = Decimal(str(ti.levy))
                total_del = (rate_dec + levy_dec) * ti.quantity
                db.add(AdminAdjustmentDetails(
                    adjustment_id=log.id,
                    ticket_id=ti.ticket_id,
                    ticket_item_id=ti.id,
                    old_rate=float(rate_dec),
                    old_levy=float(levy_dec),
                    new_rate=0.0,
                    new_levy=0.0,
                    rate_delta=float(rate_dec),
                    levy_delta=float(levy_dec),
                    total_delta=float(total_del),
                    matched_rule_id=None,
                    operation_type="DELETE",
                ))

        # DELETE the items
        await db.execute(delete(TicketItem).where(TicketItem.id.in_(item_ids)))

        # Recalc net_amount for affected tickets only
        await db.execute(
            text("""
                UPDATE tickets
                SET net_amount = (
                    SELECT COALESCE(SUM((ti.rate + ti.levy) * ti.quantity), 0)
                    FROM ticket_items ti
                    WHERE ti.ticket_id = tickets.id AND ti.is_cancelled = false
                )
                WHERE id = ANY(:ids)
            """),
            {"ids": ticket_ids},
        )

        # Finalize log
        log.status = "COMMITTED"
        log.executed_at = datetime.now(timezone.utc)
        log.plan_choice = plan_choice
        log.total_tickets_affected = len(ticket_ids)
        log.total_items_affected = len(item_ids)
        await db.flush()

    except Exception as exc:
        async with AsyncSessionLocal() as log_session:
            async with log_session.begin():
                await log_session.execute(
                    update(AdminAdjustmentsLog)
                    .where(AdminAdjustmentsLog.id == batch_id)
                    .values(status="FAILED", error_message=str(exc)[:2000])
                )
        raise

    return {
        "batch_id": str(log.id),
        "status": "COMMITTED",
        "plan_choice": plan_choice,
        "tickets_affected": len(ticket_ids),
        "items_deleted": len(item_ids),
        "executed_at": log.executed_at.isoformat(),
    }
```

- [ ] **Step 2: Verify**

```bash
cd D:/workspace/ssmspl/backend
python -c "import py_compile; py_compile.compile('app/services/admin_adjustment_engine.py', doraise=True); print('ok')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/admin_adjustment_engine.py
git commit -m "feat: implement DRI item-deletion adjustment engine with dual-plan dry-run"
```

---

## Task 4: Update D Drive Router (accept plan_choice)

**File:** `backend/app/routers/admin_d_drive.py`

- [ ] **Step 1: Update the `CommitRequest` and `adjustment_commit` to accept `plan_choice`**

Replace the existing `CommitRequest` class:
```python
class CommitRequest(BaseModel):
    batch_id: str
    plan_choice: str  # "recommended" or "requested"
```

Replace the existing `adjustment_commit` endpoint:
```python
@router.post("/adjustment/commit")
async def adjustment_commit(
    body: CommitRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(_admin_or_super),
):
    return await admin_adjustment_engine.commit(db, body.batch_id, body.plan_choice, current_user.id)
```

- [ ] **Step 2: Verify**

```bash
cd D:/workspace/ssmspl/backend
python -c "import py_compile; py_compile.compile('app/routers/admin_d_drive.py', doraise=True); print('ok')"
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/admin_d_drive.py
git commit -m "feat: add plan_choice to D Drive commit endpoint"
```

---

## Task 5: Update Parameter Master Router Schema

**File:** `backend/app/routers/admin_parameter_master.py`

- [ ] **Step 1: Add `is_protected` and `min_remaining_per_item` to both `RuleOut` and `RuleCreate`**

In `RuleOut`:
```python
    is_protected: bool
    min_remaining_per_item: int
```

In `RuleCreate`:
```python
    is_protected: bool = False
    min_remaining_per_item: int = 0
```

- [ ] **Step 2: Verify + commit**

```bash
cd D:/workspace/ssmspl/backend
python -c "import py_compile; py_compile.compile('app/routers/admin_parameter_master.py', doraise=True); print('ok')"
cd ..
git add backend/app/routers/admin_parameter_master.py
git commit -m "feat: expose is_protected and min_remaining_per_item on parameter master API"
```

---

## Task 6: Update Parameter Master Frontend (rule creation/edit)

**Files:**
- Modify: `frontend/src/app/dashboard/parameter-master/components/RuleModal.tsx`
- Modify: `frontend/src/app/dashboard/parameter-master/components/RuleTable.tsx`

- [ ] **Step 1: Update `RuleModal.tsx`** — update the `Rule` interface:

```tsx
interface Rule {
  id?: number;
  priority_order: number;
  branch_scope: number | null;
  item_id: number | null;
  payment_mode: string;
  ticket_selection_order: string;
  max_adjustment_per_ticket: number | null;
  max_adjustment_per_item: number | null;
  max_total_adjustment_per_rule: number | null;
  stop_on_match: boolean;
  is_protected: boolean;
  min_remaining_per_item: number;
}
```

Update `EMPTY`:
```tsx
const EMPTY: Rule = {
  priority_order: 1,
  branch_scope: null,
  item_id: null,
  payment_mode: "CASH",
  ticket_selection_order: "FIFO",
  max_adjustment_per_ticket: null,
  max_adjustment_per_item: null,
  max_total_adjustment_per_rule: null,
  stop_on_match: false,
  is_protected: false,
  min_remaining_per_item: 0,
};
```

Add this UI section at the end of the grid (before the closing `</div>` of the grid div), just above the `stop_on_match` row:
```tsx
          <div className="col-span-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded p-3">
            <div className="flex items-center gap-3">
              <Switch checked={form.is_protected} onCheckedChange={v => set("is_protected", v)} />
              <div>
                <Label className="text-sm font-semibold">Protected item rule</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Items matching this rule will NEVER be deleted during reconciliation.
                </p>
              </div>
            </div>
          </div>
          {!form.is_protected && (
            <div className="col-span-2 space-y-1.5">
              <Label>Min Remaining Per Item</Label>
              <Input
                type="number"
                min="0"
                value={form.min_remaining_per_item}
                onChange={e => set("min_remaining_per_item", parseInt(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">Default 0 — unprotected items can be fully deleted.</p>
            </div>
          )}
```

Update the payload builder in `handleSave`:
```tsx
      const payload = {
        ...form,
        branch_scope: form.branch_scope || null,
        item_id: form.item_id || null,
        max_adjustment_per_ticket: form.max_adjustment_per_ticket || null,
        max_adjustment_per_item: form.max_adjustment_per_item || null,
        max_total_adjustment_per_rule: form.max_total_adjustment_per_rule || null,
        ticket_conditions: {},
        item_conditions: {},
      };
```
(No change needed to payload — the form fields are already included.)

- [ ] **Step 2: Update `RuleTable.tsx`** — update the `Rule` interface:

```tsx
interface Rule {
  id: number;
  priority_order: number;
  branch_scope: number | null;
  item_id: number | null;
  payment_mode: string;
  ticket_selection_order: string;
  max_total_adjustment_per_rule: number | null;
  stop_on_match: boolean;
  is_active: boolean;
  is_protected: boolean;
  min_remaining_per_item: number;
}
```

Add a "Type" column after "Mode". Update the header array:
```tsx
["#", "Branch", "Item", "Mode", "Type", "Order", "Max/Rule", "Stop", "Status", "Actions"]
```

Add the corresponding `<td>` in the row rendering, after the Mode td:
```tsx
              <td className="px-4 py-2.5">
                {r.is_protected ? (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                    Protected
                  </span>
                ) : (
                  <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
                    Deletable
                  </span>
                )}
              </td>
```

Update the `colSpan` for the "No rules" row from `colSpan={9}` to `colSpan={10}`.

- [ ] **Step 3: Verify + commit**

```bash
cd D:/workspace/ssmspl/frontend
node_modules/.bin/tsc --noEmit 2>&1 | grep -v "Cannot find module\|TS2307\|moduleResolution\|TS2688" | head -20
cd ..
git add frontend/src/app/dashboard/parameter-master/
git commit -m "feat: add is_protected and min_remaining_per_item UI to Parameter Master"
```

---

## Task 7: Rewrite D Drive Adjustment Modal and Preview

**Files:**
- Rewrite: `frontend/src/app/dashboard/d-drive/components/AdjustmentModal.tsx`
- Rewrite: `frontend/src/app/dashboard/d-drive/components/DryRunPreview.tsx`

- [ ] **Step 1: Replace `AdjustmentModal.tsx` completely**

```tsx
"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import api from "@/lib/api";
import DryRunPreview, { DryRunResult } from "./DryRunPreview";

interface Props {
  open: boolean;
  branchId: number;
  branchName: string;
  cashTotal: number;
  dateStart: string;
  dateEnd: string;
  onClose: () => void;
  onCommitted: () => void;
}

export default function AdjustmentModal({
  open, branchId, branchName, cashTotal, dateStart, dateEnd, onClose, onCommitted,
}: Props) {
  const [amount, setAmount] = useState("");
  const [dryRunResult, setDryRunResult] = useState<DryRunResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleDryRun = async () => {
    setError("");
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) { setError("Enter a valid positive amount."); return; }
    setLoading(true);
    try {
      const res = await api.post<DryRunResult>("/api/admin/d-drive/adjustment/dry-run", {
        branch_id: branchId,
        date_start: dateStart,
        date_end: dateEnd,
        adjustment_amount: amt,
      });
      setDryRunResult(res.data);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Dry-run failed");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setAmount(""); setDryRunResult(null); setError("");
    onClose();
  };

  if (dryRunResult) {
    return (
      <DryRunPreview
        result={dryRunResult}
        branchName={branchName}
        onCancel={() => setDryRunResult(null)}
        onCommitted={() => { handleClose(); onCommitted(); }}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Process Reconciliation — {branchName}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Cash eligible: ₹{cashTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
          </p>
        </DialogHeader>

        <div className="space-y-2">
          <Label>Adjustment Amount (₹)</Label>
          <Input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="text-xl font-semibold"
          />
          <p className="text-xs text-muted-foreground">
            The system will delete unprotected line items from CASH tickets to reach this amount.
          </p>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancel</Button>
          <Button onClick={handleDryRun} disabled={loading}>
            {loading ? "Calculating…" : "Run Trial Preview →"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Replace `DryRunPreview.tsx` completely**

```tsx
"use client";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import api from "@/lib/api";

interface ItemLine {
  ticket_item_id: number;
  item_id: number;
  item_name: string;
  rate: number;
  levy: number;
  quantity: number;
  line_value: number;
}

interface TicketView {
  ticket_id: number;
  branch_id: number;
  original_amount: number;
  original_items: ItemLine[];
  items_to_remove: ItemLine[];
  final_items: ItemLine[];
  final_amount: number;
}

interface Plan {
  applied: number;
  tickets: TicketView[];
  item_ids: number[];
}

export interface DryRunResult {
  batch_id: string;
  cash_total_before: number;
  requested_adjustment: number;
  recommended_adjustment: number;
  max_possible_adjustment: number;
  recommended_plan: Plan;
  requested_plan: Plan;
  diff_items: number[];
}

interface Props {
  result: DryRunResult;
  branchName: string;
  onCancel: () => void;
  onCommitted: () => void;
}

const fmt = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function DryRunPreview({ result, branchName, onCancel, onCommitted }: Props) {
  const [activePlan, setActivePlan] = useState<"recommended" | "requested">("recommended");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const plan = activePlan === "recommended" ? result.recommended_plan : result.requested_plan;
  const diffSet = new Set(result.diff_items);
  const cashAfter = result.cash_total_before - plan.applied;
  const notApplied = (activePlan === "recommended" ? result.recommended_adjustment : result.requested_adjustment) - plan.applied;

  const handleCommit = async (choice: "recommended" | "requested") => {
    setLoading(true);
    setError("");
    try {
      await api.post("/api/admin/d-drive/adjustment/commit", {
        batch_id: result.batch_id,
        plan_choice: choice,
      });
      onCommitted();
    } catch (e) {
      const err = e as { response?: { data?: { detail?: string } } };
      setError(err?.response?.data?.detail ?? "Commit failed");
      setLoading(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={v => !v && onCancel()}>
      <DialogContent className="!max-w-[95vw] w-[95vw] !max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 border-b">
          <DialogTitle>Trial Preview — {branchName}</DialogTitle>
        </DialogHeader>

        {/* Summary bar */}
        <div className="px-6 py-3 border-b grid grid-cols-7 gap-3">
          {[
            { label: "Cash Before", value: fmt(result.cash_total_before) },
            { label: "Requested", value: fmt(result.requested_adjustment) },
            { label: "Recommended", value: fmt(result.recommended_adjustment), accent: "text-emerald-600 dark:text-emerald-400" },
            { label: "Max Possible", value: fmt(result.max_possible_adjustment) },
            { label: "Actual Applied", value: fmt(plan.applied), accent: "text-destructive" },
            { label: "Cash After", value: fmt(cashAfter), accent: "text-primary" },
            { label: "Items Removed", value: String(plan.item_ids.length) },
          ].map(({ label, value, accent }) => (
            <div key={label} className="bg-muted/50 rounded p-2">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</p>
              <p className={`font-bold text-sm mt-0.5 ${accent ?? ""}`}>{value}</p>
            </div>
          ))}
        </div>

        {/* Plan toggle */}
        <div className="px-6 py-3 border-b flex items-center gap-2">
          <span className="text-sm font-medium mr-2">View plan:</span>
          <button
            onClick={() => setActivePlan("recommended")}
            className={`px-4 py-1.5 rounded text-sm font-medium border ${activePlan === "recommended" ? "bg-emerald-600 text-white border-emerald-600" : "bg-card border-border"}`}
          >
            Recommended ({fmt(result.recommended_plan.applied)})
          </button>
          <button
            onClick={() => setActivePlan("requested")}
            className={`px-4 py-1.5 rounded text-sm font-medium border ${activePlan === "requested" ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border"}`}
          >
            Requested ({fmt(result.requested_plan.applied)})
          </button>
          {activePlan === "requested" && result.diff_items.length > 0 && (
            <p className="text-xs text-amber-600 dark:text-amber-400 ml-3">
              Custom amount removes {result.diff_items.length} additional items (highlighted below)
            </p>
          )}
          {notApplied > 0.01 && (
            <p className="text-xs text-muted-foreground ml-auto">
              {fmt(notApplied)} could not be applied (discrete item values)
            </p>
          )}
        </div>

        {/* Per-ticket breakdown */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {plan.tickets.length === 0 && (
            <p className="text-muted-foreground text-center py-8">No tickets affected.</p>
          )}
          {plan.tickets.map(t => (
            <div key={t.ticket_id} className="border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/40 flex items-center justify-between text-sm">
                <div className="flex items-center gap-4">
                  <span className="font-mono font-semibold text-primary">#{t.ticket_id}</span>
                  <span className="text-muted-foreground">Original: {fmt(t.original_amount)}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Final: {fmt(t.final_amount)}</span>
                  <span className="text-destructive font-semibold">−{fmt(t.original_amount - t.final_amount)}</span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {t.items_to_remove.length} item{t.items_to_remove.length !== 1 ? "s" : ""} removed
                </span>
              </div>
              <div className="grid grid-cols-2 divide-x">
                <div className="p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Original Items</p>
                  <ul className="space-y-0.5 text-sm">
                    {t.original_items.map(i => {
                      const toRemove = t.items_to_remove.some(r => r.ticket_item_id === i.ticket_item_id);
                      const isExtra = toRemove && diffSet.has(i.ticket_item_id);
                      return (
                        <li
                          key={i.ticket_item_id}
                          className={`flex justify-between ${toRemove ? "line-through text-destructive" : ""} ${isExtra ? "bg-amber-100 dark:bg-amber-950/40 rounded px-1" : ""}`}
                        >
                          <span>{i.quantity}× {i.item_name}</span>
                          <span className="tabular-nums">{fmt(i.line_value)}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <div className="p-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1.5">Final Items</p>
                  <ul className="space-y-0.5 text-sm">
                    {t.final_items.length === 0 ? (
                      <li className="text-muted-foreground italic">(empty ticket)</li>
                    ) : (
                      t.final_items.map(i => (
                        <li key={i.ticket_item_id} className="flex justify-between">
                          <span>{i.quantity}× {i.item_name}</span>
                          <span className="tabular-nums">{fmt(i.line_value)}</span>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>

        {error && <p className="px-6 py-2 text-sm text-destructive border-t">{error}</p>}

        <div className="px-6 py-3 border-t flex gap-2 justify-end bg-card">
          <Button variant="outline" onClick={onCancel} disabled={loading}>← Back</Button>
          <Button
            onClick={() => handleCommit("recommended")}
            disabled={loading || result.recommended_plan.item_ids.length === 0}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            {loading && activePlan === "recommended" ? "Applying…" : `Confirm Recommended (${fmt(result.recommended_plan.applied)})`}
          </Button>
          <Button
            onClick={() => handleCommit("requested")}
            disabled={loading || result.requested_plan.item_ids.length === 0}
          >
            {loading && activePlan === "requested" ? "Applying…" : `Confirm Requested (${fmt(result.requested_plan.applied)})`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Verify + commit**

```bash
cd D:/workspace/ssmspl/frontend
node_modules/.bin/tsc --noEmit 2>&1 | grep -v "Cannot find module\|TS2307\|moduleResolution\|TS2688" | head -20
cd ..
git add frontend/src/app/dashboard/d-drive/components/AdjustmentModal.tsx frontend/src/app/dashboard/d-drive/components/DryRunPreview.tsx
git commit -m "feat: rewrite D Drive adjustment UI with dual-plan deletion preview"
```

---

## Task 8: Final Verification

- [ ] **Step 1: Full backend compile check**

```bash
cd D:/workspace/ssmspl/backend
python -c "
import py_compile
files = [
    'app/services/admin_adjustment_engine.py',
    'app/services/admin_rate_reduction_engine.py',
    'app/routers/admin_d_drive.py',
    'app/routers/admin_parameter_master.py',
    'app/models/parameter_master.py',
    'app/models/admin_adjustment_details.py',
    'app/models/admin_adjustments_log.py',
    'alembic/versions/f3a7b1e8c2d9_add_dri_deletion_fields.py',
]
for f in files:
    py_compile.compile(f, doraise=True)
print('All files OK')
"
```

- [ ] **Step 2: Frontend check**

```bash
cd D:/workspace/ssmspl/frontend
node_modules/.bin/tsc --noEmit 2>&1 | grep -v "Cannot find module\|TS2307\|moduleResolution\|TS2688" | head -20
```

- [ ] **Step 3: Summary commit (if anything pending)**

```bash
cd D:/workspace/ssmspl
git status
git log --oneline -10
```
