# Customer Portal Backend Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the missing critical backend features for the customer portal: profile management, password change/reset, booking PDF download, cancellation email, booking history filters, and frontend logout fix.

**Architecture:** Add new service functions and router endpoints following the existing layered pattern (Router -> Service -> Model). PDF generation uses `reportlab` (new dependency). Password reset uses a time-limited JWT token sent via email. All new portal endpoints require `get_current_portal_user` auth dependency.

**Tech Stack:** FastAPI, SQLAlchemy async, reportlab (PDF), aiosmtplib (email), python-jose (JWT for reset tokens), Pydantic schemas

---

## Task 1: Add `reportlab` dependency

**Files:**
- Modify: `backend/requirements.txt`

**Step 1: Add reportlab to requirements.txt**

Add this line to `backend/requirements.txt`:
```
reportlab==4.2.5
```

**Step 2: Install**

Run: `cd backend && pip install reportlab==4.2.5`

**Step 3: Commit**

```bash
git add backend/requirements.txt
git commit -m "chore: add reportlab dependency for PDF generation"
```

---

## Task 2: Portal profile schemas

**Files:**
- Modify: `backend/app/schemas/portal_user.py`

**Step 1: Add update profile and change password schemas**

Add these to the end of `backend/app/schemas/portal_user.py`:

```python
class PortalUserUpdate(BaseModel):
    first_name: str | None = Field(None, max_length=60, description="New first name")
    last_name: str | None = Field(None, max_length=60, description="New last name")
    mobile: str | None = Field(None, max_length=60, description="New mobile number")


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password (min 8 characters)")


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., description="Registered email address")


class ResetPasswordRequest(BaseModel):
    token: str = Field(..., description="Password reset token from email")
    new_password: str = Field(..., min_length=8, description="New password (min 8 characters)")
```

**Step 2: Commit**

```bash
git add backend/app/schemas/portal_user.py
git commit -m "feat: add portal user profile and password schemas"
```

---

## Task 3: Profile management service functions

**Files:**
- Modify: `backend/app/services/portal_auth_service.py`

**Step 1: Add update_profile function**

Add to the end of `backend/app/services/portal_auth_service.py`:

```python
async def update_profile(
    db: AsyncSession, portal_user_id: int, first_name: str | None, last_name: str | None, mobile: str | None
) -> PortalUser:
    result = await db.execute(select(PortalUser).where(PortalUser.id == portal_user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if first_name is not None:
        user.first_name = first_name
    if last_name is not None:
        user.last_name = last_name
    if mobile is not None:
        user.mobile = mobile

    await db.commit()
    await db.refresh(user)
    return user
```

**Step 2: Add change_password function**

```python
async def change_password(db: AsyncSession, portal_user_id: int, current_password: str, new_password: str) -> None:
    result = await db.execute(select(PortalUser).where(PortalUser.id == portal_user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not verify_password(current_password, user.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    user.password = get_password_hash(new_password)
    await db.commit()
```

**Step 3: Commit**

```bash
git add backend/app/services/portal_auth_service.py
git commit -m "feat: add profile update and change password service"
```

---

## Task 4: Forgot / reset password service functions

**Files:**
- Modify: `backend/app/services/portal_auth_service.py`
- Modify: `backend/app/services/email_service.py`

**Step 1: Add forgot_password and reset_password to portal_auth_service.py**

Add import at top: `from app.core.security import create_access_token` (already imported).

Add new function using `create_access_token` to generate a short-lived reset token:

```python
from app.core.security import create_access_token, decode_token, get_password_hash, verify_password


async def forgot_password(db: AsyncSession, email: str) -> str | None:
    """Generate a password-reset token. Returns the token or None if email not found (silent fail for security)."""
    result = await db.execute(select(PortalUser).where(PortalUser.email == email))
    user = result.scalar_one_or_none()
    if not user:
        return None  # Don't reveal whether email exists

    # Create a short-lived token (30 min) with type=reset
    from datetime import datetime, timedelta, timezone as tz
    from jose import jwt
    from app.config import settings
    expire = datetime.now(tz.utc) + timedelta(minutes=30)
    payload = {"sub": str(user.id), "exp": expire, "type": "password_reset"}
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    return token


async def reset_password(db: AsyncSession, token: str, new_password: str) -> None:
    from jose import JWTError
    try:
        payload = decode_token(token)
        if payload.get("type") != "password_reset":
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid reset token")
        user_id = payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired reset token")

    result = await db.execute(select(PortalUser).where(PortalUser.id == int(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.password = get_password_hash(new_password)
    await db.commit()
```

**Step 2: Add password reset email template to email_service.py**

Add this function to `backend/app/services/email_service.py`:

```python
def _build_password_reset_html(reset_link: str) -> str:
    return f"""
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
        <div style="background:#0284c7;color:white;padding:24px;text-align:center;">
            <h1 style="margin:0;font-size:24px;">Password Reset</h1>
            <p style="margin:8px 0 0;opacity:0.9;">SSMSPL Ferry Services</p>
        </div>
        <div style="padding:24px;background:#ffffff;">
            <p>You requested a password reset. Click the link below to set a new password:</p>
            <div style="margin:24px 0;text-align:center;">
                <a href="{reset_link}" style="display:inline-block;padding:12px 32px;background:#0284c7;color:white;text-decoration:none;border-radius:8px;font-weight:bold;">
                    Reset Password
                </a>
            </div>
            <p style="color:#666;font-size:14px;">This link expires in 30 minutes. If you did not request this, please ignore this email.</p>
        </div>
        <div style="padding:16px;background:#f8fafc;text-align:center;color:#999;font-size:12px;">
            Suvarnadurga Shipping &amp; Marine Services Pvt. Ltd.
        </div>
    </div>
    """


async def send_password_reset_email(to_email: str, reset_link: str) -> None:
    """Send password reset email. Fire-and-forget, logs errors."""
    if not settings.SMTP_HOST:
        logger.info("SMTP not configured, skipping password reset email")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "Password Reset - SSMSPL Ferry Services"
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = to_email

        html = _build_password_reset_html(reset_link)
        msg.attach(MIMEText(html, "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            use_tls=True,
        )
        logger.info(f"Password reset email sent to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send password reset email to {to_email}: {e}")
```

**Step 3: Add cancellation email to email_service.py**

```python
def _build_cancellation_html(booking: dict) -> str:
    return f"""
    <div style="max-width:600px;margin:0 auto;font-family:Arial,sans-serif;">
        <div style="background:#dc2626;color:white;padding:24px;text-align:center;">
            <h1 style="margin:0;font-size:24px;">Booking Cancelled</h1>
            <p style="margin:8px 0 0;opacity:0.9;">SSMSPL Ferry Services</p>
        </div>
        <div style="padding:24px;background:#ffffff;">
            <p>Dear Customer,</p>
            <p>Your ferry booking has been cancelled. Here are the details:</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0;">
                <tr>
                    <td style="padding:8px;color:#666;">Booking Ref</td>
                    <td style="padding:8px;font-weight:bold;">#{booking.get('booking_no', '')}</td>
                </tr>
                <tr>
                    <td style="padding:8px;color:#666;">Route</td>
                    <td style="padding:8px;font-weight:bold;">{booking.get('route_name', '')}</td>
                </tr>
                <tr>
                    <td style="padding:8px;color:#666;">Travel Date</td>
                    <td style="padding:8px;font-weight:bold;">{booking.get('travel_date', '')}</td>
                </tr>
            </table>
            <p style="color:#666;font-size:14px;">If you did not request this cancellation, please contact us immediately.</p>
        </div>
        <div style="padding:16px;background:#f8fafc;text-align:center;color:#999;font-size:12px;">
            Suvarnadurga Shipping &amp; Marine Services Pvt. Ltd.
        </div>
    </div>
    """


async def send_cancellation_email(booking: dict, to_email: str) -> None:
    """Send booking cancellation email. Fire-and-forget, logs errors."""
    if not settings.SMTP_HOST:
        logger.info("SMTP not configured, skipping cancellation email")
        return

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"Booking Cancelled - #{booking.get('booking_no', '')}"
        msg["From"] = settings.SMTP_FROM_EMAIL
        msg["To"] = to_email

        html = _build_cancellation_html(booking)
        msg.attach(MIMEText(html, "html"))

        await aiosmtplib.send(
            msg,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASSWORD,
            use_tls=True,
        )
        logger.info(f"Cancellation email sent to {to_email}")
    except Exception as e:
        logger.error(f"Failed to send cancellation email to {to_email}: {e}")
```

**Step 4: Commit**

```bash
git add backend/app/services/portal_auth_service.py backend/app/services/email_service.py
git commit -m "feat: add forgot/reset password service and email templates"
```

---

## Task 5: Booking PDF service

**Files:**
- Create: `backend/app/services/pdf_service.py`

**Step 1: Create PDF service**

Create `backend/app/services/pdf_service.py` that generates a booking receipt/ticket PDF using reportlab:

```python
import io
import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle


def generate_booking_pdf(booking: dict) -> bytes:
    """Generate a PDF receipt for a booking. Returns raw PDF bytes."""
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=20*mm, bottomMargin=20*mm,
                            leftMargin=20*mm, rightMargin=20*mm)

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("Title2", parent=styles["Title"], fontSize=18, spaceAfter=6)
    subtitle_style = ParagraphStyle("Sub", parent=styles["Normal"], fontSize=10, textColor=colors.grey)
    heading_style = ParagraphStyle("H", parent=styles["Heading2"], fontSize=13, spaceAfter=6)

    elements = []

    # Header
    elements.append(Paragraph("SSMSPL Ferry Services", title_style))
    elements.append(Paragraph("Suvarnadurga Shipping & Marine Services Pvt. Ltd.", subtitle_style))
    elements.append(Spacer(1, 8*mm))

    # Booking Info table
    booking_no = booking.get("booking_no", "")
    status = booking.get("status", "")
    route_name = booking.get("route_name", "")
    branch_name = booking.get("branch_name", "")
    travel_date = booking.get("travel_date", "")
    departure = booking.get("departure", "")
    created_at = booking.get("created_at", "")

    info_data = [
        ["Booking Ref", f"#{booking_no}", "Status", status.upper()],
        ["Route", route_name, "Branch", branch_name or ""],
        ["Travel Date", str(travel_date), "Departure", departure or ""],
        ["Booked On", str(created_at)[:10] if created_at else "", "", ""],
    ]
    info_table = Table(info_data, colWidths=[80, 150, 80, 150])
    info_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
        ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.grey),
        ("TEXTCOLOR", (2, 0), (2, -1), colors.grey),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(info_table)
    elements.append(Spacer(1, 6*mm))

    # Items table
    elements.append(Paragraph("Items", heading_style))
    items = booking.get("items") or []
    items_header = ["Item", "Qty", "Rate", "Levy", "Amount"]
    items_data = [items_header]
    for item in items:
        rate = item.get("rate", 0)
        levy = item.get("levy", 0)
        qty = item.get("quantity", 0)
        amount = item.get("amount", qty * (rate + levy))
        vehicle = f" ({item.get('vehicle_no')})" if item.get("vehicle_no") else ""
        items_data.append([
            f"{item.get('item_name', 'Item')}{vehicle}",
            str(qty),
            f"{rate:.2f}",
            f"{levy:.2f}",
            f"{amount:.2f}",
        ])

    items_table = Table(items_data, colWidths=[180, 40, 70, 70, 80])
    items_table.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTNAME", (0, 1), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("BACKGROUND", (0, 0), (-1, 0), colors.Color(0.95, 0.97, 1.0)),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.lightgrey),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
    ]))
    elements.append(items_table)
    elements.append(Spacer(1, 4*mm))

    # Totals
    amount = booking.get("amount", 0)
    discount = booking.get("discount", 0)
    net_amount = booking.get("net_amount", 0)

    totals_data = []
    if discount:
        totals_data.append(["", "", "", "Subtotal", f"{amount:.2f}"])
        totals_data.append(["", "", "", "Discount", f"-{discount:.2f}"])
    totals_data.append(["", "", "", "Total", f"\u20b9 {net_amount:.2f}"])

    totals_table = Table(totals_data, colWidths=[180, 40, 70, 70, 80])
    totals_table.setStyle(TableStyle([
        ("FONTNAME", (3, -1), (4, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("ALIGN", (3, 0), (-1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("LINEABOVE", (3, -1), (4, -1), 1, colors.black),
    ]))
    elements.append(totals_table)
    elements.append(Spacer(1, 8*mm))

    # Footer
    elements.append(Paragraph("Please show your QR code at the jetty for boarding.", subtitle_style))
    elements.append(Paragraph(f"Generated on {datetime.date.today()}", subtitle_style))

    doc.build(elements)
    buffer.seek(0)
    return buffer.getvalue()
```

**Step 2: Commit**

```bash
git add backend/app/services/pdf_service.py
git commit -m "feat: add booking PDF generation service"
```

---

## Task 6: Add booking list filters to booking_service.py

**Files:**
- Modify: `backend/app/services/booking_service.py`

**Step 1: Add filter parameters to get_user_bookings**

Update the `get_user_bookings` function signature and query in `backend/app/services/booking_service.py`:

Change the function signature to:
```python
async def get_user_bookings(
    db: AsyncSession,
    portal_user_id: int,
    page: int = 1,
    page_size: int = 10,
    status_filter: str | None = None,
    date_from: datetime.date | None = None,
    date_to: datetime.date | None = None,
) -> dict:
```

Update both the count query and the fetch query to apply filters. Add these filter conditions after the `portal_user_id` where clause:

```python
    # Build base filter conditions
    conditions = [Booking.portal_user_id == portal_user_id]
    if status_filter:
        conditions.append(Booking.status == status_filter.upper())
    if date_from:
        conditions.append(Booking.travel_date >= date_from)
    if date_to:
        conditions.append(Booking.travel_date <= date_to)

    # Count total
    count_result = await db.execute(
        select(func.count()).select_from(Booking).where(*conditions)
    )
    total = count_result.scalar() or 0
    total_pages = math.ceil(total / page_size) if total > 0 else 1

    # Fetch page
    offset = (page - 1) * page_size
    result = await db.execute(
        select(Booking)
        .where(*conditions)
        .order_by(Booking.id.desc())
        .offset(offset)
        .limit(page_size)
    )
```

**Step 2: Commit**

```bash
git add backend/app/services/booking_service.py
git commit -m "feat: add status and date filters to booking history"
```

---

## Task 7: Portal auth router — profile, password, reset endpoints

**Files:**
- Modify: `backend/app/routers/portal_auth.py`

**Step 1: Add profile update endpoint**

Add new imports and endpoints to `backend/app/routers/portal_auth.py`:

New import:
```python
from app.schemas.portal_user import (
    PortalUserLogin, PortalUserRegister, PortalUserRead, PortalUserMeResponse,
    PortalUserUpdate, ChangePasswordRequest, ForgotPasswordRequest, ResetPasswordRequest,
)
```

New endpoints:

```python
@router.put(
    "/profile",
    response_model=PortalUserMeResponse,
    summary="Update portal user profile",
    description="Update the authenticated customer's profile (name, mobile).",
)
async def update_profile(
    body: PortalUserUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    user = await portal_auth_service.update_profile(
        db, current_user.id, body.first_name, body.last_name, body.mobile
    )
    return PortalUserMeResponse(
        id=user.id,
        first_name=user.first_name,
        last_name=user.last_name,
        email=user.email,
        mobile=user.mobile,
        created_at=user.created_at,
        full_name=f"{user.first_name} {user.last_name}",
    )


@router.post(
    "/change-password",
    summary="Change password",
    description="Change the authenticated customer's password.",
    responses={
        200: {"description": "Password changed successfully"},
        400: {"description": "Current password is incorrect"},
    },
)
async def change_password(
    body: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    await portal_auth_service.change_password(db, current_user.id, body.current_password, body.new_password)
    return {"message": "Password changed successfully"}


@router.post(
    "/forgot-password",
    summary="Request password reset",
    description="Send a password reset link to the registered email. Always returns 200 to prevent email enumeration.",
)
async def forgot_password(
    body: ForgotPasswordRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    token = await portal_auth_service.forgot_password(db, body.email)
    if token:
        # Build reset link. Frontend will have a /customer/reset-password?token=X page.
        reset_link = f"{settings.ALLOWED_ORIGINS.split(',')[0].strip()}/customer/reset-password?token={token}"
        from app.services.email_service import send_password_reset_email
        background_tasks.add_task(send_password_reset_email, body.email, reset_link)
    return {"message": "If this email is registered, a reset link has been sent"}


@router.post(
    "/reset-password",
    summary="Reset password with token",
    description="Set a new password using the token from the reset email.",
    responses={
        200: {"description": "Password reset successfully"},
        400: {"description": "Invalid or expired token"},
    },
)
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    await portal_auth_service.reset_password(db, body.token, body.new_password)
    return {"message": "Password reset successfully"}
```

Note: Add these imports at the top:
```python
from fastapi import APIRouter, BackgroundTasks, Depends, status
from app.config import settings
```

**Step 2: Commit**

```bash
git add backend/app/routers/portal_auth.py
git commit -m "feat: add profile, change-password, forgot/reset-password endpoints"
```

---

## Task 8: Portal bookings router — PDF download + cancellation email + filters

**Files:**
- Modify: `backend/app/routers/portal_bookings.py`

**Step 1: Add PDF download endpoint**

Add import:
```python
from app.services.pdf_service import generate_booking_pdf
```

Add endpoint after the QR endpoint:

```python
@router.get(
    "/{booking_id}/download",
    summary="Download booking as PDF",
    description="Returns a PDF receipt/ticket for the booking.",
    responses={200: {"content": {"application/pdf": {}}}},
)
async def download_booking_pdf(
    booking_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    booking = await booking_service.get_booking_by_id(db, booking_id, current_user.id)
    pdf_bytes = generate_booking_pdf(booking)
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=booking-{booking['booking_no']}.pdf"},
    )
```

**Step 2: Send cancellation email on cancel**

Update `cancel_booking` endpoint to send cancellation email:

Add import:
```python
from app.services.email_service import send_booking_confirmation, send_cancellation_email
```

Update the cancel endpoint to accept `BackgroundTasks` and fire email:

```python
@router.post(
    "/{booking_id}/cancel",
    response_model=BookingRead,
    summary="Cancel a booking",
    description="Cancel a confirmed booking. Only the booking owner can cancel.",
)
async def cancel_booking(
    booking_id: int,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    result = await booking_service.cancel_booking(db, booking_id, current_user.id)
    background_tasks.add_task(send_cancellation_email, result, current_user.email)
    return result
```

**Step 3: Add filter query params to list_bookings**

Update the list_bookings endpoint signature:

```python
import datetime

@router.get(
    "",
    response_model=BookingListResponse,
    summary="List bookings for current user",
    description="Returns paginated bookings with optional status and date filters.",
)
async def list_bookings(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(10, ge=1, le=50, description="Items per page"),
    status: str | None = Query(None, description="Filter by status (CONFIRMED, CANCELLED, PENDING)"),
    date_from: datetime.date | None = Query(None, description="Filter: travel date from"),
    date_to: datetime.date | None = Query(None, description="Filter: travel date to"),
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    return await booking_service.get_user_bookings(
        db, current_user.id, page, page_size,
        status_filter=status, date_from=date_from, date_to=date_to,
    )
```

**Step 4: Commit**

```bash
git add backend/app/routers/portal_bookings.py
git commit -m "feat: add PDF download, cancellation email, and booking filters"
```

---

## Task 9: Frontend logout fix — send refresh token to backend

**Files:**
- Modify: `frontend/src/components/customer/CustomerLayout.tsx`

**Step 1: Update handleLogout to call backend**

Find the `handleLogout` function in `CustomerLayout.tsx` and update it to POST the refresh token before clearing cookies:

```typescript
const handleLogout = async () => {
    try {
      const refreshToken = getPortalRefreshToken();
      if (refreshToken) {
        await api.post("/api/portal/auth/logout", { refresh_token: refreshToken });
      }
    } catch {
      // Ignore errors — proceed with local cleanup
    }
    clearPortalTokens();
    router.push("/customer/login");
  };
```

Add import at top:
```typescript
import { getPortalRefreshToken } from "@/lib/portalAuth";
```

**Step 2: Update admin logout too**

Find the admin `Navbar.tsx` and apply the same pattern for admin logout. Add import for `getRefreshToken` from `@/lib/auth` and call `POST /api/auth/logout` with the token.

**Step 3: Commit**

```bash
git add frontend/src/components/customer/CustomerLayout.tsx frontend/src/components/Navbar.tsx
git commit -m "fix: send refresh token to backend on logout"
```

---

## Task 10: Frontend download button — use PDF endpoint

**Files:**
- Modify: `frontend/src/app/customer/history/[id]/page.tsx`

**Step 1: Update the Download Ticket button**

In the booking detail page, change the Download button from `window.print()` to calling the backend PDF endpoint:

```tsx
<button
  onClick={async () => {
    try {
      const res = await api.get(`/api/portal/bookings/${bookingId}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `booking-${booking.booking_no}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download ticket. Please try again.");
    }
  }}
  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200 transition-colors"
>
  <Download className="w-5 h-5" />
  <span>Download Ticket</span>
</button>
```

**Step 2: Update download button on history list page too**

In `frontend/src/app/customer/history/page.tsx`, update the Download button in the booking card to download PDF instead of navigating:

```tsx
<button
  onClick={async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const res = await api.get(
        `/api/portal/bookings/${booking.id}/download`,
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `booking-${booking.booking_no}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert("Failed to download ticket. Please try again.");
    }
  }}
  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-50 text-slate-700 font-medium hover:bg-slate-100 transition-colors"
>
  <Download className="w-4 h-4" />
  <span>Download</span>
</button>
```

**Step 3: Commit**

```bash
git add frontend/src/app/customer/history/[id]/page.tsx frontend/src/app/customer/history/page.tsx
git commit -m "feat: download booking as PDF from backend endpoint"
```

---

## Task 11: Register new endpoints in main.py openapi_tags (if needed) and verify

**Files:**
- No new files — verification only

**Step 1: Verify app loads**

Run: `cd backend && python -c "from app.main import app; print(f'Routes: {len(app.routes)}')""`

Expected: More routes than before (was 86).

**Step 2: List new portal endpoints**

Run:
```python
cd backend && python -c "
from app.main import app
for r in app.routes:
    if hasattr(r, 'path') and 'portal' in r.path:
        methods = ','.join(r.methods) if hasattr(r, 'methods') else ''
        print(f'{methods:8} {r.path}')
"
```

Expected new endpoints:
- `PUT /api/portal/auth/profile`
- `POST /api/portal/auth/change-password`
- `POST /api/portal/auth/forgot-password`
- `POST /api/portal/auth/reset-password`
- `GET /api/portal/bookings/{booking_id}/download`

**Step 3: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors

**Step 4: Final commit**

If any adjustments were needed:
```bash
git add -A
git commit -m "feat: complete customer portal backend - profile, passwords, PDF, emails, filters"
```

---

## Summary of Changes

### New files (1)
- `backend/app/services/pdf_service.py` — PDF receipt generation using reportlab

### Modified backend files (5)
- `backend/requirements.txt` — add `reportlab`
- `backend/app/schemas/portal_user.py` — add 4 new schemas
- `backend/app/services/portal_auth_service.py` — add profile update, change/forgot/reset password
- `backend/app/services/email_service.py` — add password reset + cancellation email templates
- `backend/app/services/booking_service.py` — add status/date filters to history query
- `backend/app/routers/portal_auth.py` — add 4 new endpoints
- `backend/app/routers/portal_bookings.py` — add PDF download, cancellation email, filter params

### Modified frontend files (4)
- `frontend/src/components/customer/CustomerLayout.tsx` — logout sends refresh token
- `frontend/src/components/Navbar.tsx` — admin logout sends refresh token
- `frontend/src/app/customer/history/[id]/page.tsx` — download calls PDF endpoint
- `frontend/src/app/customer/history/page.tsx` — download calls PDF endpoint

### New endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| PUT | `/api/portal/auth/profile` | Update profile (name, mobile) |
| POST | `/api/portal/auth/change-password` | Change password |
| POST | `/api/portal/auth/forgot-password` | Request password reset email |
| POST | `/api/portal/auth/reset-password` | Reset password with token |
| GET | `/api/portal/bookings/{id}/download` | Download booking as PDF |

### Enhanced endpoints
| Endpoint | Enhancement |
|----------|-------------|
| `GET /api/portal/bookings` | Added `status`, `date_from`, `date_to` query filters |
| `POST /api/portal/bookings/{id}/cancel` | Now sends cancellation email |
