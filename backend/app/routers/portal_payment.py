import html as html_mod
import logging
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from typing import Literal
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_portal_user
from app.models.booking import Booking
from app.models.payment_transaction import PaymentTransaction
from app.models.portal_user import PortalUser
from app.services import ccavenue_service, booking_service
from app.services.email_service import send_booking_confirmation
from app.services.ccavenue_service import is_payment_successful

logger = logging.getLogger(__name__)

PAYMENT_EXPIRY_MINUTES = 30

router = APIRouter(prefix="/api/portal/payment", tags=["Portal Payment"])


# ── Request / Response schemas ───────────────────────────────────────────────


class CreateOrderRequest(BaseModel):
    booking_id: int = Field(..., description="Booking ID to pay for")
    platform: Literal["web", "mobile"] = Field("web", description="Platform: 'web' or 'mobile'")


class CreateOrderResponse(BaseModel):
    ccavenue_url: str
    enc_request: str
    access_code: str
    order_id: str
    simulated: bool = False


# ── Helpers ──────────────────────────────────────────────────────────────────


def _redirect_to_frontend(
    *, success: bool, booking_id: int | None = None, platform: str = "web", error: str = ""
) -> RedirectResponse:
    status_str = "success" if success else "failed"
    if platform == "mobile":
        url = f"ssmspl://payment-callback?status={status_str}"
    else:
        base = settings.FRONTEND_URL.rstrip("/")
        url = f"{base}/customer/payment/callback?status={status_str}"
    if booking_id:
        url += f"&booking_id={booking_id}"
    if error:
        url += f"&error={quote(error)}"
    return RedirectResponse(url=url, status_code=302)


# ── Endpoints ────────────────────────────────────────────────────────────────


def _simulation_allowed() -> bool:
    """Simulation is allowed when:
    - PAYMENT_SIMULATION=true (hard override — works even with CCAvenue configured), OR
    - CCAvenue is NOT configured AND DEBUG=true (dev convenience)
    """
    if settings.PAYMENT_SIMULATION:
        return True
    return not ccavenue_service.is_configured() and settings.DEBUG


@router.get("/config", summary="Get payment gateway config")
async def payment_config():
    sim = _simulation_allowed()
    return {
        "gateway": "ccavenue",
        "configured": ccavenue_service.is_configured(),
        "simulation": sim,
        "mode": "simulation" if sim else "live",
    }


@router.post(
    "/create-order",
    summary="Create a payment order",
    response_model=CreateOrderResponse,
)
async def create_order(
    body: CreateOrderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    is_configured = ccavenue_service.is_configured()
    use_simulation = _simulation_allowed()

    # Block if not configured AND simulation not allowed
    if not is_configured and not use_simulation:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment gateway is not configured",
        )

    booking_data = await booking_service.get_booking_by_id(
        db, body.booking_id, current_user.id
    )

    if booking_data["status"] != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Booking is not in PENDING status",
        )

    # Lock the booking row to prevent amount changes during payment flow (TOCTOU)
    await db.execute(
        select(Booking).where(Booking.id == body.booking_id).with_for_update()
    )

    # Check for an existing non-expired INITIATED transaction for this booking
    expiry_cutoff = datetime.now(timezone.utc) - timedelta(minutes=PAYMENT_EXPIRY_MINUTES)
    existing_result = await db.execute(
        select(PaymentTransaction).where(
            PaymentTransaction.booking_id == body.booking_id,
            PaymentTransaction.status == "INITIATED",
            PaymentTransaction.created_at >= expiry_cutoff,
        )
    )
    existing_txn = existing_result.scalar_one_or_none()

    if existing_txn:
        order_id = existing_txn.client_txn_id
        txn = existing_txn
    else:
        order_id = ccavenue_service.generate_order_id(body.booking_id)
        txn = PaymentTransaction(
            booking_id=body.booking_id,
            client_txn_id=order_id,
            amount=booking_data["net_amount"],
            status="INITIATED",
            platform=body.platform,
        )
        db.add(txn)
        await db.flush()

    # Simulation mode: PAYMENT_SIMULATION=true override, or CCAvenue not configured
    if use_simulation:
        backend_base = settings.BACKEND_URL.rstrip("/")
        simulate_url = f"{backend_base}/api/portal/payment/simulate/{order_id}"
        logger.info(
            "Payment order created (SIMULATED) — booking_id=%s order_id=%s",
            body.booking_id,
            order_id,
        )
        return {
            "ccavenue_url": simulate_url,
            "enc_request": "SIMULATED",
            "access_code": "SIMULATED",
            "order_id": order_id,
            "simulated": True,
        }

    # Real CCAvenue flow
    backend_base = settings.BACKEND_URL.rstrip("/")
    redirect_url = f"{backend_base}/api/portal/payment/callback"
    cancel_url = f"{backend_base}/api/portal/payment/callback"

    payer_name = f"{current_user.first_name} {current_user.last_name}".strip()
    result = ccavenue_service.build_payment_request(
        order_id=order_id,
        amount=float(booking_data["net_amount"]),
        billing_name=payer_name,
        billing_email=current_user.email,
        billing_tel=current_user.mobile,
        redirect_url=redirect_url,
        cancel_url=cancel_url,
        merchant_param1=body.platform,
    )

    logger.info(
        "Payment order created — booking_id=%s order_id=%s",
        body.booking_id,
        order_id,
    )

    return result


@router.get(
    "/initiate/{order_id}",
    include_in_schema=False,
)
async def initiate_checkout(
    order_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Serve auto-submitting HTML form for CCAvenue checkout (or redirect to
    simulation page when gateway is not configured).

    Used by the mobile app: after calling /create-order, the app opens this
    URL via Linking.openURL to POST the encrypted payment data to CCAvenue
    without needing a WebView or native SDK.
    """
    expiry_cutoff = datetime.now(timezone.utc) - timedelta(minutes=PAYMENT_EXPIRY_MINUTES)
    txn_result = await db.execute(
        select(PaymentTransaction).where(
            PaymentTransaction.client_txn_id == order_id,
            PaymentTransaction.status == "INITIATED",
            PaymentTransaction.created_at >= expiry_cutoff,
        )
    )
    txn = txn_result.scalar_one_or_none()
    if not txn:
        return HTMLResponse("<h1>Invalid or expired payment link</h1>", status_code=404)

    # Simulation mode — redirect to mock checkout page
    if _simulation_allowed():
        backend_base = settings.BACKEND_URL.rstrip("/")
        sim_url = f"{backend_base}/api/portal/payment/simulate/{order_id}"
        return RedirectResponse(url=sim_url, status_code=302)

    booking_result = await db.execute(
        select(Booking).where(Booking.id == txn.booking_id)
    )
    booking = booking_result.scalar_one_or_none()
    if not booking:
        return HTMLResponse("<h1>Booking not found</h1>", status_code=404)

    portal_user_result = await db.execute(
        select(PortalUser).where(PortalUser.id == booking.portal_user_id)
    )
    portal_user = portal_user_result.scalar_one_or_none()

    backend_base = settings.BACKEND_URL.rstrip("/")
    redirect_url = f"{backend_base}/api/portal/payment/callback"
    cancel_url = f"{backend_base}/api/portal/payment/callback"

    result = ccavenue_service.build_payment_request(
        order_id=order_id,
        amount=float(txn.amount),
        billing_name=(
            f"{portal_user.first_name} {portal_user.last_name}".strip()
            if portal_user
            else "Customer"
        ),
        billing_email=portal_user.email if portal_user else "",
        billing_tel=portal_user.mobile if portal_user else "",
        redirect_url=redirect_url,
        cancel_url=cancel_url,
        merchant_param1=txn.platform,
    )

    ccavenue_url = html_mod.escape(result["ccavenue_url"])
    enc_request = html_mod.escape(result["enc_request"])
    access_code = html_mod.escape(result["access_code"])

    html_content = (
        "<!DOCTYPE html>"
        "<html>"
        "<head><title>Redirecting to payment...</title>"
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        "<style>body{display:flex;align-items:center;justify-content:center;"
        "min-height:100vh;margin:0;font-family:sans-serif;background:#f5f5f5}"
        "p{font-size:18px;color:#333}</style>"
        "</head>"
        '<body onload="document.getElementById(\'pf\').submit()">'
        "<p>Redirecting to payment gateway&#8230;</p>"
        f'<form id="pf" method="POST" action="{ccavenue_url}">'
        f'<input type="hidden" name="encRequest" value="{enc_request}">'
        f'<input type="hidden" name="access_code" value="{access_code}">'
        "</form>"
        "</body>"
        "</html>"
    )
    return HTMLResponse(html_content)


@router.get(
    "/simulate/{order_id}",
    include_in_schema=False,
)
async def simulate_checkout(
    order_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Mock CCAvenue checkout page for testing when credentials aren't available.

    Only works when DEBUG=true. Shows booking details with Pay / Cancel buttons.
    """
    if not _simulation_allowed():
        return HTMLResponse("<h1>Not available — simulation mode is off</h1>", status_code=403)

    expiry_cutoff = datetime.now(timezone.utc) - timedelta(minutes=PAYMENT_EXPIRY_MINUTES)
    txn_result = await db.execute(
        select(PaymentTransaction).where(
            PaymentTransaction.client_txn_id == order_id,
            PaymentTransaction.status == "INITIATED",
            PaymentTransaction.created_at >= expiry_cutoff,
        )
    )
    txn = txn_result.scalar_one_or_none()
    if not txn:
        return HTMLResponse("<h1>Invalid or expired payment link</h1>", status_code=404)

    booking_result = await db.execute(
        select(Booking).where(Booking.id == txn.booking_id)
    )
    booking = booking_result.scalar_one_or_none()

    portal_user_result = await db.execute(
        select(PortalUser).where(PortalUser.id == booking.portal_user_id)
    ) if booking else None
    portal_user = portal_user_result.scalar_one_or_none() if portal_user_result else None

    payer_name = html_mod.escape(
        f"{portal_user.first_name} {portal_user.last_name}".strip()
        if portal_user else "Customer"
    )
    amount = f"{txn.amount:.2f}"
    backend_base = settings.BACKEND_URL.rstrip("/")
    callback_url = f"{backend_base}/api/portal/payment/simulate-callback"

    html_content = f"""<!DOCTYPE html>
<html>
<head>
<title>Payment Gateway (Simulated)</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * {{ margin:0; padding:0; box-sizing:border-box }}
  body {{ font-family:-apple-system,system-ui,sans-serif; background:#f0f4f8;
         display:flex; align-items:center; justify-content:center; min-height:100vh;
         padding:20px }}
  .card {{ background:#fff; border-radius:16px; box-shadow:0 4px 24px rgba(0,0,0,.08);
           max-width:420px; width:100%; overflow:hidden }}
  .header {{ background:linear-gradient(135deg,#0ea5e9,#0284c7); color:#fff;
             padding:24px; text-align:center }}
  .header h1 {{ font-size:20px; margin-bottom:4px }}
  .header .badge {{ display:inline-block; background:rgba(255,255,255,.2);
                    border-radius:20px; padding:4px 12px; font-size:12px; margin-top:8px }}
  .body {{ padding:24px }}
  .row {{ display:flex; justify-content:space-between; padding:12px 0;
          border-bottom:1px solid #f1f5f9 }}
  .row:last-child {{ border:none }}
  .label {{ color:#64748b; font-size:14px }}
  .value {{ color:#1e293b; font-weight:600; font-size:14px }}
  .amount {{ font-size:28px; font-weight:700; color:#0ea5e9; text-align:center;
             padding:20px 0; border-top:2px dashed #e2e8f0; margin-top:8px }}
  .actions {{ padding:0 24px 24px; display:flex; flex-direction:column; gap:10px }}
  .btn {{ border:none; border-radius:12px; padding:14px; font-size:16px;
          font-weight:600; cursor:pointer; width:100%; transition:transform .1s }}
  .btn:active {{ transform:scale(.98) }}
  .btn-success {{ background:#16a34a; color:#fff }}
  .btn-fail {{ background:#dc2626; color:#fff }}
  .btn-cancel {{ background:#f1f5f9; color:#64748b }}
  form {{ display:contents }}
</style>
</head>
<body>
<div class="card">
  <div class="header">
    <h1>Payment Gateway</h1>
    <div class="badge">SIMULATED — TEST MODE</div>
  </div>
  <div class="body">
    <div class="row"><span class="label">Order ID</span><span class="value">{html_mod.escape(order_id)}</span></div>
    <div class="row"><span class="label">Customer</span><span class="value">{payer_name}</span></div>
    <div class="row"><span class="label">Booking</span><span class="value">#{txn.booking_id}</span></div>
    <div class="amount">&#8377; {amount}</div>
  </div>
  <div class="actions">
    <form method="POST" action="{html_mod.escape(callback_url)}">
      <input type="hidden" name="order_id" value="{html_mod.escape(order_id)}">
      <input type="hidden" name="sim_status" value="Success">
      <button type="submit" class="btn btn-success">Pay &#8377; {amount}</button>
    </form>
    <form method="POST" action="{html_mod.escape(callback_url)}">
      <input type="hidden" name="order_id" value="{html_mod.escape(order_id)}">
      <input type="hidden" name="sim_status" value="Failure">
      <button type="submit" class="btn btn-fail">Simulate Failure</button>
    </form>
    <form method="POST" action="{html_mod.escape(callback_url)}">
      <input type="hidden" name="order_id" value="{html_mod.escape(order_id)}">
      <input type="hidden" name="sim_status" value="Aborted">
      <button type="submit" class="btn btn-cancel">Cancel Payment</button>
    </form>
  </div>
</div>
</body>
</html>"""
    return HTMLResponse(html_content)


@router.post(
    "/simulate-callback",
    include_in_schema=False,
)
async def simulate_callback(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Process simulated payment callback. Only works when DEBUG=true."""
    if not _simulation_allowed():
        return HTMLResponse("<h1>Not available — simulation mode is off</h1>", status_code=403)

    form = await request.form()
    order_id = form.get("order_id", "")
    sim_status = form.get("sim_status", "Failure")

    if not order_id:
        return _redirect_to_frontend(success=False, error="Missing order_id")

    result = await db.execute(
        select(PaymentTransaction).where(
            PaymentTransaction.client_txn_id == order_id
        )
    )
    txn = result.scalar_one_or_none()

    if not txn:
        return _redirect_to_frontend(success=False, error="Transaction not found")

    if txn.status in ("SUCCESS", "FAILED", "ABORTED"):
        return _redirect_to_frontend(
            success=(txn.status == "SUCCESS"),
            booking_id=txn.booking_id,
            platform=txn.platform,
        )

    # Update transaction
    txn.gateway_txn_id = f"SIM_{order_id}"
    txn.payment_mode = "Simulated"
    txn.bank_name = "Test Bank"
    txn.gateway_message = f"Simulated {sim_status}"
    txn.raw_response = f"order_id={order_id}&order_status={sim_status}&simulated=true"

    is_success = sim_status == "Success"

    if is_success:
        txn.status = "SUCCESS"
    elif sim_status == "Aborted":
        txn.status = "ABORTED"
    else:
        txn.status = "FAILED"

    await db.flush()

    # If SUCCESS, confirm booking and send email (same as real callback)
    if txn.status == "SUCCESS":
        booking_result = await db.execute(
            select(Booking).where(Booking.id == txn.booking_id)
        )
        booking = booking_result.scalar_one_or_none()

        if booking and booking.status == "PENDING":
            booking.status = "CONFIRMED"
            await db.flush()

            logger.info("Booking %s confirmed via simulated payment", booking.id)

            enriched = await booking_service._enrich_booking(
                db, booking, include_items=True
            )

            portal_user_result = await db.execute(
                select(PortalUser).where(PortalUser.id == booking.portal_user_id)
            )
            portal_user = portal_user_result.scalar_one_or_none()
            if portal_user:
                background_tasks.add_task(
                    send_booking_confirmation, enriched, portal_user.email
                )

    return _redirect_to_frontend(
        success=(txn.status == "SUCCESS"),
        booking_id=txn.booking_id,
        platform=txn.platform,
    )


@router.post(
    "/callback",
    summary="CCAvenue payment callback",
    include_in_schema=False,
)
async def payment_callback(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Handle CCAvenue redirect POST with encrypted response."""
    form = await request.form()
    enc_resp = form.get("encResp", "")

    if not enc_resp:
        logger.error("Callback missing encResp form field")
        return _redirect_to_frontend(success=False, error="Missing encResp")

    parsed = ccavenue_service.decrypt_response(enc_resp)

    order_id = parsed.get("order_id", "")
    order_status = parsed.get("order_status", "")

    logger.info(
        "Payment callback — order_id=%s order_status=%s tracking_id=%s",
        order_id,
        order_status,
        parsed.get("tracking_id", ""),
    )

    if not order_id:
        logger.error("Callback missing order_id — cannot process")
        return _redirect_to_frontend(success=False, error="Invalid callback data")

    # Find PaymentTransaction by order_id (stored as client_txn_id)
    result = await db.execute(
        select(PaymentTransaction).where(
            PaymentTransaction.client_txn_id == order_id
        )
    )
    txn = result.scalar_one_or_none()

    if not txn:
        logger.error("No PaymentTransaction found for order_id=%s", order_id)
        return _redirect_to_frontend(success=False, error="Transaction not found")

    # Idempotency — if already processed, just redirect
    if txn.status in ("SUCCESS", "FAILED", "ABORTED"):
        return _redirect_to_frontend(
            success=(txn.status == "SUCCESS"),
            booking_id=txn.booking_id,
            platform=txn.platform,
        )

    # Update transaction with callback data
    txn.gateway_txn_id = parsed.get("tracking_id", "")
    txn.payment_mode = parsed.get("payment_mode", "")
    txn.bank_name = parsed.get("card_name", "")
    txn.gateway_message = parsed.get("status_message", "")

    # Store raw response (exclude sensitive fields)
    raw_pairs = [
        f"{k}={v}" for k, v in parsed.items()
        if k not in ("encResp",)
    ]
    txn.raw_response = "&".join(raw_pairs)

    # Determine success
    is_success = is_payment_successful(order_status)

    if is_success:
        # Verify amount matches
        callback_amount = parsed.get("amount", "")
        if callback_amount:
            try:
                if abs(float(callback_amount) - float(txn.amount)) > 0.01:
                    logger.error(
                        "Amount mismatch for %s: expected %s, got %s",
                        order_id, txn.amount, callback_amount,
                    )
                    is_success = False
                    txn.gateway_message = f"Amount mismatch: expected {txn.amount}, got {callback_amount}"
            except (ValueError, TypeError):
                pass

    if is_success:
        txn.status = "SUCCESS"
    elif order_status == "Aborted":
        txn.status = "ABORTED"
    else:
        txn.status = "FAILED"

    await db.flush()

    # If SUCCESS, confirm the booking and send email
    if txn.status == "SUCCESS":
        booking_result = await db.execute(
            select(Booking).where(Booking.id == txn.booking_id)
        )
        booking = booking_result.scalar_one_or_none()

        if booking and booking.status == "PENDING":
            booking.status = "CONFIRMED"
            await db.flush()

            logger.info("Booking %s confirmed via payment callback", booking.id)

            enriched = await booking_service._enrich_booking(
                db, booking, include_items=True
            )

            portal_user_result = await db.execute(
                select(PortalUser).where(PortalUser.id == booking.portal_user_id)
            )
            portal_user = portal_user_result.scalar_one_or_none()
            if portal_user:
                background_tasks.add_task(
                    send_booking_confirmation, enriched, portal_user.email
                )

    # Determine platform from merchant_param1 or stored value
    platform = parsed.get("merchant_param1", txn.platform) or "web"

    return _redirect_to_frontend(
        success=(txn.status == "SUCCESS"),
        booking_id=txn.booking_id,
        platform=platform,
    )
