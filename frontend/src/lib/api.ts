import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

// API calls use relative URLs — Next.js rewrites proxy /api/* to the backend.
// This eliminates CORS and cross-origin cookie issues on all devices.
const api = axios.create({
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
});

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

function isPortalContext(url: string): boolean {
  if (url.includes("/portal/")) return true;
  if (typeof window !== "undefined" && window.location.pathname.startsWith("/customer")) return true;
  return false;
}

// Whether the *current page* is a protected route that should bounce to a login
// screen on auth failure. Mirrors middleware.ts. On public pages (/, /about,
// /contact, /customer/login, etc.) a 401 from a probe call (e.g. Header.tsx
// calling /auth/me to pick a login-vs-account UI) must NOT force-navigate the
// visitor to /login — they aren't logged in by design.
function isProtectedPath(pathname: string): boolean {
  if (pathname.startsWith("/dashboard")) return true;
  if (pathname.startsWith("/customer")) {
    return (
      !pathname.startsWith("/customer/login") &&
      !pathname.startsWith("/customer/register") &&
      !pathname.startsWith("/customer/forgot-password") &&
      !pathname.startsWith("/customer/reset-password") &&
      !pathname.startsWith("/customer/verify-email") &&
      // Payment result screen: reached via Airpay's cross-site redirect. A probe
      // 401 here (e.g. CustomerLayout's /me) must NOT force-navigate to login —
      // the customer needs to see their success/failure confirmation. Mirrors
      // the public allowlist in middleware.ts.
      !pathname.startsWith("/customer/payment/callback")
    );
  }
  return false;
}

function redirectToLogin(target: string) {
  if (typeof window === "undefined") return;
  if (!isProtectedPath(window.location.pathname)) return;
  window.location.href = target;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (typeof window === "undefined") return Promise.reject(error);

    const originalRequest = error.config;
    if (!originalRequest) return Promise.reject(error);

    const url = originalRequest.url || "";
    // Only skip refresh for login/register/refresh endpoints (would cause loops)
    // /auth/me IS allowed to trigger refresh — it's the main session-check call
    const skipRefresh =
      url.includes("/auth/login") ||
      url.includes("/auth/register") ||
      url.includes("/auth/refresh");

    if (error.response?.status !== 401 || skipRefresh) {
      return Promise.reject(error);
    }

    // Prevent infinite retry: if we already refreshed and retried this request, give up
    if ((originalRequest as unknown as Record<string, unknown>)._retried) {
      const isPortal = isPortalContext(url);
      redirectToLogin(isPortal ? "/customer/login" : "/login");
      return Promise.reject(error);
    }
    (originalRequest as unknown as Record<string, unknown>)._retried = true;

    // Session was invalidated — don't try refresh, redirect immediately
    const detail = (error.response?.data as { detail?: string })?.detail;
    if (detail === "session_expired_elsewhere") {
      const isPortal = isPortalContext(url);
      const loginPath = isPortal ? "/customer/login" : "/login";
      redirectToLogin(`${loginPath}?reason=session_conflict`);
      return Promise.reject(error);
    }
    if (detail === "session_idle_timeout") {
      const isPortal = isPortalContext(url);
      const loginPath = isPortal ? "/customer/login" : "/login";
      redirectToLogin(`${loginPath}?reason=idle_timeout`);
      return Promise.reject(error);
    }

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
      retryQueue();
      return api(originalRequest);
    } catch {
      processQueue(error);
      const isPortal = isPortalContext(url);
      redirectToLogin(isPortal ? "/customer/login" : "/login");
      return Promise.reject(error);
    } finally {
      isRefreshing = false;
    }
  }
);

export default api;
