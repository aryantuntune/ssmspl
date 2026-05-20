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

## Airpay classic-kit scheme (authoritative)

Source: Airpay's official WordPress integration kit (`checksum.php` + `index.php`).
Credential set used: `merchant_id`, `username`, `password`, `secret_key`.
(`api_key` / `client_id` are not used by the classic kit; stored in config for record.)

### Endpoints
- Pay (form POST):  `https://payments.airpay.co.in/pay/index.php`
- Server-side verify (PULL): `https://payments.airpay.co.in/order/verify.php` (port 443)

### Key derivation
```
privatekey = SHA256( secret_key + "@" + username + ":|:" + password )
```
(PHP: `encrypt($data,$salt) = hash('SHA256', $salt.'@'.$data)`, data=`username:|:password`, salt=`secret_key`.)

### Request checksum
```
alldata  = sanitize(buyerEmail) + sanitize(buyerFirstName) + sanitize(buyerLastName)
         + sanitize(buyerAddress) + sanitize(buyerCity) + sanitize(buyerState)
         + sanitize(buyerCountry) + sanitize(amount) + orderId
checksum = MD5( alldata + date("Y-m-d") + privatekey )
```
- `date("Y-m-d")` is in **Asia/Kolkata** timezone.
- `amount` formatted to 2 decimals, e.g. `"150.00"`.
- `orderId` is appended raw (not sanitized) in the kit.

### Form fields POSTed to pay/index.php
`merchantIdentifier`, `mercid`, `orderId`, `orderid`, `buyerEmail`, `buyerFirstName`,
`buyerLastName`, `buyerAddress`, `buyerCity`, `buyerState`, `buyerCountry`,
`buyerPincode`, `buyerPhone`, `txnType=1`, `purpose=1`, `productDescription`,
`txnDate=Y-m-d`, `currency=356`, `isocurrency=INR`, `amount`, `privatekey`,
`checksum`, `returnUrl` (our callback).

### sanitize() — strip these characters before hashing AND before submitting
`, # ( ) { } < > ` ! $ % ^ = + | \ : ' " ; ~ [ ] * &`

### Response (Airpay POSTs to returnUrl)
Fields: `TRANSACTIONID` (our orderid), `APTRANSACTIONID` (airpay id), `AMOUNT`,
`TRANSACTIONSTATUS`, `MESSAGE`, `ap_SecureHash`, `CHMOD`, `CUSTOMVAR`, `BANKNAME`,
`CARDISSUER`, `TRANSACTIONPAYMENTSTATUS`, `CURRENCYCODE`, `TRANSACTIONTIME`, ...

Verification (all three must hold for success):
```
ap_SecureHash == str(crc32( TRANSACTIONID + ":" + APTRANSACTIONID + ":" + AMOUNT
                            + ":" + TRANSACTIONSTATUS + ":" + MESSAGE
                            + ":" + mercid + ":" + username ) as unsigned 32-bit)
AMOUNT matches the stored transaction amount
TRANSACTIONSTATUS == "200"
```
Then **additionally** call `order/verify.php` server-side (Airpay best practice: do
not trust the redirect alone) before marking SUCCESS.

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
- Confirm whether a separate sandbox host was issued (classic kit normally reuses
  `payments.airpay.co.in` with a test merchant account).
- Exact byte-level checksum to be validated against a live sandbox transaction before go-live.
