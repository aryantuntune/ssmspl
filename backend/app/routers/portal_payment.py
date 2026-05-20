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
from app.services import airpay_service, booking_service
from app.services.email_service import send_booking_confirmation

logger = logging.getLogger(__name__)

PAYMENT_EXPIRY_MINUTES = 30

# Airpay requires buyer address fields; PortalUser has none, so use generic
# placeholders. They must be identical wherever a request is (re)built so the
# checksum stays consistent.
_DEFAULT_ADDRESS = "NA"
_DEFAULT_CITY = "NA"
_DEFAULT_STATE = "NA"
_DEFAULT_COUNTRY = "India"
_DEFAULT_PINCODE = "000000"

router = APIRouter(prefix="/api/portal/payment", tags=["Portal Payment"])


# ── Request / Response schemas ───────────────────────────────────────────────


class CreateOrderRequest(BaseModel):
    booking_id: int = Field(..., description="Booking ID to pay for")
    platform: Literal["web", "mobile"] = Field("web", description="Platform: 'web' or 'mobile'")


class CreateOrderResponse(BaseModel):
    airpay_url: str
    fields: dict = {}
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


def _simulation_allowed() -> bool:
    """Simulation is allowed when:
    - PAYMENT_SIMULATION=true (hard override — works even with Airpay configured), OR
    - Airpay is NOT configured AND DEBUG=true (dev convenience)
    """
    if settings.PAYMENT_SIMULATION:
        return True
    return not airpay_service.is_configured() and settings.DEBUG


def _airpay_request_for_txn(txn: PaymentTransaction, portal_user: PortalUser | None) -> dict:
    """Build the Airpay payment request for a stored transaction.

    Return/IPN URLs are configured with Airpay at onboarding, so they are not
    sent per-transaction. UID is the merchant's unique user identifier.
    """
    return airpay_service.build_payment_request(
        order_id=txn.client_txn_id,
        amount=float(txn.amount),
        uid=str(portal_user.id) if portal_user else str(txn.booking_id),
        buyer_email=portal_user.email if portal_user else "customer@example.com",
        buyer_first_name=portal_user.first_name if portal_user else "Customer",
        buyer_last_name=portal_user.last_name if portal_user else "NA",
        buyer_address=_DEFAULT_ADDRESS,
        buyer_city=_DEFAULT_CITY,
        buyer_state=_DEFAULT_STATE,
        buyer_country=_DEFAULT_COUNTRY,
        buyer_pincode=_DEFAULT_PINCODE,
        buyer_phone=portal_user.mobile if portal_user else "0000000000",
    )


async def _finalize_transaction(
    txn: PaymentTransaction,
    parsed: dict,
    db: AsyncSession,
    background_tasks: BackgroundTasks,
) -> None:
    """Apply an Airpay result to a transaction and, on success, confirm the booking.

    Caller must have already verified the response hash. Idempotent: no-op if the
    transaction is already in a terminal state.
    """
    if txn.status in ("SUCCESS", "FAILED", "ABORTED"):
        return

    order_status = str(parsed.get("TRANSACTIONSTATUS", "")).strip()
    txn.gateway_txn_id = parsed.get("APTRANSACTIONID", "")
    txn.payment_mode = parsed.get("CHMOD", "")
    txn.bank_name = parsed.get("BANKNAME") or parsed.get("CARDISSUER", "")
    txn.gateway_message = parsed.get("MESSAGE", "")
    txn.raw_response = "&".join(
        f"{k}={v}" for k, v in parsed.items() if k not in ("ap_SecureHash",)
    )

    new_status = airpay_service.map_status(order_status)

    # Anti-tamper: amount must match on success.
    if new_status == "SUCCESS":
        callback_amount = parsed.get("AMOUNT", "")
        try:
            if callback_amount and abs(float(callback_amount) - float(txn.amount)) > 0.01:
                logger.error(
                    "Amount mismatch for %s: expected %s, got %s",
                    txn.client_txn_id, txn.amount, callback_amount,
                )
                new_status = "FAILED"
                txn.gateway_message = f"Amount mismatch: expected {txn.amount}, got {callback_amount}"
        except (ValueError, TypeError):
            pass

    # SECURITY: the response hash is a plain crc32 (not secret-keyed), so a SUCCESS
    # callback could be forged. For LIVE payments, treat Airpay's server-side
    # verify.php as the source of truth and fail closed unless it also returns 200.
    # verify.php does not work on sandbox (TEST) MIDs, so for TEST transactions we
    # trust the hash-verified callback (no real money is involved).
    if new_status == "SUCCESS":
        txn_mode = str(parsed.get("TXN_MODE", "")).strip().upper()
        if txn_mode == "TEST":
            logger.info(
                "Sandbox (TEST) payment %s — trusting verified callback "
                "(verify.php is unavailable on sandbox MIDs).", txn.client_txn_id,
            )
        else:
            confirm = await airpay_service.confirm_order(txn.client_txn_id)
            if confirm.get("status") != "200":
                logger.error(
                    "LIVE success for %s NOT confirmed by verify.php (status=%r, error=%r) "
                    "— holding as pending, NOT confirming booking.",
                    txn.client_txn_id, confirm.get("status"), confirm.get("error"),
                )
                await db.flush()  # persist gateway fields; status stays INITIATED
                return

    if new_status == "INITIATED":
        # Pending/incomplete — leave the transaction open for a later webhook.
        await db.flush()
        return

    txn.status = new_status
    await db.flush()

    if txn.status == "SUCCESS":
        booking_result = await db.execute(select(Booking).where(Booking.id == txn.booking_id))
        booking = booking_result.scalar_one_or_none()
        if booking and booking.status == "PENDING":
            booking.status = "CONFIRMED"
            await db.flush()
            await db.refresh(booking)
            logger.info("Booking %s confirmed via Airpay payment", booking.id)

            enriched = await booking_service._enrich_booking(db, booking, include_items=True)
            portal_user_result = await db.execute(
                select(PortalUser).where(PortalUser.id == booking.portal_user_id)
            )
            portal_user = portal_user_result.scalar_one_or_none()
            if portal_user:
                background_tasks.add_task(send_booking_confirmation, enriched, portal_user.email)


# ── Endpoints ────────────────────────────────────────────────────────────────


@router.get("/config", summary="Get payment gateway config")
async def payment_config():
    sim = _simulation_allowed()
    return {
        "gateway": "airpay",
        "configured": airpay_service.is_configured(),
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
    is_configured = airpay_service.is_configured()
    use_simulation = _simulation_allowed()

    if not is_configured and not use_simulation:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Payment gateway is not configured",
        )

    booking_data = await booking_service.get_booking_by_id(db, body.booking_id, current_user.id)
    if booking_data["status"] != "PENDING":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Booking is not in PENDING status",
        )

    # Lock the booking row to prevent amount changes during payment flow (TOCTOU)
    await db.execute(select(Booking).where(Booking.id == body.booking_id).with_for_update())

    # Reuse a non-expired INITIATED transaction if one exists.
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
        order_id = airpay_service.generate_order_id(body.booking_id)
        txn = PaymentTransaction(
            booking_id=body.booking_id,
            client_txn_id=order_id,
            amount=booking_data["net_amount"],
            status="INITIATED",
            platform=body.platform,
        )
        db.add(txn)
        await db.flush()

    if use_simulation:
        backend_base = settings.BACKEND_URL.rstrip("/")
        simulate_url = f"{backend_base}/api/portal/payment/simulate/{order_id}"
        logger.info("Payment order created (SIMULATED) — booking_id=%s order_id=%s",
                    body.booking_id, order_id)
        return {
            "airpay_url": simulate_url,
            "fields": {},
            "order_id": order_id,
            "simulated": True,
        }

    result = _airpay_request_for_txn(txn, current_user)
    logger.info("Payment order created — booking_id=%s order_id=%s", body.booking_id, order_id)
    return {
        "airpay_url": result["airpay_url"],
        "fields": result["fields"],
        "order_id": order_id,
        "simulated": False,
    }


@router.get("/initiate/{order_id}", include_in_schema=False)
async def initiate_checkout(order_id: str, db: AsyncSession = Depends(get_db)):
    """Serve an auto-submitting HTML form for Airpay checkout (mobile app uses this
    via Linking.openURL), or redirect to the simulation page when in simulation mode."""
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

    if _simulation_allowed():
        backend_base = settings.BACKEND_URL.rstrip("/")
        return RedirectResponse(
            url=f"{backend_base}/api/portal/payment/simulate/{order_id}", status_code=302
        )

    booking_result = await db.execute(select(Booking).where(Booking.id == txn.booking_id))
    booking = booking_result.scalar_one_or_none()
    if not booking:
        return HTMLResponse("<h1>Booking not found</h1>", status_code=404)

    portal_user_result = await db.execute(
        select(PortalUser).where(PortalUser.id == booking.portal_user_id)
    )
    portal_user = portal_user_result.scalar_one_or_none()

    result = _airpay_request_for_txn(txn, portal_user)
    airpay_url = html_mod.escape(result["airpay_url"])
    inputs = "".join(
        f'<input type="hidden" name="{html_mod.escape(k)}" value="{html_mod.escape(str(v))}">'
        for k, v in result["fields"].items()
    )

    html_content = (
        "<!DOCTYPE html><html><head><title>Redirecting to payment...</title>"
        '<meta name="viewport" content="width=device-width,initial-scale=1">'
        "<style>body{display:flex;align-items:center;justify-content:center;"
        "min-height:100vh;margin:0;font-family:sans-serif;background:#f5f5f5}"
        "p{font-size:18px;color:#333}</style></head>"
        '<body onload="document.getElementById(\'pf\').submit()">'
        "<p>Redirecting to payment gateway&#8230;</p>"
        f'<form id="pf" method="POST" action="{airpay_url}">{inputs}</form>'
        "</body></html>"
    )
    return HTMLResponse(html_content)


@router.get("/simulate/{order_id}", include_in_schema=False)
async def simulate_checkout(order_id: str, db: AsyncSession = Depends(get_db)):
    """Mock checkout page for testing when running in simulation mode."""
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

    booking_result = await db.execute(select(Booking).where(Booking.id == txn.booking_id))
    booking = booking_result.scalar_one_or_none()
    portal_user_result = (
        await db.execute(select(PortalUser).where(PortalUser.id == booking.portal_user_id))
        if booking else None
    )
    portal_user = portal_user_result.scalar_one_or_none() if portal_user_result else None

    payer_name = html_mod.escape(
        f"{portal_user.first_name} {portal_user.last_name}".strip() if portal_user else "Customer"
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


@router.post("/simulate-callback", include_in_schema=False)
async def simulate_callback(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Process a simulated payment callback. Only works in simulation mode."""
    if not _simulation_allowed():
        return HTMLResponse("<h1>Not available — simulation mode is off</h1>", status_code=403)

    form = await request.form()
    order_id = form.get("order_id", "")
    sim_status = form.get("sim_status", "Failure")

    if not order_id:
        return _redirect_to_frontend(success=False, error="Missing order_id")

    result = await db.execute(
        select(PaymentTransaction).where(PaymentTransaction.client_txn_id == order_id)
    )
    txn = result.scalar_one_or_none()
    if not txn:
        return _redirect_to_frontend(success=False, error="Transaction not found")

    if txn.status in ("SUCCESS", "FAILED", "ABORTED"):
        return _redirect_to_frontend(
            success=(txn.status == "SUCCESS"), booking_id=txn.booking_id, platform=txn.platform
        )

    txn.gateway_txn_id = f"SIM_{order_id}"
    txn.payment_mode = "Simulated"
    txn.bank_name = "Test Bank"
    txn.gateway_message = f"Simulated {sim_status}"
    txn.raw_response = f"order_id={order_id}&order_status={sim_status}&simulated=true"

    if sim_status == "Success":
        txn.status = "SUCCESS"
    elif sim_status == "Aborted":
        txn.status = "ABORTED"
    else:
        txn.status = "FAILED"

    await db.flush()

    if txn.status == "SUCCESS":
        booking_result = await db.execute(select(Booking).where(Booking.id == txn.booking_id))
        booking = booking_result.scalar_one_or_none()
        if booking and booking.status == "PENDING":
            booking.status = "CONFIRMED"
            await db.flush()
            await db.refresh(booking)
            logger.info("Booking %s confirmed via simulated payment", booking.id)
            enriched = await booking_service._enrich_booking(db, booking, include_items=True)
            portal_user_result = await db.execute(
                select(PortalUser).where(PortalUser.id == booking.portal_user_id)
            )
            portal_user = portal_user_result.scalar_one_or_none()
            if portal_user:
                background_tasks.add_task(send_booking_confirmation, enriched, portal_user.email)

    return _redirect_to_frontend(
        success=(txn.status == "SUCCESS"), booking_id=txn.booking_id, platform=txn.platform
    )


async def _read_result_data(request: Request) -> dict:
    """Airpay may POST the result as JSON (IPN) or form-encoded (redirect)."""
    ctype = request.headers.get("content-type", "")
    if "application/json" in ctype:
        try:
            body = await request.json()
            if isinstance(body, dict):
                return {str(k): v for k, v in body.items()}
        except Exception:  # noqa: BLE001 — fall back to form parsing
            pass
    return dict(await request.form())


async def _handle_airpay_result(
    request: Request, background_tasks: BackgroundTasks, db: AsyncSession
) -> PaymentTransaction | None:
    """Shared handler for the Airpay redirect callback and the IPN webhook.

    Returns the transaction on success of processing (verified), else None.
    Raises nothing — callers decide how to respond.
    """
    form = await _read_result_data(request)
    order_id = form.get("TRANSACTIONID", "")

    logger.info(
        "Airpay result — order_id=%s status=%s ap_txn=%s",
        order_id, form.get("TRANSACTIONSTATUS", ""), form.get("APTRANSACTIONID", ""),
    )

    if not order_id:
        logger.error("Airpay result missing TRANSACTIONID")
        return None

    if not airpay_service.verify_response(form):
        logger.error("Airpay result hash verification FAILED for order_id=%s", order_id)
        return None

    result = await db.execute(
        select(PaymentTransaction).where(PaymentTransaction.client_txn_id == order_id)
    )
    txn = result.scalar_one_or_none()
    if not txn:
        logger.error("No PaymentTransaction for order_id=%s", order_id)
        return None

    await _finalize_transaction(txn, form, db, background_tasks)
    return txn


@router.post("/callback", summary="Airpay payment callback", include_in_schema=False)
async def payment_callback(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Handle Airpay's redirect POST, then bounce the user back to the frontend."""
    txn = await _handle_airpay_result(request, background_tasks, db)
    if txn is None:
        return _redirect_to_frontend(success=False, error="Invalid or unverified payment response")
    return _redirect_to_frontend(
        success=(txn.status == "SUCCESS"), booking_id=txn.booking_id, platform=txn.platform
    )


@router.post("/webhook", summary="Airpay IPN webhook", include_in_schema=False)
async def payment_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    """Server-to-server IPN PUSH from Airpay (source of truth). Idempotent."""
    txn = await _handle_airpay_result(request, background_tasks, db)
    if txn is None:
        return {"status": "ignored"}
    return {"status": "ok", "transaction_status": txn.status}
