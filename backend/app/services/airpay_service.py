"""Airpay payment gateway — classic redirect kit (hosted checkout via checksum).

Flow:
  1. build_payment_request() -> form fields (privatekey + checksum + order data)
  2. Frontend auto-submits the form to payments.airpay.co.in/pay/index.php
  3. Airpay POSTs the result back to our return URL (verify_response)
  4. confirm_order() does an authoritative server-side PULL against verify.php

Crypto (from Airpay's official integration kit):
  privatekey = SHA256(secret_key + "@" + username + ":|:" + password)
  checksum   = MD5(alldata + date("Y-m-d", IST) + privatekey)
  response   = crc32(TRANSACTIONID:APTRANSACTIONID:AMOUNT:TRANSACTIONSTATUS:MESSAGE:mercid:username)
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

# Characters Airpay's kit strips from each parameter before hashing/submitting.
_SANITIZE_CHARS = ",#(){}<>`!$%^=+|\\:'\";~[]*&"

# Airpay numeric status codes (see webhook/order-confirmation glossary).
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


def _compute_checksum(alldata: str, txn_date: str, privatekey: str) -> str:
    return hashlib.md5(f"{alldata}{txn_date}{privatekey}".encode("utf-8")).hexdigest()


def compute_response_hash(
    *, transaction_id: str, ap_transaction_id: str, amount: str, status: str, message: str
) -> str:
    raw = ":".join(
        [
            str(transaction_id),
            str(ap_transaction_id),
            str(amount),
            str(status),
            str(message),
            str(settings.AIRPAY_MERCHANT_ID),
            str(settings.AIRPAY_USERNAME),
        ]
    )
    return str(zlib.crc32(raw.encode("utf-8")) & 0xFFFFFFFF)


def build_payment_request(
    *,
    order_id: str,
    amount: float,
    buyer_email: str,
    buyer_first_name: str,
    buyer_last_name: str,
    buyer_address: str,
    buyer_city: str,
    buyer_state: str,
    buyer_country: str,
    buyer_pincode: str,
    buyer_phone: str,
    return_url: str,
    txn_date: str | None = None,
) -> dict:
    """Build the encrypted/checksummed form fields for Airpay hosted checkout."""
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

    alldata = (
        s_email + s_first + s_last + s_addr + s_city + s_state + s_country
        + _sanitize(amount_str) + order_id
    )
    privatekey = _compute_privatekey()
    checksum = _compute_checksum(alldata, txn_date, privatekey)

    fields = {
        "merchantIdentifier": settings.AIRPAY_MERCHANT_ID,
        "mercid": settings.AIRPAY_MERCHANT_ID,
        "orderId": order_id,
        "orderid": order_id,
        "buyerEmail": s_email,
        "buyerFirstName": s_first,
        "buyerLastName": s_last,
        "buyerAddress": s_addr,
        "buyerCity": s_city,
        "buyerState": s_state,
        "buyerCountry": s_country,
        "buyerPincode": _sanitize(buyer_pincode),
        "buyerPhone": _sanitize(buyer_phone),
        "txnType": "1",
        "purpose": "1",
        "productDescription": "Ferry Ticket",
        "txnDate": txn_date,
        "currency": "356",
        "isocurrency": "INR",
        "amount": amount_str,
        "privatekey": privatekey,
        "checksum": checksum,
        "returnUrl": return_url,
    }

    base = settings.AIRPAY_BASE_URL.rstrip("/")
    return {
        "airpay_url": f"{base}/pay/index.php",
        "fields": fields,
        "order_id": order_id,
    }


def verify_response(form: dict) -> bool:
    """Verify the ap_SecureHash returned by Airpay on the callback POST."""
    received = str(form.get("ap_SecureHash", "")).strip()
    if not received:
        return False
    expected = compute_response_hash(
        transaction_id=form.get("TRANSACTIONID", ""),
        ap_transaction_id=form.get("APTRANSACTIONID", ""),
        amount=form.get("AMOUNT", ""),
        status=form.get("TRANSACTIONSTATUS", ""),
        message=form.get("MESSAGE", ""),
    )
    return received == expected


def map_status(code: str) -> str:
    return _STATUS_MAP.get(str(code).strip(), "FAILED")


def is_payment_successful(code: str) -> bool:
    return str(code).strip() == "200"


def _parse_verify_response(text: str) -> dict:
    """Parse Airpay's verify.php response, which may be JSON or key=value pairs.

    Returns a dict with UPPERCASE keys. Unparseable text is returned under '_RAW'
    so the regex fallback in _extract_status can still find the status.
    """
    text = (text or "").strip()
    if not text:
        return {}
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return {str(k).upper(): v for k, v in data.items()}
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
    """Authoritative server-side PULL against Airpay's verify endpoint.

    This is the SOURCE OF TRUTH for a payment: the redirect callback's hash is
    not secret-keyed, so a SUCCESS must be confirmed here before a booking is
    marked paid. Returns {"status": <code|None>, "parsed": {...}} or {"error": ...}.
    """
    base = settings.AIRPAY_BASE_URL.rstrip("/")
    url = f"{base}/order/verify.php"
    payload = {
        "Mercid": settings.AIRPAY_MERCHANT_ID,
        "merchant_txnId": order_id,
        "Privatekey": _compute_privatekey(),
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(url, data=payload)
            resp.raise_for_status()
            parsed = _parse_verify_response(resp.text)
            return {"status": _extract_status(parsed), "parsed": parsed, "raw": resp.text}
    except Exception as exc:  # noqa: BLE001 — network errors must not crash callback
        logger.error("Airpay order verify failed for %s: %s", order_id, exc)
        return {"error": str(exc)}
