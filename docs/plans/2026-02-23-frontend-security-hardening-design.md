# Frontend Security Hardening Design

**Date:** 2026-02-23
**Area:** Frontend (Next.js — Admin Portal + Customer Portal)
**Approach:** Incremental migration, one concern at a time
**Prerequisite:** Backend HttpOnly cookie auth (completed)

## Context

Backend now sets HttpOnly cookies on login. Frontend still uses js-cookie to store tokens client-side (6 files affected). No middleware.ts exists for server-side route protection. No security headers in next.config.ts.

## Section 1: Next.js Security Headers

Add headers via `next.config.ts` `headers()`:
- X-Content-Type-Options: nosniff
- X-Frame-Options: DENY
- Referrer-Policy: strict-origin-when-cross-origin
- Permissions-Policy: camera=(), microphone=(), geolocation=()
- X-DNS-Prefetch-Control: on

No CSP — Next.js inline scripts would break it without nonce config.

## Section 2: Route Protection Middleware

Create `frontend/src/middleware.ts`:
- `/dashboard/:path*` requires `ssmspl_access_token` cookie
- `/customer/dashboard/:path*`, `/customer/history/:path*`, `/customer/bookings/:path*` require `ssmspl_portal_access_token` cookie
- Missing cookie → redirect to appropriate login page
- Public paths and static assets excluded via matcher

## Section 3: Auth Lib Migration

### `auth.ts`
- DELETE: `setTokens()`, `getAccessToken()`, `getRefreshToken()`, `isAuthenticated()`
- REPLACE: `clearTokens()` → API call to `POST /api/auth/logout` + clear branch cookies locally
- KEEP: `setSelectedBranch()`, `getSelectedBranchId()`, `getSelectedBranchName()` (non-sensitive, regular cookies)

### `portalAuth.ts`
- DELETE: `setPortalTokens()`, `getPortalAccessToken()`, `getPortalRefreshToken()`, `isPortalAuthenticated()`
- REPLACE: `clearPortalTokens()` → API call to `POST /api/portal/auth/logout`

js-cookie stays for branch cookies only.

## Section 4: Axios Interceptor

- Add `withCredentials: true` to axios instance
- Remove request interceptor that attaches Bearer header (cookies sent automatically)
- Update 401 interceptor: try refresh first, then redirect to login
- Refresh logic: on 401, call `/api/auth/refresh` or `/api/portal/auth/refresh`. If refresh succeeds, retry original request. If fails, redirect to login.

## Section 5: Login Pages + Logout Flows

### Login pages
- Remove `setTokens()` / `setPortalTokens()` calls (backend sets cookies via Set-Cookie)
- Remove `TokenResponse` type import
- After login POST, proceed to fetch `/api/auth/me` and navigate

### Logout
- Admin: `await api.post("/api/auth/logout")` + clear branch cookies
- Portal: `await api.post("/api/portal/auth/logout")`

### Dashboard layouts
- Keep `/api/auth/me` call on mount
- Remove `isAuthenticated()` check (middleware handles it)
- 401 interceptor handles redirect

## Files to Change

| File | Action |
|------|--------|
| `next.config.ts` | Add security headers |
| `src/middleware.ts` | CREATE — route protection |
| `src/lib/auth.ts` | Remove token functions, keep branch functions |
| `src/lib/portalAuth.ts` | Remove all token functions |
| `src/lib/api.ts` | withCredentials, remove Bearer interceptor, add refresh logic |
| `src/app/login/page.tsx` | Remove setTokens call |
| `src/app/customer/login/page.tsx` | Remove setPortalTokens call |
| `src/components/dashboard/AppSidebar.tsx` | Update logout to API call |
| `src/components/customer/CustomerLayout.tsx` | Update logout to API call |
| `src/app/dashboard/layout.tsx` | Remove isAuthenticated check |
| `src/types/index.ts` | Remove TokenResponse type if unused |
