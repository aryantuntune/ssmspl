"""
CCAvenue payment gateway — hosted checkout via AES-128-CBC encrypted form POST.

Flow:
  1. build_payment_request() → encrypts key=value& payload, returns form data
  2. Frontend POSTs form with encRequest + access_code to CCAvenue transaction URL
  3. CCAvenue POSTs encrypted response (encResp) to redirect_url / cancel_url
  4. decrypt_response() → decrypts key=value& response, returns parsed dict
"""

import hashlib
import logging
import time
import uuid

from app.config import settings

logger = logging.getLogger("ssmspl.ccavenue")

# Fixed IV per CCAvenue spec
_IV = bytes(range(16))  # 0x00, 0x01, 0x02, ... 0x0f


def is_configured() -> bool:
    return bool(
        settings.CCAVENUE_MERCHANT_ID
        and settings.CCAVENUE_ACCESS_CODE
        and settings.CCAVENUE_WORKING_KEY
    )


def _get_crypto():
    """Lazy import pycryptodome — only needed when CCAvenue is actually configured."""
    from Crypto.Cipher import AES
    from Crypto.Util.Padding import pad, unpad
    return AES, pad, unpad


def _derive_key() -> bytes:
    """Derive AES-128 key as MD5 hash of the working key."""
    return hashlib.md5(settings.CCAVENUE_WORKING_KEY.encode("utf-8")).digest()


def _encrypt(plaintext: str) -> str:
    """AES-128-CBC encrypt, PKCS7 pad, return lowercase hex string."""
    AES, pad, _ = _get_crypto()
    key = _derive_key()
    cipher = AES.new(key, AES.MODE_CBC, _IV)
    padded = pad(plaintext.encode("utf-8"), AES.block_size)
    encrypted = cipher.encrypt(padded)
    return encrypted.hex()


def _decrypt(hex_string: str) -> str:
    """Decode hex, AES-128-CBC decrypt, PKCS7 unpad."""
    AES, _, unpad = _get_crypto()
    key = _derive_key()
    cipher = AES.new(key, AES.MODE_CBC, _IV)
    decoded = bytes.fromhex(hex_string)
    decrypted = unpad(cipher.decrypt(decoded), AES.block_size)
    return decrypted.decode("utf-8")


def generate_order_id(booking_id: int) -> str:
    return f"SSMSPL_{booking_id}_{int(time.time())}_{uuid.uuid4().hex[:6]}"


def build_payment_request(
    *,
    order_id: str,
    amount: float,
    currency: str = "INR",
    billing_name: str,
    billing_email: str,
    billing_tel: str,
    redirect_url: str,
    cancel_url: str,
    merchant_param1: str = "",
) -> dict:
    """
    Build encrypted payment request for CCAvenue hosted checkout.

    Returns dict with:
      - ccavenue_url: form POST target URL
      - enc_request: encrypted payload (hex string)
      - access_code: to be sent as separate form field
      - order_id: for tracking
    """
    if not is_configured():
        raise RuntimeError("CCAvenue not configured")

    # Build key=value& payload per CCAvenue spec
    params = {
        "merchant_id": settings.CCAVENUE_MERCHANT_ID,
        "order_id": order_id,
        "currency": currency,
        "amount": f"{amount:.2f}",
        "redirect_url": redirect_url,
        "cancel_url": cancel_url,
        "language": "EN",
        "billing_name": billing_name.strip(),
        "billing_email": billing_email.strip(),
        "billing_tel": billing_tel.strip(),
    }

    if merchant_param1:
        params["merchant_param1"] = merchant_param1

    plaintext = "&".join(f"{k}={v}" for k, v in params.items())
    enc_request = _encrypt(plaintext)

    base = settings.CCAVENUE_BASE_URL.rstrip("/")
    ccavenue_url = f"{base}/transaction/transaction.do?command=initiateTransaction"

    return {
        "ccavenue_url": ccavenue_url,
        "enc_request": enc_request,
        "access_code": settings.CCAVENUE_ACCESS_CODE,
        "order_id": order_id,
    }


def decrypt_response(enc_resp: str) -> dict:
    """
    Decrypt CCAvenue callback response.

    CCAvenue POSTs back with `encResp` parameter containing hex-encoded
    encrypted string. Decrypted format is key=value& pairs.

    Returns dict with all parsed fields.
    """
    try:
        decrypted = _decrypt(enc_resp)
    except Exception as e:
        logger.error("Failed to decrypt CCAvenue response: %s", e)
        return {"order_status": "DECRYPT_ERROR", "error": str(e)}

    logger.info("CCAvenue response decrypted successfully")

    # Parse key=value& pairs
    result = {}
    for pair in decrypted.split("&"):
        if "=" in pair:
            key, _, value = pair.partition("=")
            result[key.strip()] = value.strip()

    return result


def is_payment_successful(order_status: str) -> bool:
    """Check if order_status indicates success."""
    return order_status == "Success"
