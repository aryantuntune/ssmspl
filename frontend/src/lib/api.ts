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
      url.includes("/auth/refresh") ||
      url.includes("/auth/me");

    if (error.response?.status !== 401 || isAuthEndpoint) {
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
