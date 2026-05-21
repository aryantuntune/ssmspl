"""Airpay payment gateway — v4 Server-Side SDK (OAuth2 + AES, hosted checkout).

Mirrors Airpay's official Python v4 kit (airpay_python_v4/sendtoairpaypage.py +
responsefromairpay.py). Sandbox MID 335854 is provisioned for v4, not the legacy
v3 direct-POST (v3 returns "Merchant Key Authentication Failed").

Crypto:
  AES key   = MD5(username + "~:~" + password)  (32 hex chars -> AES-256-CBC)
  AES iv    = first 16 chars of the payload (we emit a fixed iv, prepended)
  encdata   = iv + base64( AES-CBC( PKCS7(json) ) )
  privatekey= SHA256(secret + "@" + username + ":|:" + password)
  v4 checksum = SHA256( concat(values of dict sorted by key) + date )   (date YYYY-MM-DD)
  response hash = crc32(TRANSACTIONID:APTRANSACTIONID:AMOUNT:TRANSACTIONSTATUS:
                        MESSAGE:MID:USERNAME[:CUSTOMERVPA if channel is UPI])

Flow:
  1. fetch_access_token(): OAuth2 client_credentials -> kraken -> AES-decrypt -> token
  2. build_payment_request(): encrypt payload, redirect to pay/v4/index.php?token=...
  3. normalize_response(): decrypt the encrypted callback/IPN `response` -> std keys
  4. verify_response(): crc32 check on the normalized dict
"""

import base64
import hashlib
import json
import logging
import re
import time
import uuid
import zlib

import httpx
from cryptography.hazmat.primitives import padding as _sym_padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from app.config import settings
from app.core.timezone import today_ist

logger = logging.getLogger("ssmspl.airpay")

# Characters Airpay rejects in parameters — strip them so values pass validation.
_SANITIZE_CHARS = "<>`!^|\\\"'"

# Fixed IV used by the official v4 kit for outbound encryption (16 bytes).
_V4_IV = "c0f9e2d16031b0ce"

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


# ── Crypto primitives ───────────────────────────────────────────────────────


def _aes_key() -> bytes:
    raw = f"{settings.AIRPAY_USERNAME}~:~{settings.AIRPAY_PASSWORD}"
    # MD5 hex digest is 32 ASCII chars => 32-byte key => AES-256.
    return hashlib.md5(raw.encode("utf-8")).hexdigest().encode("utf-8")


def _aes_encrypt(plaintext: str) -> str:
    """AES-256-CBC encrypt; returns iv + base64(ciphertext), matching the v4 kit."""
    iv = _V4_IV.encode("utf-8")
    padder = _sym_padding.PKCS7(128).padder()
    padded = padder.update(plaintext.encode("utf-8")) + padder.finalize()
    encryptor = Cipher(algorithms.AES(_aes_key()), modes.CBC(iv)).encryptor()
    ct = encryptor.update(padded) + encryptor.finalize()
    return _V4_IV + base64.b64encode(ct).decode("utf-8")


def _aes_decrypt(data: str) -> str:
    """Reverse of _aes_encrypt: iv = first 16 chars, rest = base64(ciphertext)."""
    iv = data[:16].encode("utf-8")
    ct = base64.b64decode(data[16:])
    decryptor = Cipher(algorithms.AES(_aes_key()), modes.CBC(iv)).decryptor()
    padded = decryptor.update(ct) + decryptor.finalize()
    unpadder = _sym_padding.PKCS7(128).unpadder()
    return (unpadder.update(padded) + unpadder.finalize()).decode("utf-8")


def _compute_privatekey() -> str:
    raw = f"{settings.AIRPAY_SECRET_KEY}@{settings.AIRPAY_USERNAME}:|:{settings.AIRPAY_PASSWORD}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _v4_checksum(data: dict, txn_date: str) -> str:
    """v4 checksum = SHA256( concat(values sorted by key) + date )."""
    concat = "".join(str(v) for _, v in sorted(data.items(), key=lambda kv: kv[0]))
    return hashlib.sha256((concat + txn_date).encode("utf-8")).hexdigest()


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


# ── OAuth2 token ─────────────────────────────────────────────────────────────


async def fetch_access_token(txn_date: str | None = None) -> str:
    """OAuth2 client_credentials exchange against Airpay's kraken endpoint.

    Posts {merchant_id, encdata, checksum} where encdata is the AES-encrypted
    {client_id, client_secret, grant_type, merchant_id}. The response body has an
    AES-encrypted `response` field that decrypts to JSON containing the token.
    """
    if txn_date is None:
        txn_date = today_ist().strftime("%Y-%m-%d")

    oauth_request = {
        "client_id": settings.AIRPAY_CLIENT_ID,
        "client_secret": settings.AIRPAY_CLIENT_SECRET,
        "grant_type": "client_credentials",
        "merchant_id": settings.AIRPAY_MERCHANT_ID,
    }
    payload = {
        "merchant_id": settings.AIRPAY_MERCHANT_ID,
        "encdata": _aes_encrypt(json.dumps(oauth_request)),
        "checksum": _v4_checksum(oauth_request, txn_date),
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(settings.AIRPAY_OAUTH_URL, data=payload)
        resp.raise_for_status()
        outer = resp.json()

    if not isinstance(outer, dict) or "response" not in outer:
        raise RuntimeError(f"Airpay OAuth2 unexpected response: {str(outer)[:200]}")

    token_resp = json.loads(_aes_decrypt(str(outer["response"])))
    if isinstance(token_resp, dict) and token_resp.get("success") is False:
        raise RuntimeError(f"Airpay OAuth2 failed: {token_resp.get('msg')}")

    data = token_resp.get("data") if isinstance(token_resp, dict) else None
    token = (data or {}).get("access_token") if isinstance(data, dict) else None
    if not token and isinstance(token_resp, dict):
        token = token_resp.get("access_token")
    if not token:
        raise RuntimeError(f"Airpay OAuth2 returned no access_token: {str(token_resp)[:200]}")
    return str(token)


# ── Payment request ──────────────────────────────────────────────────────────


async def build_payment_request(
    *,
    order_id: str,
    amount: float,
    uid: str = "",  # kept for caller compatibility; not used by the v4 kit
    buyer_email: str,
    buyer_first_name: str,
    buyer_last_name: str,
    buyer_address: str,
    buyer_city: str,
    buyer_state: str,
    buyer_country: str,
    buyer_pincode: str,
    buyer_phone: str,
    kittype: str = "",  # kept for compatibility
    txn_date: str | None = None,
) -> dict:
    """Build the v4 hosted-checkout request (fetches an OAuth2 token first).

    Returns {airpay_url (with ?token=), fields, order_id}. The fields are
    auto-submitted (POST) to pay/v4/index.php by the browser.
    """
    if not is_configured():
        raise RuntimeError("Airpay not configured")

    if txn_date is None:
        txn_date = today_ist().strftime("%Y-%m-%d")

    amount_str = f"{amount:.2f}"
    access_token = await fetch_access_token(txn_date)
    mer_dom = base64.b64encode(settings.AIRPAY_MERCHANT_DOMAIN.encode("utf-8")).decode("utf-8")

    # OAuth uses the plain numeric MID; the pay/v4 step needs the "M"-prefixed MID.
    pay_mid = settings.AIRPAY_PAY_MERCHANT_ID or f"M{settings.AIRPAY_MERCHANT_ID}"

    post_data = {
        "buyer_email": _sanitize(buyer_email),
        "buyer_firstname": _sanitize(buyer_first_name),
        "buyer_lastname": _sanitize(buyer_last_name),
        "buyer_address": _sanitize(buyer_address),
        "buyer_city": _sanitize(buyer_city),
        "buyer_state": _sanitize(buyer_state),
        "buyer_country": _sanitize(buyer_country),
        "amount": amount_str,
        "orderid": order_id,
        "buyer_phone": _sanitize(buyer_phone),
        "buyer_pincode": _sanitize(buyer_pincode),
        "iso_currency": "INR",
        "currency_code": "356",
        "merchant_id": pay_mid,
        "mer_dom": mer_dom,
    }

    fields = {
        "privatekey": _compute_privatekey(),
        "merchant_id": pay_mid,
        "encdata": _aes_encrypt(json.dumps(post_data)),
        "checksum": _v4_checksum(post_data, txn_date),
        "chmod": "",
    }

    base = settings.AIRPAY_BASE_URL.rstrip("/")
    url = f"{base}/pay/v4/index.php?token={access_token}"
    return {"airpay_url": url, "fields": fields, "order_id": order_id}


# ── Response handling ──────────────────────────────────────────────────────────


def normalize_response(form: dict) -> dict:
    """Normalize an Airpay callback/IPN into the standard uppercase-key dict.

    v4 sends a single AES-encrypted `response` field; decrypt it and map the
    inner JSON `data` to the keys the rest of the pipeline expects. A plaintext
    (v3-style) callback is returned unchanged.
    """
    if not form:
        return form
    encrypted = form.get("response")
    if not encrypted:
        return form  # plaintext callback — nothing to decrypt

    try:
        payload = json.loads(_aes_decrypt(str(encrypted)))
    except Exception as exc:  # noqa: BLE001 — bad/forged payloads must not crash
        logger.error("Airpay v4 response decrypt failed: %s", exc)
        return form

    data = payload.get("data", payload) if isinstance(payload, dict) else {}
    if not isinstance(data, dict):
        data = {}

    def g(*keys: str) -> str:
        for k in keys:
            if k in data and str(data[k]).strip():
                return str(data[k]).strip()
        return ""

    return {
        "TRANSACTIONID": g("orderid", "TRANSACTIONID"),
        "APTRANSACTIONID": g("ap_transactionid", "APTRANSACTIONID"),
        "AMOUNT": g("amount", "AMOUNT"),
        "TRANSACTIONSTATUS": g("transaction_status", "TRANSACTIONSTATUS"),
        "MESSAGE": g("message", "MESSAGE"),
        "ap_SecureHash": g("ap_securehash", "ap_SecureHash"),
        "CHMOD": g("chmod", "CHMOD"),
        "CUSTOMERVPA": g("CUSTOMERVPA", "customervpa", "customer_vpa"),
        "CUSTOMVAR": g("custom_var", "CUSTOMVAR"),
        "TXN_MODE": g("txn_mode", "TXN_MODE"),
    }


def verify_response(form: dict) -> bool:
    """Verify the ap_SecureHash on a (normalized) Airpay redirect/IPN response."""
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
    """Authoritative server-side PULL against Airpay's verify.php (LIVE MID only).

    NOTE: verify.php does not work on sandbox MIDs; sandbox SUCCESS trusts the
    hash-verified callback. The v4 LIVE confirm scheme may differ — revisit when
    going LIVE.
    Returns {"status": <code|None>, "parsed": {...}} or {"error": ...}.
    """
    txn_date = today_ist().strftime("%Y-%m-%d")
    alldata = f"{settings.AIRPAY_MERCHANT_ID}{order_id}{txn_date}"
    payload = {
        "merchant_id": settings.AIRPAY_MERCHANT_ID,
        "merchant_txn_id": order_id,
        "private_key": _compute_privatekey(),
        "checksum": hashlib.sha256(
            f"{hashlib.sha256(f'{settings.AIRPAY_USERNAME}~:~{settings.AIRPAY_PASSWORD}'.encode()).hexdigest()}@{alldata}".encode()
        ).hexdigest(),
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
