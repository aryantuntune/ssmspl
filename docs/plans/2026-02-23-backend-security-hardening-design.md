# Backend Security Hardening Design

**Date:** 2026-02-23
**Area:** Backend API (FastAPI)
**Approach:** Middleware-First (centralized security middleware)
**Infrastructure:** Behind Cloudflare, but defense-in-depth at app level

## Context

Security audit identified gaps in the backend: no rate limiting, no HTTP security headers, no HttpOnly cookies, wildcard CORS, no global exception handling. This design addresses all gaps.

## Section 1: Security Headers Middleware

**New file:** `backend/app/middleware/security.py`

Starlette middleware injecting headers on every response:

| Header | Value | Purpose |
|--------|-------|---------|
| `X-Content-Type-Options` | `nosniff` | Prevents MIME type sniffing |
| `X-Frame-Options` | `DENY` | Prevents clickjacking |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` | Forces HTTPS (1 year) |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Limits referrer info leakage |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` | Disables unnecessary browser APIs |
| `Content-Security-Policy` | `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'` | Prevents XSS, injection |
| `X-Request-ID` | UUID per request | Traceability |
| `Server` | `""` (empty) | Strips server version |

HSTS only set when `APP_ENV != "development"`.

## Section 2: Rate Limiting (Light)

**Library:** `slowapi`

| Endpoint | Limit | Key |
|----------|-------|-----|
| `/api/auth/login` | 10/min per IP | CF-Connecting-IP > X-Forwarded-For > client.host |
| `/api/portal/auth/login` | 10/min per IP | Same |
| `/api/portal/auth/register` | 10/min per IP | Same |
| `/api/auth/refresh`, `/api/portal/auth/refresh` | 20/min per IP | Same |
| All other endpoints | No limit | N/A |

No account lockout. Returns 429 with `Retry-After` header on limit exceeded.

## Section 3: HttpOnly Cookie Auth Flow

Migrate from JSON token response + js-cookie to backend-controlled Set-Cookie headers.

### Login response
- Sets `Set-Cookie: ssmspl_access_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=1800`
- Sets `Set-Cookie: ssmspl_refresh_token=<jwt>; HttpOnly; Secure; SameSite=Strict; Path=/api/auth/refresh; Max-Age=604800`
- JSON body returns user info, **no tokens in body**

### Portal login
- Same pattern with `ssmspl_portal_access_token` and `ssmspl_portal_refresh_token`
- Refresh cookie path: `/api/portal/auth/refresh`

### Refresh endpoints
- Read refresh token from cookie, issue new Set-Cookie for both tokens

### Logout endpoints
- Set both cookies with `Max-Age=0` to clear them

### Auth dependency (dual-mode)
- Extract token from cookie first
- Fall back to `Authorization: Bearer` header (mobile app compatibility)

### Secure flag
- Only set when `APP_ENV != "development"`

## Section 4: CORS Tightening

Replace wildcards with explicit values:

```python
allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
allow_headers=["Authorization", "Content-Type", "Accept", "X-Request-ID"]
expose_headers=["X-Request-ID"]
```

No changes to `allow_origins` (already configured per environment).

## Section 5: Global Exception Handler

### Production (`DEBUG=False`)
- Catch-all handler for unhandled `Exception`: returns `{"detail": "Internal server error"}` (500)
- Log full traceback server-side with X-Request-ID correlation
- `RequestValidationError` handler: consistent error format

### Development (`DEBUG=True`)
- Default FastAPI behavior (full stack traces)

### New config
- `TRUSTED_PROXY_HEADERS: str = "CF-Connecting-IP,X-Forwarded-For"` for rate limiter key function

## Section 6: Additional Hardening

1. **Strip server version header** — `Server: ""` in security middleware
2. **Hide openapi.json in production** — `openapi_url=None` when `DEBUG=False`
3. **Health endpoint** — remove `env` field when `DEBUG=False`
4. **Structured logging** — with X-Request-ID correlation, Python built-in `logging`

## Files to Create/Modify

### New files
- `backend/app/middleware/__init__.py`
- `backend/app/middleware/security.py`
- `backend/app/middleware/rate_limit.py`

### Modified files
- `backend/app/main.py` — add middleware, exception handlers, hide openapi
- `backend/app/config.py` — add `TRUSTED_PROXY_HEADERS` setting
- `backend/app/routers/auth.py` — Set-Cookie on login/refresh/logout
- `backend/app/routers/portal_auth.py` — Set-Cookie on login/refresh/logout
- `backend/app/dependencies.py` — dual-mode token extraction (cookie + Bearer)
- `backend/app/services/auth_service.py` — return data for cookie setting (not raw token response)
- `backend/app/services/portal_auth_service.py` — same
- `backend/requirements.txt` — add `slowapi`
