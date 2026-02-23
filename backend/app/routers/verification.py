import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_roles
from app.core.rbac import UserRole
from app.models.user import User
from app.schemas.verification import VerificationResult, CheckInRequest, CheckInResponse
from app.services import verification_service
from app.services.qr_service import verify_qr_payload

router = APIRouter(prefix="/api/verification", tags=["Ticket Verification"])

_verification_roles = require_roles(
    UserRole.TICKET_CHECKER, UserRole.MANAGER, UserRole.ADMIN, UserRole.SUPER_ADMIN
)


@router.get(
    "/booking",
    response_model=VerificationResult,
    summary="Look up booking by QR code",
    description="Look up a booking by its QR verification code (UUID).",
    responses={404: {"description": "Booking not found"}},
)
async def lookup_booking(
    code: uuid.UUID = Query(..., description="Booking verification code (UUID from QR)"),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_verification_roles),
):
    return await verification_service.lookup_booking_by_code(db, code)


@router.get(
    "/scan",
    response_model=VerificationResult,
    summary="Look up booking or ticket by scanned QR payload",
    description="Accepts the full signed QR payload string, validates the HMAC signature, "
                "and returns booking or ticket details. Use this when scanning QR codes.",
    responses={
        400: {"description": "Invalid or tampered QR code"},
        404: {"description": "Booking or ticket not found"},
    },
)
async def scan_qr(
    payload: str = Query(..., description="Full QR payload string (code.signature)"),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_verification_roles),
):
    code = verify_qr_payload(payload)
    if code is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or tampered QR code",
        )
    try:
        code_uuid = uuid.UUID(code)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code format",
        )
    return await verification_service.lookup_by_code(db, code_uuid)


@router.post(
    "/check-in",
    response_model=CheckInResponse,
    summary="Verify a booking or ticket",
    description="Mark a booking or ticket as VERIFIED using its QR verification code. "
                "Each QR code can only be verified once. "
                "Checkers can only verify tickets on their assigned route.",
    responses={
        400: {"description": "Cancelled or payment pending"},
        403: {"description": "Route mismatch - not assigned to this route"},
        404: {"description": "Booking or ticket not found"},
        409: {"description": "Already verified"},
    },
)
async def check_in(
    body: CheckInRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_verification_roles),
):
    return await verification_service.verify(db, body.verification_code, current_user)


@router.get(
    "/booking-number",
    response_model=VerificationResult,
    summary="Look up booking by booking number",
    description="Look up a portal booking by its booking number. Optionally filter by branch.",
    responses={404: {"description": "Booking not found"}},
)
async def lookup_booking_by_number(
    booking_no: int = Query(..., description="Booking number (e.g. 1, 2, 3...)"),
    branch_id: int | None = Query(None, description="Branch ID (optional)"),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_verification_roles),
):
    return await verification_service.lookup_booking_by_number(db, booking_no, branch_id)


@router.get(
    "/ticket",
    response_model=VerificationResult,
    summary="Look up operator ticket",
    description="Look up an operator ticket by ticket number and branch ID.",
    responses={404: {"description": "Ticket not found"}},
)
async def lookup_ticket(
    ticket_no: int = Query(..., description="Ticket number"),
    branch_id: int = Query(..., description="Branch ID"),
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_verification_roles),
):
    return await verification_service.lookup_ticket_by_number(db, ticket_no, branch_id)
