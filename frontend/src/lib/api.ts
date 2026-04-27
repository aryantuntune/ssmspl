import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

// API calls use relative URLs — Next.js rewrites proxy /api/* to the backend.
// This eliminates CORS and cross-origin cookie issues on all devices.
const api = axios.create({
  headers: { "Content-Type": "application/json" },
  withCredentials: true,
  // Serialise array params in "repeat" form (?branch_ids=1&branch_ids=2)
  // because FastAPI's `list[int] = Query(...)` reads repeated keys.
  // axios v1's default produces `branch_ids[]=1&branch_ids[]=2` which
  // FastAPI silently ignores — selected branches would be dropped and
  // the report would silently include all branches instead.
  paramsSerializer: {
    serialize: (params) => {
      const sp = new URLSearchParams();
      for (const [k, v] of Object.entries(params)) {
        if (v === null || v === undefined) continue;
        if (Array.isArray(v)) {
          for (const item of v) sp.append(k, String(item));
        } else {
          sp.append(k, String(v));
        }
      }
      return sp.toString();
    },
  },
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
      window.location.href = isPortal ? "/customer/login" : "/login";
      return Promise.reject(error);
    }
    (originalRequest as unknown as Record<string, unknown>)._retried = true;

    // Session was invalidated — don't try refresh, redirect immediately
    const detail = (error.response?.data as { detail?: string })?.detail;
    if (detail === "session_expired_elsewhere") {
      const isPortal = isPortalContext(url);
      const loginPath = isPortal ? "/customer/login" : "/login";
      window.location.href = `${loginPath}?reason=session_conflict`;
      return Promise.reject(error);
    }
    if (detail === "session_idle_timeout") {
      const isPortal = isPortalContext(url);
      const loginPath = isPortal ? "/customer/login" : "/login";
      window.location.href = `${loginPath}?reason=idle_timeout`;
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
