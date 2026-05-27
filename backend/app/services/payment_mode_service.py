from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_

from app.models.payment_mode import PaymentMode
from app.schemas.payment_mode import PaymentModeCreate, PaymentModeUpdate


async def get_payment_mode_by_id(db: AsyncSession, payment_mode_id: int) -> PaymentMode:
    result = await db.execute(select(PaymentMode).where(PaymentMode.id == payment_mode_id))
    payment_mode = result.scalar_one_or_none()
    if not payment_mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payment mode not found")
    return payment_mode


def _apply_filters(
    query,
    search: str | None = None,
    status: str | None = None,
    search_column: str = "all",
    match_type: str = "contains",
    id_filter: int | None = None,
    id_op: str = "eq",
    id_filter_end: int | None = None,
    show_at_pos: bool | None = None,
):
    if id_filter is not None:
        if id_op == "between" and id_filter_end is not None:
            query = query.where(PaymentMode.id >= id_filter, PaymentMode.id <= id_filter_end)
        elif id_op == "lt":
            query = query.where(PaymentMode.id < id_filter)
        elif id_op == "gt":
            query = query.where(PaymentMode.id > id_filter)
        else:
            query = query.where(PaymentMode.id == id_filter)

    if search:
        if match_type == "starts_with":
            pattern = f"{search}%"
        elif match_type == "ends_with":
            pattern = f"%{search}"
        else:
            pattern = f"%{search}%"

        if search_column == "description":
            query = query.where(PaymentMode.description.ilike(pattern))
        else:
            query = query.where(PaymentMode.description.ilike(pattern))

    if status == "active":
        query = query.where(PaymentMode.is_active == True)
    elif status == "inactive":
        query = query.where(PaymentMode.is_active == False)
    if show_at_pos is not None:
        query = query.where(PaymentMode.show_at_pos == show_at_pos)
    return query


async def count_payment_modes(
    db: AsyncSession, search: str | None = None, status: str | None = None,
    search_column: str = "all", match_type: str = "contains",
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
    show_at_pos: bool | None = None,
) -> int:
    query = select(func.count()).select_from(PaymentMode)
    query = _apply_filters(query, search, status, search_column, match_type, id_filter, id_op, id_filter_end, show_at_pos)
    result = await db.execute(query)
    return result.scalar()


SORTABLE_COLUMNS = {
    "id": PaymentMode.id,
    "description": PaymentMode.description,
    "is_active": PaymentMode.is_active,
}


async def get_all_payment_modes(
    db: AsyncSession, skip: int = 0, limit: int = 50, sort_by: str = "id", sort_order: str = "asc",
    search: str | None = None, status: str | None = None,
    search_column: str = "all", match_type: str = "contains",
    id_filter: int | None = None, id_op: str = "eq", id_filter_end: int | None = None,
    show_at_pos: bool | None = None,
) -> list[PaymentMode]:
    column = SORTABLE_COLUMNS.get(sort_by, PaymentMode.id)
    order = column.desc() if sort_order == "desc" else column.asc()
    query = select(PaymentMode)
    query = _apply_filters(query, search, status, search_column, match_type, id_filter, id_op, id_filter_end, show_at_pos)
    result = await db.execute(
        query.order_by(order).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


async def create_payment_mode(db: AsyncSession, payment_mode_in: PaymentModeCreate) -> PaymentMode:
    # POS gate integrity guard: prevent creating a second "Online" row, and prevent
    # creating any case-variant of "Online" with show_at_pos=True. The portal
    # looks up the Online payment mode by description (booking_service.py:489),
    # so a POS-visible alias would silently let cashiers tag tickets as portal
    # payments. See migration a3c5d8e91f02 and ticket_service.py:171.
    incoming_desc_norm = (payment_mode_in.description or "").strip().lower()
    if incoming_desc_norm == "online" and payment_mode_in.show_at_pos is True:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create an 'Online' payment mode with show_at_pos=True — Online is reserved for the customer-portal flow and must be hidden from POS.",
        )

    # Case-insensitive uniqueness on description (DB column is case-sensitive,
    # but "Online" vs "online" vs "ONLINE" must all collide for this gate to hold).
    existing = await db.execute(
        select(PaymentMode).where(func.lower(PaymentMode.description) == incoming_desc_norm)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Payment mode description already exists",
        )

    # Get next id
    result = await db.execute(select(func.coalesce(func.max(PaymentMode.id), 0)))
    next_id = result.scalar() + 1

    payment_mode = PaymentMode(
        id=next_id,
        description=payment_mode_in.description,
        is_active=True,
        show_at_pos=payment_mode_in.show_at_pos,
    )
    db.add(payment_mode)
    await db.commit()
    await db.refresh(payment_mode)
    return payment_mode


async def update_payment_mode(db: AsyncSession, payment_mode_id: int, payment_mode_in: PaymentModeUpdate) -> PaymentMode:
    payment_mode = await get_payment_mode_by_id(db, payment_mode_id)
    update_data = payment_mode_in.model_dump(exclude_unset=True)

    # POS gate integrity guard: "Online" is the reserved customer-portal / Airpay
    # payment mode (seed id=4, show_at_pos=False). It MUST remain hidden from POS;
    # otherwise cashiers could tag counter sales as portal payments, which
    # silently bypasses ticket_service._validate_references and update_ticket's
    # show_at_pos check. We also block renaming Online or any rename that would
    # collide with the reserved "Online" description on a different row.
    # See migration a3c5d8e91f02 and ticket_service.py:171.
    current_desc = (payment_mode.description or "").strip().lower()
    new_desc = update_data.get("description")
    new_desc_norm = new_desc.strip().lower() if isinstance(new_desc, str) else None

    if current_desc == "online":
        if "show_at_pos" in update_data and update_data["show_at_pos"] is True:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The 'Online' payment mode is reserved for the customer portal / Airpay flow and cannot be exposed at POS.",
            )
        if new_desc_norm is not None and new_desc_norm != "online":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The 'Online' payment mode cannot be renamed — it is referenced by the customer-portal payment flow.",
            )
        if "is_active" in update_data and update_data["is_active"] is False:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The 'Online' payment mode cannot be deactivated — it is required by the customer-portal payment flow.",
            )

    # Block renaming a different payment mode TO "Online" with show_at_pos=True,
    # which would otherwise create a second POS-visible 'Online'-aliased row that
    # bypasses the gate. (Uniqueness on description is also checked below.)
    if current_desc != "online" and new_desc_norm == "online":
        # Force the new row to inherit the hidden-from-POS contract.
        effective_show = update_data.get("show_at_pos", payment_mode.show_at_pos)
        if effective_show is True:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Renaming a payment mode to 'Online' requires show_at_pos=False (reserved for the customer portal).",
            )

    # Check uniqueness if description is being updated (case-insensitive — so
    # "Online" / "online" / "ONLINE" all collide and cannot be used to bypass
    # the reserved-name guard above).
    if "description" in update_data:
        existing = await db.execute(
            select(PaymentMode).where(
                func.lower(PaymentMode.description) == (update_data["description"] or "").strip().lower(),
                PaymentMode.id != payment_mode_id,
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Payment mode description already exists",
            )

    for field, value in update_data.items():
        setattr(payment_mode, field, value)
    await db.commit()
    await db.refresh(payment_mode)
    return payment_mode
