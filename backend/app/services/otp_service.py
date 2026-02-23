import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.security import hash_token
from app.models.email_otp import EmailOtp

logger = logging.getLogger(__name__)

OTP_EXPIRY_MINUTES = 10
MAX_ATTEMPTS = 5


def generate_otp() -> str:
    """Generate a cryptographically secure 6-digit OTP."""
    return f"{secrets.randbelow(900000) + 100000}"


async def invalidate_existing_otps(db: AsyncSession, email: str, purpose: str) -> None:
    """Mark all existing unused OTPs for this email+purpose as used."""
    await db.execute(
        update(EmailOtp)
        .where(
            and_(
                EmailOtp.email == email,
                EmailOtp.purpose == purpose,
                EmailOtp.is_used == False,  # noqa: E712
            )
        )
        .values(is_used=True)
    )


async def create_otp(db: AsyncSession, email: str, purpose: str) -> str:
    """Invalidate old OTPs, create a new one, and return the raw OTP."""
    await invalidate_existing_otps(db, email, purpose)

    raw_otp = generate_otp()
    otp_record = EmailOtp(
        email=email,
        otp_hash=hash_token(raw_otp),
        purpose=purpose,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRY_MINUTES),
    )
    db.add(otp_record)
    await db.flush()

    logger.debug(f"OTP for {email} ({purpose}): {raw_otp}")
    return raw_otp


async def verify_otp(db: AsyncSession, email: str, purpose: str, raw_otp: str) -> None:
    """
    Verify an OTP. Raises HTTPException on failure with remaining attempts info.
    """
    result = await db.execute(
        select(EmailOtp).where(
            and_(
                EmailOtp.email == email,
                EmailOtp.purpose == purpose,
                EmailOtp.is_used == False,  # noqa: E712
            )
        ).order_by(EmailOtp.created_at.desc())
    )
    otp_record = result.scalar_one_or_none()

    if not otp_record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid OTP found. Please request a new one.",
        )

    # Check expiry
    if datetime.now(timezone.utc) > otp_record.expires_at:
        otp_record.is_used = True
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="OTP has expired. Please request a new one.",
        )

    # Check attempts
    if otp_record.attempts >= MAX_ATTEMPTS:
        otp_record.is_used = True
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many failed attempts. Please request a new OTP.",
        )

    # Verify hash
    if hash_token(raw_otp) != otp_record.otp_hash:
        otp_record.attempts += 1
        remaining = MAX_ATTEMPTS - otp_record.attempts
        await db.flush()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid OTP. {remaining} attempt(s) remaining.",
        )

    # Success — mark as used
    otp_record.is_used = True
    await db.flush()
