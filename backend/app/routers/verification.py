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
    summary="Look up booking by scanned QR payload",
    description="Accepts the full signed QR payload string, validates the HMAC signature, "
                "and returns booking details. Use this when scanning QR codes.",
    responses={
        400: {"description": "Invalid or tampered QR code"},
        404: {"description": "Booking not found"},
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
    return await verification_service.lookup_booking_by_code(db, code_uuid)


@router.post(
    "/check-in",
    response_model=CheckInResponse,
    summary="Check in a booking",
    description="Mark a booking as checked in using its QR verification code.",
    responses={
        404: {"description": "Booking not found"},
        400: {"description": "Booking is cancelled"},
        409: {"description": "Already checked in"},
    },
)
async def check_in(
    body: CheckInRequest,
    db: AsyncSession = Depends(get_db),
    _user: User = Depends(_verification_roles),
):
    return await verification_service.check_in_booking(db, body.verification_code)


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
