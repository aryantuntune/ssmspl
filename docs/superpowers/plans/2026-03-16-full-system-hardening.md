# Full-System Security Hardening Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the SSMSPL ferry ticketing system against all identified security vulnerabilities across backend, frontend, mobile app, and deployment configuration.

**Architecture:** Apply defense-in-depth fixes in priority order — race conditions, IDOR, auth gaps, input validation, headers, mobile storage. Payment simulation mode is left as-is (queries logged in `analysis_issues/payment_issues.md`).

**Dependencies:** Most tasks are independent, but: Task 19 depends on Task 2 (capacity column must exist first). Task 5's payment_transactions constraint depends on Task 3. Multiple Alembic migrations (Tasks 2, 4, 8) must be generated sequentially to avoid head conflicts.

**Tech Stack:** Python 3.12 / FastAPI / SQLAlchemy 2.0 async / PostgreSQL 16 / Next.js 16 / React Native (Expo) / Docker / Nginx

**Scope exclusions:**
- Payment simulation toggle (PAY-01) — left enabled per project decision
- Payment endpoint auth (PAY-Q1 through PAY-Q4) — logged as queries in `analysis_issues/payment_issues.md`
- RS256 JWT migration — acceptable for monolith, not needed now

---

## Chunk 1: Backend Race Conditions & Data Integrity

### Task 1: Add advisory lock to ticket ID generation

**Files:**
- Modify: `backend/app/services/ticket_service.py:567` (ticket ID), `:590` (item ID), `:612` (payment ID), `:686` (update path)

The booking service already uses `pg_advisory_xact_lock` (line 473) but ticket service does not. This causes duplicate ticket IDs under concurrent requests.

- [ ] **Step 1: Add advisory lock before ticket ID generation**

In `ticket_service.py`, add lock before the `select(func.coalesce(func.max(Ticket.id), 0))` call at line 567:

```python
# Before line 567, add:
await db.execute(text("SELECT pg_advisory_xact_lock(hashtext('tickets_id'))"))
```

- [ ] **Step 2: Add advisory lock before ticket item ID generation**

Same pattern before line 590:

```python
# Before line 590, add:
await db.execute(text("SELECT pg_advisory_xact_lock(hashtext('ticket_items_id'))"))
```

- [ ] **Step 3: Add advisory lock before ticket payment ID generation**

Same pattern before line 612 (note: table is named `ticket_payement` in the codebase):

```python
# Before line 612, add:
await db.execute(text("SELECT pg_advisory_xact_lock(hashtext('ticket_payement_id'))"))
```

- [ ] **Step 4: Also add advisory lock in the update path (line 686)**

In `update_ticket()`, the new item ID generation at line 686 also needs a lock:

```python
# Before line 686, add:
await db.execute(text("SELECT pg_advisory_xact_lock(hashtext('ticket_items_id'))"))
```

- [ ] **Step 5: Verify `text` is already imported**

Check line 7: `from sqlalchemy import select, func, or_, text` — `text` is already imported. Good.

- [ ] **Step 6: Test manually**

Run: `cd backend && python -m pytest tests/ -v -k ticket` (if ticket tests exist)
Otherwise, start dev server and create a ticket to verify no regressions.

- [ ] **Step 7: Commit**

```bash
git add backend/app/services/ticket_service.py
git commit -m "fix: add advisory locks to ticket ID generation to prevent race conditions"
```

---

### Task 2: Add capacity column to ferry_schedules

**Files:**
- Modify: `backend/scripts/ddl.sql:124-132`
- Modify: `backend/app/models/ferry_schedule.py:11-13`
- Create: `backend/alembic/versions/xxxx_add_ferry_schedule_capacity.py` (via alembic autogenerate)

The `_check_capacity()` function in `booking_service.py:139` references `schedule.capacity` but neither the DDL nor the model has this column.

- [ ] **Step 1: Add capacity to the SQLAlchemy model**

In `backend/app/models/ferry_schedule.py`, add after line 13:

```python
capacity: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
```

- [ ] **Step 2: Add capacity to DDL**

In `backend/scripts/ddl.sql`, change the `ferry_schedules` table definition (line 124-132) to add between `departure` and `created_at`:

```sql
capacity            INTEGER NOT NULL DEFAULT 0,
```

- [ ] **Step 3: Generate Alembic migration**

```bash
cd backend
alembic revision --autogenerate -m "add capacity column to ferry_schedules"
```

Review the generated migration, then:

```bash
alembic upgrade head
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/ferry_schedule.py backend/scripts/ddl.sql backend/alembic/versions/
git commit -m "feat: add capacity column to ferry_schedules table"
```

---

### Task 3: Add payment_transactions table to DDL

**Files:**
- Modify: `backend/scripts/ddl.sql` (add after bookings/booking_items tables)

The `PaymentTransaction` model exists (`backend/app/models/payment_transaction.py`) but there's no DDL definition. The table is likely auto-created by Alembic but should be in the canonical DDL.

- [ ] **Step 1: Add payment_transactions CREATE TABLE to DDL**

Add after the booking_items table definition in `ddl.sql`:

```sql
-- Payment transactions table (CCAvenue / simulation payments)
CREATE TABLE IF NOT EXISTS payment_transactions (
    id                  BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
    booking_id          BIGINT NOT NULL REFERENCES bookings(id),
    client_txn_id       VARCHAR(64) NOT NULL UNIQUE,
    gateway_txn_id      VARCHAR(64),
    amount              NUMERIC(9,2) NOT NULL,
    status              VARCHAR(20) NOT NULL DEFAULT 'INITIATED',
    payment_mode        VARCHAR(30),
    bank_name           VARCHAR(100),
    gateway_message     VARCHAR(255),
    raw_response        TEXT,
    platform            VARCHAR(10) NOT NULL DEFAULT 'web',
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_payment_transactions_booking_id ON payment_transactions(booking_id);
CREATE INDEX IF NOT EXISTS idx_payment_transactions_client_txn_id ON payment_transactions(client_txn_id);
```

- [ ] **Step 2: Commit**

```bash
git add backend/scripts/ddl.sql
git commit -m "fix: add payment_transactions table definition to DDL"
```

---

### Task 4: Add UNIQUE constraint on verification_code columns

**Files:**
- Modify: `backend/scripts/ddl.sql` (tickets and bookings tables)

Both tickets (line 196) and bookings (line 285) have `verification_code UUID` without UNIQUE constraint. QR codes must be unique for verification integrity.

- [ ] **Step 1: Add unique constraints to DDL**

Add after the tickets table definition:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_tickets_verification_code ON tickets(verification_code) WHERE verification_code IS NOT NULL;
```

Add after the bookings table definition:

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_verification_code ON bookings(verification_code) WHERE verification_code IS NOT NULL;
```

- [ ] **Step 2: Add to SQLAlchemy models**

In `backend/app/models/ticket.py`, update the `verification_code` mapped_column to add `unique=True`.

In `backend/app/models/booking.py`, update the `verification_code` mapped_column to add `unique=True`.

- [ ] **Step 3: Generate Alembic migration**

```bash
cd backend
alembic revision --autogenerate -m "add unique constraint on verification_code"
alembic upgrade head
```

- [ ] **Step 4: Commit**

```bash
git add backend/scripts/ddl.sql backend/app/models/ticket.py backend/app/models/booking.py backend/alembic/versions/
git commit -m "fix: add UNIQUE constraint on verification_code columns"
```

---

### Task 5: Add CHECK constraints on status fields

**Depends on:** Task 3 (payment_transactions table must exist for its CHECK constraint)

**Files:**
- Modify: `backend/scripts/ddl.sql` (add as PATCH section — cannot modify existing CREATE TABLE IF NOT EXISTS on a live DB)

Status fields are `VARCHAR(20)` with no CHECK constraint, allowing arbitrary values. Use `ALTER TABLE` patches following the existing convention in DDL (see lines 357-408 for the PATCH pattern).

- [ ] **Step 1: Add CHECK constraints as PATCH section at end of DDL**

Append to `ddl.sql` following the existing PATCH convention:

```sql
-- ============================================================
-- PATCH: Add CHECK constraints on status fields
-- ============================================================

ALTER TABLE tickets DROP CONSTRAINT IF EXISTS ticket_status_check;
ALTER TABLE tickets ADD CONSTRAINT ticket_status_check
    CHECK (status IN ('CONFIRMED', 'CANCELLED', 'VERIFIED'));

ALTER TABLE bookings DROP CONSTRAINT IF EXISTS booking_status_check;
ALTER TABLE bookings ADD CONSTRAINT booking_status_check
    CHECK (status IN ('PENDING', 'CONFIRMED', 'CANCELLED', 'VERIFIED'));

ALTER TABLE payment_transactions DROP CONSTRAINT IF EXISTS payment_txn_status_check;
ALTER TABLE payment_transactions ADD CONSTRAINT payment_txn_status_check
    CHECK (status IN ('INITIATED', 'SUCCESS', 'FAILED', 'ABORTED'));
```

- [ ] **Step 2: Commit**

```bash
git add backend/scripts/ddl.sql
git commit -m "fix: add CHECK constraints on status fields for data integrity"
```

---

## Chunk 2: Backend Auth & Authorization Hardening

### Task 6: Add rate limiting to verification endpoints

**Files:**
- Modify: `backend/app/routers/verification.py:21-119`

All 5 verification endpoints have zero rate limiting. The check-in endpoint is especially critical — brute-forcing verification codes could allow unauthorized check-ins.

- [ ] **Step 1: Import limiter**

Add to imports at top of `verification.py`:

```python
from app.middleware.rate_limit import limiter
```

Also add `Request` to the fastapi import if not present:

```python
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
```

- [ ] **Step 2: Add rate limits to each endpoint**

Add `@limiter.limit("30/minute")` decorator before each endpoint function, and add `request: Request` as the first parameter of each function signature.

For the `check_in` endpoint specifically, use a stricter limit: `@limiter.limit("15/minute")`.

The 5 endpoints to modify:
- `lookup_booking` (line 28): `@limiter.limit("30/minute")`
- `scan_qr` (line 47): `@limiter.limit("30/minute")`
- `check_in` (line 82): `@limiter.limit("15/minute")`
- `lookup_booking_by_number` (line 97): `@limiter.limit("30/minute")`
- `lookup_ticket` (line 113): `@limiter.limit("30/minute")`

- [ ] **Step 3: Test that the import works**

```bash
cd backend && python -c "from app.middleware.rate_limit import limiter; print('OK')"
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/verification.py
git commit -m "fix: add rate limiting to all verification endpoints"
```

---

### Task 7: Add route-scope check to admin_reset_password

**Files:**
- Modify: `backend/app/services/user_service.py:304-334`

A MANAGER or ADMIN can currently reset any user's password, even users on different routes. Only SUPER_ADMIN should have cross-route access.

- [ ] **Step 1: Add route-scope validation**

After line 321 (the SUPER_ADMIN check), add:

```python
# Non-SUPER_ADMIN admins can only reset passwords for users on their assigned route
if admin_user.role != UserRole.SUPER_ADMIN:
    if admin_user.route_id and user.route_id and admin_user.route_id != user.route_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied. Cannot reset password for users on a different route.",
        )
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/user_service.py
git commit -m "fix: enforce route-scope check on admin password reset (IDOR)"
```

---

### Task 8: Add account lockout after failed login attempts

**Files:**
- Modify: `backend/app/models/user.py` (add `failed_login_attempts` and `locked_until` fields)
- Modify: `backend/app/services/auth_service.py` (add lockout logic)
- Modify: `backend/scripts/ddl.sql` (add columns to users table)

Currently only IP-based rate limiting exists (10/min). Account-level lockout prevents targeted brute force.

- [ ] **Step 1: Add lockout fields to User model**

In `backend/app/models/user.py`, add:

```python
failed_login_attempts: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
```

- [ ] **Step 2: Add columns to DDL**

In `backend/scripts/ddl.sql`, add to the users table:

```sql
failed_login_attempts INTEGER NOT NULL DEFAULT 0,
locked_until          TIMESTAMPTZ,
```

- [ ] **Step 3: Rewrite authenticate_user and login to add lockout logic**

The current `authenticate_user` (line 13-18) returns `User | None` and the `login` function (line 31-53) raises on None. The lockout logic must be woven into both functions. **Replace the entire `authenticate_user` function** with:

```python
MAX_FAILED_ATTEMPTS = 5
LOCKOUT_DURATION_MINUTES = 15

async def authenticate_user(db: AsyncSession, username: str, password: str) -> User | None:
    # Look up user (include inactive for lockout tracking — login will reject inactive)
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        return None

    # Check lockout
    if user.locked_until and user.locked_until > datetime.now(timezone.utc):
        return None  # login() will raise generic error — don't reveal lockout to caller

    if not user.is_active:
        return None

    if not verify_password(password, user.hashed_password):
        # Increment failed attempts
        user.failed_login_attempts = (user.failed_login_attempts or 0) + 1
        if user.failed_login_attempts >= MAX_FAILED_ATTEMPTS:
            user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        await db.flush()
        return None

    # Successful auth — reset lockout counters
    user.failed_login_attempts = 0
    user.locked_until = None
    return user
```

Note: `datetime`, `timedelta`, `timezone` are already imported at line 2 of `auth_service.py`.

The `login()` function at line 31 does NOT need changes — it already raises 401 when `authenticate_user` returns None. The generic "Incorrect username or password" message avoids revealing whether the account is locked.

- [ ] **Step 4: Generate Alembic migration**

```bash
cd backend
alembic revision --autogenerate -m "add account lockout fields to users"
alembic upgrade head
```

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/user.py backend/app/services/auth_service.py backend/scripts/ddl.sql backend/alembic/versions/
git commit -m "feat: add account lockout after 5 failed login attempts"
```

---

## Chunk 3: Deployment & Infrastructure Hardening

### Task 9: Fix gunicorn forwarded_allow_ips

**Files:**
- Modify: `backend/gunicorn.conf.py:32`

`forwarded_allow_ips = "*"` trusts X-Forwarded-For from any source, enabling IP spoofing to bypass rate limiting.

- [ ] **Step 1: Restrict to Docker network**

**Important:** Gunicorn's `forwarded_allow_ips` does NOT support CIDR notation — only comma-separated IP addresses or `*`. Since the production Docker Compose uses an internal network where only nginx forwards to gunicorn, and the nginx container's IP is dynamic, the best approach is to use an environment variable with a documented comment.

Change line 32 from:

```python
forwarded_allow_ips = "*"
```

to:

```python
import os

# Trust proxy headers only from known reverse proxies.
# In Docker: nginx is the only service forwarding to gunicorn on the 'internal' network.
# The Docker internal network is isolated (not exposed to the host), so trusting all
# IPs within it is acceptable. If deploying outside Docker, set FORWARDED_ALLOW_IPS
# to the specific nginx IP address(es).
forwarded_allow_ips = os.environ.get("FORWARDED_ALLOW_IPS", "*")
```

Then in `docker-compose.prod.yml`, under the backend service environment, add:

```yaml
FORWARDED_ALLOW_IPS: "*"  # Docker internal network only — nginx is the sole proxy
```

This documents the decision explicitly. The Docker internal network (`ssmspl_internal`) is already isolated — only nginx is exposed on ports 80/443. The `*` is safe in this topology but should be overridden if deploying outside Docker.

- [ ] **Step 2: Commit**

```bash
git add backend/gunicorn.conf.py docker-compose.prod.yml
git commit -m "fix: make gunicorn forwarded_allow_ips configurable via env var with documented rationale"
```

---

### Task 10: Add X-XSS-Protection and X-Permitted-Cross-Domain-Policies headers

**Files:**
- Modify: `backend/app/middleware/security.py:18-25`

Missing defense-in-depth headers.

- [ ] **Step 1: Add headers**

After line 25 (`response.headers["Server"] = ""`), add:

```python
response.headers["X-XSS-Protection"] = "0"
response.headers["X-Permitted-Cross-Domain-Policies"] = "none"
```

Note: `X-XSS-Protection: 0` is the modern recommendation — it disables the legacy XSS auditor which can itself cause vulnerabilities.

- [ ] **Step 2: Commit**

```bash
git add backend/app/middleware/security.py
git commit -m "fix: add X-XSS-Protection and X-Permitted-Cross-Domain-Policies headers"
```

---

### Task 11: Tighten frontend CSP — remove unsafe-eval

**Files:**
- Modify: `frontend/next.config.ts:17-28`

`'unsafe-eval'` in script-src defeats most of CSP's XSS protection. Next.js does NOT require `unsafe-eval` in production (it's only needed for `next dev` hot reload).

- [ ] **Step 1: Remove unsafe-eval from CSP**

Change line 20 from:

```typescript
"script-src 'self' 'unsafe-inline' 'unsafe-eval'",
```

to:

```typescript
"script-src 'self' 'unsafe-inline'",
```

Note: `'unsafe-inline'` is still needed for Next.js inline scripts. In a future iteration, consider using nonces.

- [ ] **Step 2: Build and verify**

```bash
cd frontend && npm run build
```

If the build fails with CSP errors, adjust accordingly.

- [ ] **Step 3: Commit**

```bash
git add frontend/next.config.ts
git commit -m "fix: remove unsafe-eval from frontend CSP — not needed in production"
```

---

### Task 12: Add SECRET_KEY length validation on startup

**Files:**
- Modify: `backend/app/config.py`

No validation that SECRET_KEY is strong enough. A weak key compromises all JWT tokens.

- [ ] **Step 1: Add a validator to the Settings class**

Add a Pydantic validator in the Settings class:

```python
from pydantic import field_validator

@field_validator("SECRET_KEY")
@classmethod
def secret_key_must_be_strong(cls, v: str) -> str:
    if len(v) < 32:
        raise ValueError("SECRET_KEY must be at least 32 characters")
    return v
```

- [ ] **Step 2: Verify dev key meets the requirement**

Check `.env.development`: `SECRET_KEY=dev_secret_key_replace_in_production` — 39 chars, passes.

- [ ] **Step 3: Commit**

```bash
git add backend/app/config.py
git commit -m "fix: validate SECRET_KEY length >= 32 on startup"
```

---

## Chunk 4: Mobile App Hardening

### Task 13: Remove AsyncStorage token fallback — fail securely

**Files:**
- Modify: `apps/checker/src/services/storageService.ts:26-52`

Tokens must never fall back to plaintext AsyncStorage. If SecureStore fails, the app should force re-login.

- [ ] **Step 1: Remove fallback from getAccessToken**

Change `getAccessToken` (lines 26-33) to:

```typescript
export async function getAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
  } catch {
    logger.error('SecureStore read failed — tokens inaccessible');
    return null;
  }
}
```

- [ ] **Step 2: Remove fallback from getRefreshToken**

Change `getRefreshToken` (lines 35-41) to:

```typescript
export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
  } catch {
    logger.error('SecureStore read failed — tokens inaccessible');
    return null;
  }
}
```

- [ ] **Step 3: Remove fallback from setTokens**

Change `setTokens` (lines 43-52) to:

```typescript
export async function setTokens(access: string, refresh: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, access);
    await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, refresh);
  } catch (e) {
    logger.error('SecureStore write failed — cannot store tokens securely');
    throw e; // Force login flow to handle the error
  }
}
```

- [ ] **Step 4: Clean up clearTokens to not check AsyncStorage**

Change `clearTokens` (lines 54-63) to:

```typescript
export async function clearTokens(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN);
    await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
  } catch {
    // Best-effort cleanup
  }
  // Also clean up any legacy AsyncStorage tokens from older versions
  await AsyncStorage.removeItem(KEYS.ACCESS_TOKEN);
  await AsyncStorage.removeItem(KEYS.REFRESH_TOKEN);
}
```

- [ ] **Step 5: Commit**

```bash
git add apps/checker/src/services/storageService.ts
git commit -m "fix: remove insecure AsyncStorage token fallback — fail to re-login instead"
```

---

### Task 14: Add QR payload validation before API call

**Files:**
- Modify: `apps/checker/src/screens/QRScannerScreen.tsx` (wherever `handleBarCodeScanned` dispatches)
- Modify: `apps/checker/src/screens/HomeScreen.tsx:98-107` (manual entry)

Raw QR data and unbounded manual entry numbers are sent to the API without validation.

- [ ] **Step 1: Add QR payload validation**

In `QRScannerScreen.tsx`, before dispatching `scanQR(data)`, add validation:

```typescript
// Validate QR payload format and length
if (!data || data.length > 500) {
  Alert.alert('Invalid QR', 'QR code data is invalid or too large.');
  return;
}
```

- [ ] **Step 2: Add upper bound to manual entry**

In `HomeScreen.tsx`, after the `num <= 0` check (line 102), add:

```typescript
if (num > 999999) {
  Alert.alert('Invalid', 'Number is too large. Please enter a valid number.');
  return;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/checker/src/screens/QRScannerScreen.tsx apps/checker/src/screens/HomeScreen.tsx
git commit -m "fix: add input validation for QR payloads and manual entry bounds"
```

---

### Task 15: Remove unnecessary RECORD_AUDIO permission

**Files:**
- Modify: `apps/checker/app.json`

The checker app requests `android.permission.RECORD_AUDIO` which is unnecessary for QR scanning. Privacy concern.

- [ ] **Step 1: Remove RECORD_AUDIO from permissions array**

In `app.json`, find the Android permissions array and remove `"android.permission.RECORD_AUDIO"`.

- [ ] **Step 2: Commit**

```bash
git add apps/checker/app.json
git commit -m "fix: remove unnecessary RECORD_AUDIO permission from checker app"
```

---

## Chunk 5: Frontend Hardening

### Task 16: Remove console.error statements from production dashboard

**Files:**
- Modify: `frontend/src/app/dashboard/page.tsx:189, 219`

Console errors can leak information in production browser DevTools.

- [ ] **Step 1: Remove or gate console.error calls**

Replace bare `console.error(...)` calls with conditional logging:

At line 189, change:
```typescript
console.error("Dashboard data fetch error:", err);
```
to simply remove the line (the error is already handled by the catch block).

Same at line 219:
```typescript
console.error("Revenue fetch error:", err);
```
Remove or replace with a no-op.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/app/dashboard/page.tsx
git commit -m "fix: remove console.error statements from production dashboard"
```

---

### Task 17: Add redirect param support with validation to login pages

**Files:**
- Modify: `frontend/src/app/login/page.tsx`
- Modify: `frontend/src/app/customer/login/page.tsx` (if applicable)

**Note:** The middleware at `frontend/src/middleware.ts:19` sets a `redirect` query param when redirecting unauthenticated users to login, but the login pages currently IGNORE this param and always push to `/dashboard`. This is a UX improvement (redirect back to original page after login) combined with a security guardrail (validate the redirect target).

**No current vulnerability exists** — the param is set but never consumed. This task adds the consumption with proper validation.

- [ ] **Step 1: Read the login page to find where router.push("/dashboard") is called**

In `frontend/src/app/login/page.tsx`, find the `router.push("/dashboard")` call after successful login.

- [ ] **Step 2: Replace hardcoded redirect with validated param**

Replace the `router.push("/dashboard")` with:

```typescript
const searchParams = useSearchParams();
// ... (inside success handler):
const redirect = searchParams.get("redirect");
const safePath = redirect && redirect.startsWith("/") && !redirect.startsWith("//")
  ? redirect
  : "/dashboard";
router.push(safePath);
```

Apply same pattern to customer login page (using `/customer/dashboard` as the default).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/login/page.tsx frontend/src/app/customer/login/page.tsx
git commit -m "feat: honor redirect param after login with open-redirect validation"
```

---

## Chunk 6: Multi-Ticket Atomicity & Booking Hardening

### Task 18: Make multi-ticket creation atomic

**Files:**
- Modify: `backend/app/services/ticket_service.py:400-431`

Currently `create_multi_tickets()` calls `create_ticket()` in a loop. If one fails mid-way, some tickets are created and some aren't.

- [ ] **Step 1: Wrap in savepoint**

Change `create_multi_tickets` to use a savepoint:

```python
async def create_multi_tickets(db: AsyncSession, data, user, branch_id: int | None = None) -> list[dict]:
    # ... existing validation code ...

    # Validate off-hours
    await _validate_off_hours(db, branch_id)

    # Create all tickets within a savepoint for atomicity
    created_tickets = []
    try:
        for ticket_data in data.tickets:
            result = await create_ticket(db, ticket_data, user_id=user.id)
            created_tickets.append(result)
    except Exception:
        # If any ticket fails, the entire transaction rolls back
        # because we're already inside a DB session transaction
        raise

    return created_tickets
```

The key insight: since `get_db()` yields a session that auto-commits on success and rolls back on exception, if any `create_ticket()` call raises, the entire transaction (all tickets) rolls back. The current code already has this behavior by virtue of the session management. But we should verify no intermediate `await db.commit()` happens inside `create_ticket()`.

Verify that `create_ticket()` only calls `await db.flush()` (line 633), NOT `await db.commit()`. If it calls flush, it's fine — flush writes to the transaction buffer but doesn't commit. The commit happens at the session level in `get_db()`.

**If `create_ticket` is confirmed to use only `flush`**: The current code is already atomic. Document this with a comment:

```python
# All tickets are created within the same DB transaction (get_db session).
# create_ticket() uses flush(), not commit(), so if any fails, ALL roll back.
created_tickets = []
for ticket_data in data.tickets:
    result = await create_ticket(db, ticket_data, user_id=user.id)
    created_tickets.append(result)
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/ticket_service.py
git commit -m "docs: clarify multi-ticket creation atomicity via transaction scope"
```

---

### Task 19: Add booking capacity call to create_booking flow

**Depends on:** Task 2 (capacity column must exist on ferry_schedules for `_check_capacity()` to work without crashing)

**Files:**
- Modify: `backend/app/services/booking_service.py`

The `_check_capacity()` function exists (line 116) but is never called during booking creation.

- [ ] **Step 1: Add capacity check before booking creation**

In the `create_booking()` function, after departure time resolution (after the travel_date/departure validation, before the branch lock at line 466), add:

```python
# Check capacity before creating booking
await _check_capacity(db, data.from_branch_id, data.travel_date, departure_time)
```

Note: This check has a TOCTOU race (check then act), but combined with the advisory lock on booking IDs, the window is small. For stronger guarantees, consider doing the check inside the advisory lock scope. For now, this is acceptable since the capacity check + advisory lock provide reasonable protection.

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/booking_service.py
git commit -m "fix: call _check_capacity during booking creation to prevent overbooking"
```

---

## Chunk 7: Remaining Hardening Items

### Task 20: Add rate limiting to data listing endpoints

**Files:**
- Modify: `backend/app/routers/users.py` (user listing)
- Modify: `backend/app/routers/tickets.py` (ticket listing)
- Modify: `backend/app/routers/reports.py` (report endpoints)

These endpoints allow unlimited enumeration of sensitive data.

- [ ] **Step 1: Add rate limiting to user listing**

In `backend/app/routers/users.py`, import limiter and add `@limiter.limit("30/minute")` to the `GET /api/users/` endpoint. Add `request: Request` as a parameter.

- [ ] **Step 2: Add rate limiting to ticket listing**

In `backend/app/routers/tickets.py`, add `@limiter.limit("30/minute")` to the `GET /api/tickets/` endpoint.

- [ ] **Step 3: Add rate limiting to report endpoints**

In `backend/app/routers/reports.py`, add `@limiter.limit("10/minute")` to all report generation endpoints (they're more expensive).

- [ ] **Step 4: Commit**

```bash
git add backend/app/routers/users.py backend/app/routers/tickets.py backend/app/routers/reports.py
git commit -m "fix: add rate limiting to data listing and report endpoints"
```

---

### Task 21: Harden OTP expiration enforcement

**Files:**
- Modify: `backend/app/services/portal_auth_service.py` (registration, resend, forgot-password flows)

Verify that the OTP service already enforces expiration. If not, add explicit time-window validation.

- [ ] **Step 1: Read the OTP service**

Read `backend/app/services/otp_service.py` (or wherever OTP creation/verification lives) to confirm:
- OTP has an `expires_at` field
- Verification checks `expires_at > now()`
- Maximum attempts are enforced

- [ ] **Step 2: If expiration is NOT enforced, add it**

The email_otps table in DDL (line 174) has `expires_at TIMESTAMPTZ`. Verify the verification function checks this. If not, add:

```python
if otp_record.expires_at < datetime.now(timezone.utc):
    raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/otp_service.py
git commit -m "fix: enforce OTP expiration in verification flow"
```

---

### Task 22: Add password field exclusion guards to schemas

**Files:**
- Modify: `backend/app/schemas/user.py`
- Modify: `backend/app/schemas/portal_user.py`

While the current schemas don't explicitly include password fields, adding explicit exclusion prevents accidental future exposure.

- [ ] **Step 1: Verify UserRead schema**

Read `backend/app/schemas/user.py` — confirm `UserRead` does NOT include `hashed_password`. If using `model_config = ConfigDict(from_attributes=True)`, Pydantic will only serialize fields listed in the schema. Since `hashed_password` is not a field on `UserRead`, it won't be serialized. This is safe.

- [ ] **Step 2: Verify PortalUserRead schema**

Same check for `PortalUserRead` in `backend/app/schemas/portal_user.py`. If `password` is not a field on the schema, it won't be serialized.

- [ ] **Step 3: Add a comment as a guardrail**

Add a comment above each Read schema:

```python
# SECURITY: Do NOT add hashed_password to this schema — it must never be serialized
class UserRead(BaseModel):
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/schemas/user.py backend/app/schemas/portal_user.py
git commit -m "docs: add security guardrail comments to response schemas re password fields"
```

---

### Task 23: Add Redis password in production Docker compose

**Files:**
- Modify: `docker-compose.prod.yml`

Redis runs without authentication within the Docker network.

- [ ] **Step 1: Add requirepass to Redis**

In `docker-compose.prod.yml`, change the Redis command to include a password:

```yaml
command: redis-server --maxmemory 64mb --maxmemory-policy allkeys-lru --requirepass ${REDIS_PASSWORD:-ssmspl_redis_prod}
```

And update ALL Redis connection URLs in the backend service environment. The production compose uses `RATE_LIMIT_STORAGE_URI` (not `REDIS_URL`). Update both if present:

```yaml
RATE_LIMIT_STORAGE_URI: redis://:${REDIS_PASSWORD:-ssmspl_redis_prod}@redis:6379/1
```

Also check if there are other Redis URL env vars (e.g., `REDIS_URL`) and update them too.

- [ ] **Step 2: Commit**

```bash
git add docker-compose.prod.yml
git commit -m "fix: add Redis authentication in production Docker compose"
```

---

### Task 24: Pin Docker image versions to patch level

**Files:**
- Modify: `docker-compose.yml` and `docker-compose.prod.yml`

Unpinned versions can pull breaking changes or vulnerable patches.

- [ ] **Step 1: Pin versions**

Change:
- `postgres:16-alpine` → `postgres:16.6-alpine`
- `redis:7-alpine` → `redis:7.4-alpine`
- `nginx:alpine` → `nginx:1.27-alpine`
- `node:20-alpine` → `node:20.18-alpine`
- `python:3.12-slim` → `python:3.12.8-slim`

Apply to both compose files and any Dockerfiles that reference these.

- [ ] **Step 2: Commit**

```bash
git add docker-compose.yml docker-compose.prod.yml frontend/Dockerfile backend/Dockerfile
git commit -m "fix: pin Docker image versions to specific patch levels"
```

---

## Summary of All Tasks

| Task | Area | Severity | Description |
|------|------|----------|-------------|
| 1 | Backend | CRITICAL | Advisory locks on ticket ID generation |
| 2 | Backend/DB | CRITICAL | Add capacity column to ferry_schedules |
| 3 | DB | CRITICAL | Add payment_transactions table to DDL |
| 4 | DB | MEDIUM | UNIQUE constraint on verification_code |
| 5 | DB | MEDIUM | CHECK constraints on status fields |
| 6 | Backend | HIGH | Rate limiting on verification endpoints |
| 7 | Backend | HIGH | Route-scope check on admin password reset |
| 8 | Backend | HIGH | Account lockout after failed logins |
| 9 | Deployment | HIGH | Fix gunicorn forwarded_allow_ips |
| 10 | Backend | LOW | Add X-XSS-Protection header |
| 11 | Frontend | MEDIUM | Remove unsafe-eval from CSP |
| 12 | Backend | MEDIUM | SECRET_KEY length validation |
| 13 | Mobile | CRITICAL | Remove AsyncStorage token fallback |
| 14 | Mobile | HIGH | QR/manual entry input validation |
| 15 | Mobile | MEDIUM | Remove RECORD_AUDIO permission |
| 16 | Frontend | LOW | Remove console.error from dashboard |
| 17 | Frontend | LOW | Add redirect param support with validation |
| 18 | Backend | MEDIUM | Document multi-ticket atomicity |
| 19 | Backend | HIGH | Call _check_capacity in booking flow |
| 20 | Backend | HIGH | Rate limiting on listing endpoints |
| 21 | Backend | MEDIUM | OTP expiration enforcement |
| 22 | Backend | LOW | Schema password field guardrails |
| 23 | Deployment | LOW | Redis authentication |
| 24 | Deployment | LOW | Pin Docker image versions |
