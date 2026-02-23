# Frontend Security Hardening Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the Next.js frontend by adding security headers, server-side route protection middleware, migrating from js-cookie token storage to HttpOnly cookies (set by backend), and adding token refresh logic.

**Architecture:** Incremental migration — security headers first (no breaking changes), then middleware, then auth lib changes, then login/logout updates, then axios interceptor with refresh logic. Each step is independently testable.

**Tech Stack:** Next.js 16 App Router, TypeScript, Axios, js-cookie (kept for branch cookies only)

---

### Task 1: Add Security Headers to next.config.ts

**Files:**
- Modify: `frontend/next.config.ts`

**Step 1: Update next.config.ts with security headers**

Replace the entire file content of `frontend/next.config.ts` with:

```typescript
import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
```

**Step 2: Verify the build still works**

Run: `cd D:/workspace/ssmspl/frontend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
cd D:/workspace/ssmspl && git add frontend/next.config.ts && git commit -m "feat: add security headers to Next.js config (X-Frame-Options, X-Content-Type-Options, Referrer-Policy)"
```

---

### Task 2: Create Route Protection Middleware

**Files:**
- Create: `frontend/src/middleware.ts`

**Step 1: Create the middleware**

Create `frontend/src/middleware.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";

// Admin dashboard routes require admin access token cookie
const ADMIN_PROTECTED_PATHS = ["/dashboard"];
// Customer portal routes require portal access token cookie
const CUSTOMER_PROTECTED_PATHS = [
  "/customer/dashboard",
  "/customer/history",
  "/customer/bookings",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Check admin protected routes
  if (ADMIN_PROTECTED_PATHS.some((path) => pathname.startsWith(path))) {
    const accessToken = request.cookies.get("ssmspl_access_token");
    if (!accessToken?.value) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // Check customer protected routes
  if (CUSTOMER_PROTECTED_PATHS.some((path) => pathname.startsWith(path))) {
    const portalToken = request.cookies.get("ssmspl_portal_access_token");
    if (!portalToken?.value) {
      const loginUrl = new URL("/customer/login", request.url);
      loginUrl.searchParams.set("redirect", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - images, videos, favicon (public assets)
     * - api routes (handled by backend)
     */
    "/((?!_next/static|_next/image|images|videos|favicon\\.ico|api).*)",
  ],
};
```

**Step 2: Verify the build still works**

Run: `cd D:/workspace/ssmspl/frontend && npm run build`
Expected: Build succeeds

**Step 3: Commit**

```bash
cd D:/workspace/ssmspl && git add frontend/src/middleware.ts && git commit -m "feat: add Next.js middleware for server-side route protection (cookie-existence check)"
```

---

### Task 3: Migrate Auth Libraries (Remove Token Storage)

**Files:**
- Modify: `frontend/src/lib/auth.ts`
- Modify: `frontend/src/lib/portalAuth.ts`

**Step 1: Rewrite auth.ts**

Read `frontend/src/lib/auth.ts` first. Replace entire content with:

```typescript
import Cookies from "js-cookie";

const BRANCH_ID_KEY = "ssmspl_branch_id";
const BRANCH_NAME_KEY = "ssmspl_branch_name";

const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";

/**
 * Clear auth session. Calls the logout API (which clears HttpOnly cookies
 * via Set-Cookie: Max-Age=0) and removes branch cookies locally.
 */
export async function logout(): Promise<void> {
  try {
    const { default: api } = await import("./api");
    await api.post("/api/auth/logout");
  } catch {
    // Best-effort: even if the API call fails, clear local state
  }
  Cookies.remove(BRANCH_ID_KEY);
  Cookies.remove(BRANCH_NAME_KEY);
}

/**
 * Branch selection helpers — stored in regular (non-HttpOnly) cookies
 * because the frontend needs to read them for display.
 */
export function setSelectedBranch(branchId: number, branchName: string): void {
  Cookies.set(BRANCH_ID_KEY, String(branchId), { secure: isSecure, sameSite: "lax" });
  Cookies.set(BRANCH_NAME_KEY, branchName, { secure: isSecure, sameSite: "lax" });
}

export function getSelectedBranchId(): number | null {
  const val = Cookies.get(BRANCH_ID_KEY);
  return val ? Number(val) : null;
}

export function getSelectedBranchName(): string | null {
  return Cookies.get(BRANCH_NAME_KEY) || null;
}
```

Key changes:
- Removed `setTokens`, `getAccessToken`, `getRefreshToken`, `clearTokens`, `isAuthenticated`
- Added async `logout()` that calls the backend API
- Kept branch cookie helpers
- Changed sameSite from "strict" to "lax" to match backend cookie policy

**Step 2: Rewrite portalAuth.ts**

Read `frontend/src/lib/portalAuth.ts` first. Replace entire content with:

```typescript
/**
 * Portal auth utilities. Token storage is handled by HttpOnly cookies
 * set by the backend. This module only provides logout.
 */

/**
 * Clear portal auth session. Calls the logout API (which clears HttpOnly cookies).
 */
export async function portalLogout(): Promise<void> {
  try {
    const { default: api } = await import("./api");
    await api.post("/api/portal/auth/logout");
  } catch {
    // Best-effort: even if the API call fails, cookies will expire naturally
  }
}
```

Key changes:
- Removed `setPortalTokens`, `getPortalAccessToken`, `getPortalRefreshToken`, `clearPortalTokens`, `isPortalAuthenticated`
- Added async `portalLogout()` that calls the backend API
- No more js-cookie import (portal has no non-token cookies)

**Step 3: Verify build compiles (will have import errors in other files — that's expected, fixed in next tasks)**

At this point, files that import removed functions will fail. That's OK — we'll fix them in Tasks 4 and 5.

**Step 4: Commit**

```bash
cd D:/workspace/ssmspl && git add frontend/src/lib/auth.ts frontend/src/lib/portalAuth.ts && git commit -m "feat: remove client-side token storage from auth libs, add server-side logout"
```

---

### Task 4: Update Axios Interceptor (withCredentials + Refresh Logic)

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Step 1: Rewrite api.ts**

Read `frontend/src/lib/api.ts` first. Replace entire content with:

```typescript
import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
  withCredentials: true, // Send HttpOnly cookies with every request
});

// Track whether we're currently refreshing to avoid infinite loops
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  config: InternalAxiosRequestConfig;
}> = [];

function processQueue(error: unknown) {
  failedQueue.forEach(({ reject }) => reject(error));
  failedQueue = [];
}

function retryQueue() {
  failedQueue.forEach(({ resolve, config }) => resolve(api(config)));
  failedQueue = [];
}

/**
 * Determine if a URL is a portal (customer) route.
 */
function isPortalContext(url: string): boolean {
  if (url.includes("/portal/")) return true;
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/customer")) return true;
  return false;
}

// On 401, try to refresh the token. If refresh fails, redirect to login.
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (typeof window === "undefined") return Promise.reject(error);

    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    const url = originalRequest.url || "";
    const isAuthEndpoint =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/refresh");

    // Only handle 401s on non-auth endpoints
    if (error.response?.status !== 401 || isAuthEndpoint) {
      return Promise.reject(error);
    }

    // If we're already refreshing, queue this request
    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        failedQueue.push({ resolve, reject, config: originalRequest });
      });
    }

    isRefreshing = true;

    try {
      const isPortal = isPortalContext(url);
      const refreshUrl = isPortal
        ? "/api/portal/auth/refresh"
        : "/api/auth/refresh";

      await api.post(refreshUrl);

      // Refresh succeeded — retry queued requests and original request
      retryQueue();
      return api(originalRequest);
    } catch {
      // Refresh failed — redirect to login
      processQueue(error);
      const isPortal = isPortalContext(url);
      if (isPortal) {
        window.location.href = "/customer/login";
      } else {
        window.location.href = "/login";
      }
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
```

Key changes:
- Added `withCredentials: true` — browser sends HttpOnly cookies automatically
- Removed request interceptor (no more Bearer header — cookies handle auth)
- Added token refresh logic: on 401, try to refresh first, retry original request if refresh succeeds
- Queue mechanism prevents multiple simultaneous refreshes
- Falls back to login redirect if refresh fails

**Step 2: Verify no TypeScript errors in this file**

Run: `cd D:/workspace/ssmspl/frontend && npx tsc --noEmit --pretty 2>&1 | grep api.ts` (expect 0 errors for api.ts)

**Step 3: Commit**

```bash
cd D:/workspace/ssmspl && git add frontend/src/lib/api.ts && git commit -m "feat: add withCredentials for HttpOnly cookies, add token refresh logic on 401"
```

---

### Task 5: Update Login Pages (Remove Token Storage Calls)

**Files:**
- Modify: `frontend/src/app/login/page.tsx`
- Modify: `frontend/src/app/customer/login/page.tsx`

**Step 1: Update admin login page**

Read `frontend/src/app/login/page.tsx` first. Make these surgical changes:

1. Remove `setTokens` from the import line (keep `setSelectedBranch`):
   ```typescript
   import { setSelectedBranch } from "@/lib/auth";
   ```

2. Remove `TokenResponse` from the types import:
   ```typescript
   import { LoginRequest, User, RouteBranch } from "@/types";
   ```

3. In `handleSubmit`, replace lines 30-31:
   ```typescript
   // OLD:
   const { data } = await api.post<TokenResponse>("/api/auth/login", form);
   setTokens(data.access_token, data.refresh_token);

   // NEW:
   await api.post("/api/auth/login", form);
   ```
   The backend sets HttpOnly cookies via Set-Cookie header. No need to read the response body for tokens.

**Step 2: Update customer login page**

Read `frontend/src/app/customer/login/page.tsx` first. Make these surgical changes:

1. Remove `setPortalTokens` import:
   ```typescript
   // DELETE this line entirely:
   import { setPortalTokens } from "@/lib/portalAuth";
   ```

2. Remove `TokenResponse` import:
   ```typescript
   // DELETE:
   import { TokenResponse } from "@/types";
   ```

3. In `handleSubmit`, replace lines 32-33:
   ```typescript
   // OLD:
   const { data } = await api.post<TokenResponse>("/api/portal/auth/login", form);
   setPortalTokens(data.access_token, data.refresh_token);

   // NEW:
   await api.post("/api/portal/auth/login", form);
   ```

**Step 3: Verify build compiles**

Run: `cd D:/workspace/ssmspl/frontend && npx tsc --noEmit --pretty`
Expected: Might still have errors from AppSidebar/CustomerLayout — those are fixed in Task 6.

**Step 4: Commit**

```bash
cd D:/workspace/ssmspl && git add frontend/src/app/login/page.tsx frontend/src/app/customer/login/page.tsx && git commit -m "feat: remove client-side token storage from login pages (tokens now in HttpOnly cookies)"
```

---

### Task 6: Update Logout Flows and Dashboard Layouts

**Files:**
- Modify: `frontend/src/components/dashboard/AppSidebar.tsx`
- Modify: `frontend/src/components/dashboard/DashboardShell.tsx`
- Modify: `frontend/src/components/customer/CustomerLayout.tsx`

**Step 1: Update AppSidebar.tsx logout**

Read `frontend/src/components/dashboard/AppSidebar.tsx` first.

1. Change the import from:
   ```typescript
   import { clearTokens } from "@/lib/auth";
   ```
   to:
   ```typescript
   import { logout } from "@/lib/auth";
   ```

2. Change `handleLogout` from:
   ```typescript
   const handleLogout = () => {
     clearTokens();
     router.push("/login");
   };
   ```
   to:
   ```typescript
   const handleLogout = async () => {
     await logout();
     router.push("/login");
   };
   ```

**Step 2: Update DashboardShell.tsx**

Read `frontend/src/components/dashboard/DashboardShell.tsx` first.

1. Remove `isAuthenticated` import:
   ```typescript
   // DELETE:
   import { isAuthenticated } from "@/lib/auth";
   ```

2. In the `useEffect`, remove the `isAuthenticated()` check. Change from:
   ```typescript
   useEffect(() => {
     if (!isAuthenticated()) {
       router.push("/login");
       return;
     }
     api.get("/api/auth/me").then((res) => {
       setUser(res.data);
     }).catch(() => {
       router.push("/login");
     });
   ```
   to:
   ```typescript
   useEffect(() => {
     api.get("/api/auth/me").then((res) => {
       setUser(res.data);
     }).catch(() => {
       // 401 interceptor handles redirect to login
     });
   ```
   The middleware.ts handles route protection. The 401 interceptor in api.ts handles redirect if the cookie is invalid/expired.

   Note: Also update the company API catch to be consistent:
   ```typescript
     api.get("/api/company/").then((res) => {
       if (res.data.active_theme) {
         setActiveTheme(res.data.active_theme);
       }
     }).catch(() => {});
   ```
   This part stays the same — it already ignores errors.

**Step 3: Update CustomerLayout.tsx logout**

Read `frontend/src/components/customer/CustomerLayout.tsx` first.

1. Change import:
   ```typescript
   // OLD:
   import { clearPortalTokens } from "@/lib/portalAuth";
   // NEW:
   import { portalLogout } from "@/lib/portalAuth";
   ```

2. In the `useEffect`, change:
   ```typescript
   // OLD:
   .catch((err) => {
     if (err.response?.status === 401 || err.response?.status === 403) {
       clearPortalTokens();
       router.push("/customer/login");
     }
   });
   // NEW:
   .catch(() => {
     // 401 interceptor handles redirect to login
   });
   ```

3. Change `handleLogout`:
   ```typescript
   // OLD:
   const handleLogout = () => {
     clearPortalTokens();
     router.push("/customer/login");
   };
   // NEW:
   const handleLogout = async () => {
     await portalLogout();
     router.push("/customer/login");
   };
   ```

**Step 4: Verify the full build compiles**

Run: `cd D:/workspace/ssmspl/frontend && npx tsc --noEmit --pretty`
Expected: No errors

Run: `cd D:/workspace/ssmspl/frontend && npm run build`
Expected: Build succeeds

**Step 5: Commit**

```bash
cd D:/workspace/ssmspl && git add frontend/src/components/dashboard/AppSidebar.tsx frontend/src/components/dashboard/DashboardShell.tsx frontend/src/components/customer/CustomerLayout.tsx && git commit -m "feat: update logout flows to use API calls, remove client-side isAuthenticated checks"
```

---

### Task 7: Cleanup — Remove Unused Types and Verify

**Files:**
- Modify: `frontend/src/types/index.ts` (remove TokenResponse if unused)

**Step 1: Check if TokenResponse is still imported anywhere**

Run: `cd D:/workspace/ssmspl && grep -r "TokenResponse" frontend/src/`
Expected: Only the type definition itself should remain (in `types/index.ts`). If no other file imports it, remove it.

**Step 2: Remove TokenResponse from types/index.ts**

If unused, remove these lines from `frontend/src/types/index.ts`:
```typescript
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}
```

**Step 3: Run the final build**

Run: `cd D:/workspace/ssmspl/frontend && npm run build`
Expected: Build succeeds with no errors

**Step 4: Run lint**

Run: `cd D:/workspace/ssmspl/frontend && npm run lint`
Expected: No errors (warnings are OK)

**Step 5: Commit**

```bash
cd D:/workspace/ssmspl && git add frontend/src/types/index.ts && git commit -m "chore: remove unused TokenResponse type, frontend security hardening complete"
```
