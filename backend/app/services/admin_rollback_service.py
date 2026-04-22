"""
Rollback service for admin adjustments.

Reverses a COMMITTED batch:
- DELETE operations: re-INSERT the deleted ticket_items (and parent ticket if hard-deleted) from backup
- TRANSFER_UPDATE operations: restore ticket_item original values from backup
- TRANSFER_INSERT operations: DELETE the ticket_items that were created
- MODIFY operations (legacy rate-reduction engine): restore ticket_item from backup

Safety:
- Only SUPER_ADMIN can invoke (enforced at router)
- Only COMMITTED batches can be rolled back
- Rejects if any affected ticket has been modified by a LATER committed batch
- Uses the same advisory lock as the commit path
- Transactional — all or nothing
"""
import hashlib
import uuid
from datetime import date, datetime, timezone
from decimal import Decimal
from sqlalchemy import delete, func, insert, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import HTTPException
from app.database import AsyncSessionLocal
from app.models.ticket import Ticket, TicketItem
from app.models.admin_adjustments_log import AdminAdjustmentsLog
from app.models.admin_adjustment_details import AdminAdjustmentDetails
from app.models.tickets_backup import TicketsBackup
from app.models.ticket_items_backup import TicketItemsBackup


def _date_lock_hash(date_start: date, date_end: date) -> int:
    raw = f"{date_start}{date_end}".encode()
    return int(hashlib.md5(raw).hexdigest(), 16) % (2**31 - 1)


async def list_adjustments(
    db: AsyncSession,
    branch_id: int | None = None,
    limit: int = 50,
) -> list[dict]:
    """Return recent adjustment log entries (for history UI)."""
    q = select(AdminAdjustmentsLog).order_by(AdminAdjustmentsLog.created_at.desc()).limit(limit)
    if branch_id:
        q = q.where(AdminAdjustmentsLog.branch_id == branch_id)
    rows = (await db.execute(q)).scalars().all()
    return [
        {
            "batch_id": str(r.id),
            "branch_id": r.branch_id,
            "date_range_start": str(r.date_range_start),
            "date_range_end": str(r.date_range_end),
            "adjustment_amount": float(r.adjustment_amount),
            "status": r.status,
            "plan_choice": r.plan_choice,
            "total_tickets_affected": r.total_tickets_affected,
            "total_items_affected": r.total_items_affected,
            "created_by": str(r.created_by) if r.created_by else None,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "executed_at": r.executed_at.isoformat() if r.executed_at else None,
            "rolled_back_at": r.rolled_back_at.isoformat() if r.rolled_back_at else None,
            "rolled_back_by": str(r.rolled_back_by) if r.rolled_back_by else None,
            "error_message": r.error_message,
            # Infer operation kind from plan_choice + details presence
            "operation_kind": _infer_kind(r),
        }
        for r in rows
    ]


def _infer_kind(log: AdminAdjustmentsLog) -> str:
    """Heuristic label for the UI."""
    if log.plan_choice == "transfer":
        return "TRANSFER"
    if log.plan_choice in ("recommended", "requested", "closest"):
        return "DELETE"
    return "UNKNOWN"


async def get_adjustment_detail(db: AsyncSession, batch_id: str) -> dict:
    """Full detail of a single adjustment (for rollback confirmation screen)."""
    result = await db.execute(select(AdminAdjustmentsLog).where(AdminAdjustmentsLog.id == batch_id))
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Adjustment not found")

    details_result = await db.execute(
        select(AdminAdjustmentDetails).where(AdminAdjustmentDetails.adjustment_id == batch_id)
    )
    details = details_result.scalars().all()

    return {
        "batch_id": str(log.id),
        "branch_id": log.branch_id,
        "date_range_start": str(log.date_range_start),
        "date_range_end": str(log.date_range_end),
        "adjustment_amount": float(log.adjustment_amount),
        "status": log.status,
        "plan_choice": log.plan_choice,
        "total_tickets_affected": log.total_tickets_affected,
        "total_items_affected": log.total_items_affected,
        "created_by": str(log.created_by) if log.created_by else None,
        "created_at": log.created_at.isoformat() if log.created_at else None,
        "executed_at": log.executed_at.isoformat() if log.executed_at else None,
        "rolled_back_at": log.rolled_back_at.isoformat() if log.rolled_back_at else None,
        "rolled_back_by": str(log.rolled_back_by) if log.rolled_back_by else None,
        "error_message": log.error_message,
        "operation_kind": _infer_kind(log),
        "details": [
            {
                "ticket_id": d.ticket_id,
                "ticket_item_id": d.ticket_item_id,
                "operation_type": d.operation_type,
                "old_rate": float(d.old_rate),
                "old_levy": float(d.old_levy),
                "new_rate": float(d.new_rate),
                "new_levy": float(d.new_levy),
                "total_delta": float(d.total_delta),
            }
            for d in details
        ],
    }


async def rollback(
    db: AsyncSession,
    batch_id: str,
    rolled_back_by: uuid.UUID,
) -> dict:
    """
    Reverse a COMMITTED adjustment. Destructive operation — SUPER_ADMIN only.
    Also accepts FAILED batches whose previous rollback attempt errored out
    (the transaction rolled back cleanly — data is at the committed baseline).
    """
    # Load log + verify state
    result = await db.execute(select(AdminAdjustmentsLog).where(AdminAdjustmentsLog.id == batch_id))
    log = result.scalar_one_or_none()
    if log is None:
        raise HTTPException(status_code=404, detail="Adjustment batch not found")
    if log.status not in ("COMMITTED", "FAILED"):
        raise HTTPException(
            status_code=400,
            detail=f"Only COMMITTED or FAILED batches can be rolled back (current: {log.status}).",
        )
    allowed_prev_status = log.status  # remember original status for CAS

    # Load audit details
    details_result = await db.execute(
        select(AdminAdjustmentDetails).where(AdminAdjustmentDetails.adjustment_id == batch_id)
    )
    details = list(details_result.scalars().all())
    if not details:
        raise HTTPException(status_code=400, detail="No audit details found for this batch — cannot roll back.")

    affected_ticket_ids = list({d.ticket_id for d in details})

    # Guard: any LATER committed batch that touched these tickets? Reject.
    later_q = (
        select(AdminAdjustmentsLog.id, AdminAdjustmentsLog.created_at)
        .join(AdminAdjustmentDetails, AdminAdjustmentDetails.adjustment_id == AdminAdjustmentsLog.id)
        .where(
            AdminAdjustmentsLog.created_at > log.created_at,
            AdminAdjustmentsLog.status == "COMMITTED",
            AdminAdjustmentDetails.ticket_id.in_(affected_ticket_ids),
        )
        .distinct()
        .limit(5)
    )
    later_rows = (await db.execute(later_q)).all()
    if later_rows:
        ids = [str(r[0]) for r in later_rows]
        raise HTTPException(
            status_code=409,
            detail=(
                f"Cannot rollback: {len(later_rows)} later COMMITTED batch(es) affect the same tickets "
                f"({', '.join(ids)}). Roll back the newer batches first."
            ),
        )

    # CAS allowed_prev_status -> IN_PROGRESS in a separate session (survives main tx rollback)
    async with AsyncSessionLocal() as log_session:
        async with log_session.begin():
            cas = await log_session.execute(
                update(AdminAdjustmentsLog)
                .where(AdminAdjustmentsLog.id == batch_id, AdminAdjustmentsLog.status == allowed_prev_status)
                .values(status="IN_PROGRESS", error_message=None)
            )
            if cas.rowcount == 0:
                raise HTTPException(
                    status_code=409,
                    detail="Batch status changed — cannot rollback. Refresh and retry.",
                )

    try:
        # Per-branch lock — matches transfer + deletion engines so all three serialize.
        await db.execute(
            text("SELECT pg_advisory_xact_lock(:a, :b)"),
            {"a": log.branch_id, "b": 0},
        )

        # Pre-load all backup rows for this batch
        ti_backup_result = await db.execute(
            select(TicketItemsBackup).where(TicketItemsBackup.adjustment_batch_id == batch_id)
        )
        ti_backups_by_tiid: dict[int, TicketItemsBackup] = {
            b.ticket_item_id: b for b in ti_backup_result.scalars().all()
        }

        t_backup_result = await db.execute(
            select(TicketsBackup).where(TicketsBackup.adjustment_batch_id == batch_id)
        )
        t_backups_by_ticket_id: dict[int, TicketsBackup] = {
            b.ticket_id: b for b in t_backup_result.scalars().all()
        }

        # Phase 1: re-INSERT hard-deleted tickets (for those where no current ticket exists)
        current_tickets = await db.execute(
            select(Ticket.id).where(Ticket.id.in_(list(t_backups_by_ticket_id.keys())))
        )
        existing_ids = {row[0] for row in current_tickets.all()}
        for tid, tbackup in t_backups_by_ticket_id.items():
            if tid in existing_ids:
                continue
            od = tbackup.original_data

            # Validate required fields exist in the backup. Early backups
            # (pre-2026-04-22) did not capture route_id/payment_mode_id/ticket_no.
            # Those batches cannot be auto-restored; admin must manually populate
            # the missing fields in tickets_backup.original_data or restore from
            # the replicated ssmspl_sync database.
            required = ("route_id", "payment_mode_id", "ticket_no")
            missing = [k for k in required if od.get(k) is None]
            if missing:
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Ticket {tid} backup is missing required fields {missing}. "
                        "This batch was created before the backup format was fixed. "
                        "Manually populate the missing fields in tickets_backup "
                        "(source of truth: ssmspl_sync.tickets) then retry."
                    ),
                )

            # Coerce JSONB-stored strings back into proper Python types for asyncpg.
            ticket_date_raw = od.get("ticket_date")
            ticket_date_val = (
                date.fromisoformat(ticket_date_raw)
                if isinstance(ticket_date_raw, str)
                else ticket_date_raw
            )
            amount_val = float(od["amount"]) if od.get("amount") is not None else 0.0
            discount_val = float(od["discount"]) if od.get("discount") is not None else None
            net_amount_val = float(od["net_amount"]) if od.get("net_amount") is not None else 0.0

            await db.execute(
                text("""
                    INSERT INTO tickets (id, branch_id, ticket_no, ticket_date, route_id,
                                          amount, discount, payment_mode_id, is_cancelled,
                                          net_amount, status, is_multi_ticket, boat_id,
                                          ref_no, created_by, updated_by, created_at, updated_at)
                    VALUES (:id, :branch_id, :ticket_no, :ticket_date, :route_id,
                            :amount, :discount, :payment_mode_id, :is_cancelled,
                            :net_amount, :status, :is_multi_ticket, :boat_id,
                            :ref_no, NULL, NULL, NOW(), NOW())
                    ON CONFLICT (id) DO NOTHING
                """),
                {
                    "id": int(tid),
                    "branch_id": int(od["branch_id"]),
                    "ticket_no": int(od["ticket_no"]),
                    "ticket_date": ticket_date_val,
                    "route_id": int(od["route_id"]),
                    "amount": amount_val,
                    "discount": discount_val,
                    "payment_mode_id": int(od["payment_mode_id"]),
                    "is_cancelled": bool(od.get("is_cancelled", False)),
                    "net_amount": net_amount_val,
                    "status": od.get("status") or "CONFIRMED",
                    "is_multi_ticket": bool(od.get("is_multi_ticket", False)),
                    "boat_id": od.get("boat_id"),
                    "ref_no": od.get("ref_no"),
                },
            )

        # Phase 2: process each audit detail in reverse
        for d in reversed(details):
            op_type = d.operation_type

            if op_type == "TRANSFER_INSERT":
                # Item was INSERTed during the transfer — delete it
                await db.execute(
                    delete(TicketItem).where(TicketItem.id == d.ticket_item_id)
                )

            elif op_type in ("DELETE", "TRANSFER_UPDATE", "MODIFY"):
                # Restore the original ticket_item values from backup
                backup = ti_backups_by_tiid.get(d.ticket_item_id)
                if backup is None:
                    # No backup? Nothing we can do for this row — log but continue.
                    continue
                od = backup.original_data

                # Check if the row still exists
                existing = await db.execute(
                    select(TicketItem).where(TicketItem.id == d.ticket_item_id)
                )
                existing_row = existing.scalar_one_or_none()

                if existing_row is None:
                    # Row was deleted — re-INSERT it
                    await db.execute(
                        text("""
                            INSERT INTO ticket_items (id, ticket_id, item_id, rate, levy,
                                                      quantity, is_cancelled, vehicle_no,
                                                      vehicle_name, created_at, updated_at)
                            VALUES (:id, :ticket_id, :item_id, :rate, :levy, :quantity,
                                    :is_cancelled, :vehicle_no, :vehicle_name, NOW(), NOW())
                            ON CONFLICT (id) DO NOTHING
                        """),
                        {
                            "id": int(od["id"]),
                            "ticket_id": int(od["ticket_id"]),
                            "item_id": int(od["item_id"]),
                            "rate": float(od["rate"]),
                            "levy": float(od["levy"]),
                            "quantity": int(od["quantity"]),
                            "is_cancelled": bool(od.get("is_cancelled", False)),
                            "vehicle_no": od.get("vehicle_no"),
                            "vehicle_name": od.get("vehicle_name"),
                        },
                    )
                else:
                    # Row still exists — UPDATE back to original
                    await db.execute(
                        update(TicketItem)
                        .where(TicketItem.id == d.ticket_item_id)
                        .values(
                            item_id=int(od["item_id"]),
                            rate=float(od["rate"]),
                            levy=float(od["levy"]),
                            quantity=int(od["quantity"]),
                            vehicle_no=od.get("vehicle_no"),
                            vehicle_name=od.get("vehicle_name"),
                            is_cancelled=bool(od.get("is_cancelled", False)),
                        )
                    )

        # Phase 3: recalculate amount + net_amount for all affected tickets
        await db.execute(
            text("""
                UPDATE tickets
                SET
                    amount = (
                        SELECT COALESCE(SUM((ti.rate + ti.levy) * ti.quantity), 0)
                        FROM ticket_items ti
                        WHERE ti.ticket_id = tickets.id AND ti.is_cancelled = false
                    ),
                    net_amount = (
                        SELECT COALESCE(SUM((ti.rate + ti.levy) * ti.quantity), 0)
                        FROM ticket_items ti
                        WHERE ti.ticket_id = tickets.id AND ti.is_cancelled = false
                    ) - COALESCE(discount, 0)
                WHERE id = ANY(:ids)
            """),
            {"ids": affected_ticket_ids},
        )

        # Mark ROLLED_BACK
        log.status = "ROLLED_BACK"
        log.rolled_back_at = datetime.now(timezone.utc)
        log.rolled_back_by = rolled_back_by
        await db.flush()

    except HTTPException:
        # Restore status back to where it was so admin can retry
        async with AsyncSessionLocal() as log_session:
            async with log_session.begin():
                await log_session.execute(
                    update(AdminAdjustmentsLog)
                    .where(AdminAdjustmentsLog.id == batch_id)
                    .values(status=allowed_prev_status)
                )
        raise

    except Exception as exc:
        # Unexpected error — mark FAILED (log survives main-tx rollback via separate session)
        async with AsyncSessionLocal() as log_session:
            async with log_session.begin():
                await log_session.execute(
                    update(AdminAdjustmentsLog)
                    .where(AdminAdjustmentsLog.id == batch_id)
                    .values(status="FAILED", error_message=f"Rollback failed: {str(exc)[:1500]}")
                )
        raise

    return {
        "batch_id": str(log.id),
        "status": "ROLLED_BACK",
        "tickets_restored": len(affected_ticket_ids),
        "items_restored": len([d for d in details if d.operation_type != "TRANSFER_INSERT"]),
        "items_deleted": len([d for d in details if d.operation_type == "TRANSFER_INSERT"]),
        "rolled_back_at": log.rolled_back_at.isoformat(),
    }
