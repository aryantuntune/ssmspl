"""
Background task: auto-cancel PENDING bookings older than the expiry window.
Runs every 5 minutes via asyncio loop started at app startup.

Race-safety: a booking may have an in-flight Airpay payment that takes a few
minutes on the gateway UI. We skip any PENDING booking that has an INITIATED
PaymentTransaction created within PAYMENT_GRACE_MINUTES, so we don't cancel a
booking the user is mid-pay on. The grace must be >= portal_payment's
PAYMENT_EXPIRY_MINUTES so we don't race the callback handler.
"""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.models.booking import Booking
from app.models.booking_item import BookingItem
from app.models.payment_transaction import PaymentTransaction

logger = logging.getLogger("ssmspl.booking_expiry")

# Cancel PENDING bookings older than this. Set generous enough to give users
# time to pay on Airpay (which itself shows a 30-min countdown). Must exceed
# the payment-flow window in portal_payment.PAYMENT_EXPIRY_MINUTES.
EXPIRY_MINUTES = 45
# A PENDING booking with an INITIATED payment_transaction newer than this is
# considered "in flight" and is not cancelled.
PAYMENT_GRACE_MINUTES = 35
CHECK_INTERVAL_SECONDS = 300  # 5 minutes


async def cancel_expired_bookings() -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=EXPIRY_MINUTES)
    payment_grace = datetime.now(timezone.utc) - timedelta(minutes=PAYMENT_GRACE_MINUTES)
    async with AsyncSessionLocal() as db:
        try:
            # Lock candidate rows so the payment callback handler can't flip
            # status="CONFIRMED" between our SELECT and UPDATE.
            result = await db.execute(
                select(Booking)
                .where(
                    Booking.status == "PENDING",
                    Booking.created_at < cutoff,
                )
                .with_for_update(skip_locked=True)
            )
            stale = result.scalars().all()
            if not stale:
                return 0

            cancelled = 0
            for booking in stale:
                # Don't cancel if the user has a live payment attempt in flight.
                live_txn_result = await db.execute(
                    select(PaymentTransaction.id).where(
                        PaymentTransaction.booking_id == booking.id,
                        PaymentTransaction.status == "INITIATED",
                        PaymentTransaction.created_at >= payment_grace,
                    ).limit(1)
                )
                if live_txn_result.scalar_one_or_none():
                    logger.info(
                        "Skipping expiry of booking %s — live payment attempt in flight",
                        booking.id,
                    )
                    continue
                booking.status = "CANCELLED"
                booking.is_cancelled = True
                items_result = await db.execute(
                    select(BookingItem).where(BookingItem.booking_id == booking.id)
                )
                for item in items_result.scalars().all():
                    item.is_cancelled = True
                cancelled += 1
            await db.commit()
            if cancelled:
                logger.info("Auto-cancelled %d expired PENDING bookings", cancelled)
            return cancelled
        except Exception:
            await db.rollback()
            logger.exception("Error cancelling expired bookings")
            return 0


async def expiry_loop():
    while True:
        await cancel_expired_bookings()
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
