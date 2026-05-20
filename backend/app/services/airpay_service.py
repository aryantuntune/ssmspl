"""Airpay payment gateway — v3 "Simple Transaction" redirect kit (hosted checkout).

Scheme (from Airpay's current API docs, sanctum.airpay.co.in):
  privatekey      = SHA256(secret + "@" + username + ":|:" + password)
  checksum_key    = SHA256(username + "~:~" + password)
  request checksum= SHA256(checksum_key + "@" + alldata)
      alldata     = buyerEmail+buyerFirstName+buyerLastName+buyerAddress+buyerCity
                    +buyerState+buyerCountry+amount+orderid+UID+siindexvar+date
                    (siindexvar empty for non-subscription; date = YYYY-MM-DD, IST)
  response hash   = crc32(TRANSACTIONID:APTRANSACTIONID:AMOUNT:TRANSACTIONSTATUS:
                          MESSAGE:MID:USERNAME[:CUSTOMERVPA if channel is UPI])

Flow:
  1. build_payment_request() -> form fields, auto-submitted to pay/index.php
  2. Airpay redirects back / IPN-POSTs the result (JSON or form) -> verify_response()
  3. confirm_order() PULLs the authoritative status from verify.php (LIVE MID only)

Note: return_url / IPN url are configured with Airpay at onboarding (not POSTed).
verify.php works on LIVE merchant IDs only — not on sandbox.
"""

import hashlib
import json
import logging
import re
import time
import uuid
import zlib

import httpx

from app.config import settings
from app.core.timezone import today_ist

logger = logging.getLogger("ssmspl.airpay")

# Characters Airpay rejects in parameters — strip them so values pass validation
# (the checksum is computed over the SAME values that are submitted).
_SANITIZE_CHARS = "<>`!^|\\\"'"

_VERIFY_URL = "https://kraken.airpay.co.in/airpay/order/verify.php"

_STATUS_MAP = {
    "200": "SUCCESS",
    "400": "FAILED",
    "405": "FAILED",
    "503": "FAILED",
    "401": "ABORTED",
    "402": "ABORTED",
    "211": "INITIATED",
    "403": "INITIATED",
}


def is_configured() -> bool:
    return bool(
        settings.AIRPAY_MERCHANT_ID
        and settings.AIRPAY_USERNAME
        and settings.AIRPAY_PASSWORD
        and settings.AIRPAY_SECRET_KEY
    )


def generate_order_id(booking_id: int) -> str:
    return f"SSMSPL{booking_id}{int(time.time())}{uuid.uuid4().hex[:6]}"


def _sanitize(value: str) -> str:
    if value is None:
        return ""
    return "".join(c for c in str(value) if c not in _SANITIZE_CHARS)


def _compute_privatekey() -> str:
    raw = f"{settings.AIRPAY_SECRET_KEY}@{settings.AIRPAY_USERNAME}:|:{settings.AIRPAY_PASSWORD}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _compute_checksum_key() -> str:
    raw = f"{settings.AIRPAY_USERNAME}~:~{settings.AIRPAY_PASSWORD}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _compute_request_checksum(alldata: str) -> str:
    raw = f"{_compute_checksum_key()}@{alldata}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def compute_response_hash(
    *,
    transaction_id: str,
    ap_transaction_id: str,
    amount: str,
    status: str,
    message: str,
    chmod: str = "",
    customer_vpa: str = "",
) -> str:
    parts = [
        str(transaction_id),
        str(ap_transaction_id),
        str(amount),
        str(status),
        str(message),
        str(settings.AIRPAY_MERCHANT_ID),
        str(settings.AIRPAY_USERNAME),
    ]
    if str(chmod).lower() == "upi" and customer_vpa:
        parts.append(str(customer_vpa))
    raw = ":".join(parts)
    return str(zlib.crc32(raw.encode("utf-8")) & 0xFFFFFFFF)


def build_payment_request(
    *,
    order_id: str,
    amount: float,
    uid: str,
    buyer_email: str,
    buyer_first_name: str,
    buyer_last_name: str,
    buyer_address: str,
    buyer_city: str,
    buyer_state: str,
    buyer_country: str,
    buyer_pincode: str,
    buyer_phone: str,
    kittype: str = "server_side_sdk",
    txn_date: str | None = None,
) -> dict:
    """Build the v3 Simple-Transaction form fields for Airpay hosted checkout."""
    if not is_configured():
        raise RuntimeError("Airpay not configured")

    if txn_date is None:
        txn_date = today_ist().strftime("%Y-%m-%d")

    amount_str = f"{amount:.2f}"
    s_email = _sanitize(buyer_email)
    s_first = _sanitize(buyer_first_name)
    s_last = _sanitize(buyer_last_name)
    s_addr = _sanitize(buyer_address)
    s_city = _sanitize(buyer_city)
    s_state = _sanitize(buyer_state)
    s_country = _sanitize(buyer_country)
    s_uid = _sanitize(uid)
    siindexvar = ""  # subscriptions not used

    alldata = (
        s_email + s_first + s_last + s_addr + s_city + s_state + s_country
        + amount_str + order_id + s_uid + siindexvar + txn_date
    )
    checksum = _compute_request_checksum(alldata)

    fields = {
        "mercid": settings.AIRPAY_MERCHANT_ID,
        "orderid": order_id,
        "amount": amount_str,
        "buyerEmail": s_email,
        "buyerFirstName": s_first,
        "buyerLastName": s_last,
        "buyerAddress": s_addr,
        "buyerCity": s_city,
        "buyerState": s_state,
        "buyerCountry": s_country,
        "buyerPinCode": _sanitize(buyer_pincode),
        "buyerPhone": _sanitize(buyer_phone),
        "UID": s_uid,
        "kittype": kittype,
        "currency": "356",
        "isocurrency": "INR",
        "privatekey": _compute_privatekey(),
        "checksum": checksum,
    }

    base = settings.AIRPAY_BASE_URL.rstrip("/")
    return {"airpay_url": f"{base}/pay/index.php", "fields": fields, "order_id": order_id}


def verify_response(form: dict) -> bool:
    """Verify the ap_SecureHash on an Airpay redirect/IPN response."""
    received = str(form.get("ap_SecureHash", "")).strip()
    if not received:
        return False
    expected = compute_response_hash(
        transaction_id=form.get("TRANSACTIONID", ""),
        ap_transaction_id=form.get("APTRANSACTIONID", ""),
        amount=form.get("AMOUNT", ""),
        status=form.get("TRANSACTIONSTATUS", ""),
        message=form.get("MESSAGE", ""),
        chmod=form.get("CHMOD", ""),
        customer_vpa=form.get("CUSTOMERVPA", ""),
    )
    return received == expected


def map_status(code: str) -> str:
    return _STATUS_MAP.get(str(code).strip(), "FAILED")


def is_payment_successful(code: str) -> bool:
    return str(code).strip() == "200"


def _parse_verify_response(text: str) -> dict:
    """Parse verify.php output, which may be JSON or key=value pairs."""
    text = (text or "").strip()
    if not text:
        return {}
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            # status APIs sometimes nest the payload under "message"
            inner = data.get("message") if isinstance(data.get("message"), dict) else data
            return {str(k).upper(): v for k, v in inner.items()}
    except (json.JSONDecodeError, ValueError):
        pass
    if "=" in text:
        out: dict = {}
        for pair in text.replace("\n", "&").split("&"):
            if "=" in pair:
                k, _, v = pair.partition("=")
                out[k.strip().upper()] = v.strip()
        if out:
            return out
    return {"_RAW": text}


def _extract_status(parsed: dict) -> str | None:
    for key in ("TRANSACTIONSTATUS", "TRANSACTION_STATUS", "STATUS"):
        if key in parsed and str(parsed[key]).strip():
            return str(parsed[key]).strip()
    match = re.search(
        r"TRANSACTIONSTATUS['\"\s:=>]+([0-9]{3})", parsed.get("_RAW", ""), re.IGNORECASE
    )
    return match.group(1) if match else None


async def confirm_order(order_id: str) -> dict:
    """Authoritative server-side PULL against Airpay's verify.php.

    This is the SOURCE OF TRUTH for a LIVE payment — the redirect/IPN hash is a
    plain crc32 (not secret-keyed) and could be forged, so a LIVE success must be
    confirmed here. NOTE: verify.php works on LIVE merchant IDs only, not sandbox.
    Returns {"status": <code|None>, "parsed": {...}} or {"error": ...}.
    """
    txn_date = today_ist().strftime("%Y-%m-%d")
    # alldata = merchant_id + merchant_txn_id + processor_id + rrn + terminal_id + txn_type + date
    alldata = f"{settings.AIRPAY_MERCHANT_ID}{order_id}{txn_date}"
    payload = {
        "merchant_id": settings.AIRPAY_MERCHANT_ID,
        "merchant_txn_id": order_id,
        "private_key": _compute_privatekey(),
        "checksum": _compute_request_checksum(alldata),
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(_VERIFY_URL, data=payload)
            resp.raise_for_status()
            parsed = _parse_verify_response(resp.text)
            return {"status": _extract_status(parsed), "parsed": parsed, "raw": resp.text}
    except Exception as exc:  # noqa: BLE001 — network errors must not crash the callback
        logger.error("Airpay order verify failed for %s: %s", order_id, exc)
        return {"error": str(exc)}
