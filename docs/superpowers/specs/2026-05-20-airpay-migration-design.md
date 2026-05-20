# Payment Gateway Migration: CCAvenue → Airpay

**Date:** 2026-05-20
**Status:** Approved (full swap, single branch)
**Author:** Claude Code + aryantuntune

## Goal

Replace the existing CCAvenue payment integration with **Airpay** (the company's
final, decided gateway). Remove all CCAvenue code. SabPaisa was never implemented
(only stale planning docs + long-renamed DB columns), so nothing to remove there.

## Context: what exists today

- `backend/app/services/ccavenue_service.py` — CCAvenue AES-128-CBC hosted checkout.
- `backend/app/routers/portal_payment.py` — create-order → redirect form → callback →
  verify → confirm booking + email; includes a simulation mode for dev/sandbox.
- `backend/app/models/payment_transaction.py` — **already gateway-agnostic**
  (`client_txn_id`, `gateway_txn_id`, `gateway_message`, `bank_name`, `raw_response`,
  `status`, `platform`). **No schema change needed.**
- Clients calling `/api/portal/payment/*`:
  - Web: `frontend/src/app/customer/dashboard/page.tsx`, `.../customer/history/[id]/page.tsx`
  - Mobile (Expo): `apps/customer/src/services/paymentService.ts`

Airpay's classic kit is also a **redirect/hosted-checkout with checksum**, structurally
identical to CCAvenue — so this is a *service swap*, not a flow rewrite.

## Airpay v3 "Simple Transaction" scheme (authoritative)

Source: Airpay's **current** API docs (sanctum.airpay.co.in `api_data.json`) — the
same spec the official Server-Side SDK implements. The 2018 WordPress kit used an
OUTDATED scheme (MD5 checksum); this v3 scheme supersedes it. Key reference content
saved at `docs/airpay-sdk/extract.txt`.

Credentials: `merchant_id`, `username`, `password`, `secret_key` are all used.
(`api_key` / `client_id` are not used by this redirect kit; kept in config.)

### Endpoints
- Pay (form POST):  `https://payments.airpay.co.in/pay/index.php`
- Server-side verify (PULL): `https://kraken.airpay.co.in/airpay/order/verify.php`
  — **LIVE merchant IDs only; does NOT work on sandbox.**
- Return URL + IPN URL are **configured with Airpay at onboarding** (emailed to
  techsupport@airpay.co.in), NOT sent per transaction.

### Key derivation
```
privatekey   = SHA256( secret + "@" + username + ":|:" + password )   # POSTed as a field
checksum_key = SHA256( username + "~:~" + password )
```

### Request checksum
```
date     = YYYY-MM-DD (Asia/Kolkata)
siindexvar = "" (empty unless subscription)
alldata  = buyerEmail + buyerFirstName + buyerLastName + buyerAddress + buyerCity
         + buyerState + buyerCountry + amount + orderid + UID + siindexvar + date
checksum = SHA256( checksum_key + "@" + alldata )
```
- `amount` formatted to 2 decimals, e.g. `"150.00"`.
- `UID` = merchant's unique user identifier (we use the portal user id).
- Airpay recomputes the checksum from the submitted field values, so we hash exactly
  the (sanitized) values we POST.

### Required form fields POSTed to pay/index.php
`mercid`, `orderid`, `amount`, `buyerEmail`, `buyerFirstName`, `buyerLastName`,
`buyerAddress`, `buyerCity`, `buyerState`, `buyerCountry`, `buyerPinCode`,
`buyerPhone`, `UID`, `kittype` (= `server_side_sdk`), `currency=356`,
`isocurrency=INR`, `privatekey`, `checksum`.

### Response (redirect + IPN) — JSON or form-encoded
Fields: `TRANSACTIONID` (our orderid), `APTRANSACTIONID`, `AMOUNT`,
`TRANSACTIONSTATUS`, `MESSAGE`, `MERCID`, `ap_SecureHash`, `CHMOD`, `TXN_MODE`
(`LIVE`/`TEST`), `CUSTOMERVPA` (UPI), `BANKNAME`, `CARDISSUER`, ...

Response hash (confirmed from docs):
```
ap_SecureHash = crc32( TRANSACTIONID : APTRANSACTIONID : AMOUNT : TRANSACTIONSTATUS
                       : MESSAGE : MID : USERNAME [ : CUSTOMERVPA if channel is UPI ] )
```
(`MID` = merchant id, as unsigned 32-bit int string.)

### Verify.php (PULL) checksum
```
alldata  = merchant_id + merchant_txn_id + processor_id + rrn + terminal_id + txn_type + date
           (unused parts empty)
checksum = SHA256( checksum_key + "@" + alldata )
fields: merchant_id, merchant_txn_id, private_key, checksum
```

### Success gating (SECURITY)
The response hash is a plain `crc32` (NOT secret-keyed) and is therefore forgeable.
- **LIVE** (`TXN_MODE != TEST`): mark SUCCESS only if verify.php also returns `200`
  (fail-closed; unconfirmed stays pending for a webhook/manual retry).
- **TEST/sandbox**: verify.php is unavailable, so trust the hash-verified callback
  (no real money). Plus amount-match and idempotency in all cases.

### Status codes
| Code | Meaning | Our status |
|------|---------|-----------|
| 200 | Success | SUCCESS |
| 211 | In Process | (stay INITIATED) |
| 400 | Failed | FAILED |
| 401 | Dropped | ABORTED |
| 402 | Cancel | ABORTED |
| 403 | Incomplete | (stay INITIATED) |
| 405 | Bounced | FAILED |
| 503 | No Records | FAILED |

## Design

### Backend
1. **`backend/app/services/airpay_service.py`** (new) — pure functions, fully unit-testable:
   - `is_configured()`
   - `generate_order_id(booking_id)`
   - `_sanitize(value)`
   - `build_payment_request(...)` → dict of form fields + target URL
   - `verify_response(form: dict)` → bool (crc32 hash check) + parsed dict
   - `confirm_order(order_id)` → async POST to verify.php, authoritative status
   - `map_status(code)` → "SUCCESS" | "FAILED" | "ABORTED" | "INITIATED"
2. **`backend/app/routers/portal_payment.py`** — swap `ccavenue_service` → `airpay_service`.
   Keep endpoint names/shapes. `create-order` returns `{ airpay_url, fields: {...}, order_id, simulated }`.
   `/callback`: verify hash → `confirm_order` → mark SUCCESS → confirm booking + email.
   Keep simulation mode, idempotency, amount-match. Add `/webhook` (IPN PUSH, same verify logic, idempotent).
3. **`backend/app/config.py`** — remove `CCAVENUE_*`; add
   `AIRPAY_MERCHANT_ID, AIRPAY_USERNAME, AIRPAY_PASSWORD, AIRPAY_SECRET_KEY,
   AIRPAY_API_KEY, AIRPAY_CLIENT_ID, AIRPAY_BASE_URL`. Keep `PAYMENT_SIMULATION`.
4. **Delete** `ccavenue_service.py`. Scrub CCAvenue from `main.py` API description.

### Config / secrets
- `.env.development` (gitignored) — real sandbox creds.
- `.env.example` (committed) — Airpay placeholders, no secrets.

### Clients
- Web `dashboard` + `history/[id]`: build the hidden form from `fields` dict instead of
  `encRequest`/`access_code`; POST to `airpay_url`.
- Mobile `paymentService.ts`: update `PaymentOrder` type; `/initiate/{order_id}` still
  serves the server-rendered auto-submit form.

### Tests
- `backend/tests/test_airpay_service.py` — assert privatekey, checksum, sanitize, and
  crc32 response-hash against the documented formulas (TDD).

## Open items / dependencies (Airpay side, not blocking the build)
- Merchant must register Domain `carferry.online`, Return URL
  `https://api.carferry.online/api/portal/payment/callback`, and IPN URL
  `https://api.carferry.online/api/portal/payment/webhook` with techsupport@airpay.co.in.
  (v3 does not POST these per-transaction — they must be whitelisted server-side.)
- Crypto formulas are now taken from Airpay's current official API docs (not guessed),
  so the request checksum / response hash should be correct. Still: run one sandbox
  transaction end-to-end to confirm before pointing live traffic at it.
- The official Server-Side SDK (`airpay_python_v3.zip`) and React Native SDK
  (`airpay_react_native_v3.zip`) live behind the merchant login at `ma.airpay.co.in`.
  We implement the documented scheme natively rather than vendoring the zip; if a
  sandbox transaction reveals any field/format mismatch, cross-check against that SDK.
- verify.php is LIVE-MID only — sandbox success relies on the hash-verified callback.
