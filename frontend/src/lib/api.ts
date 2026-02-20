import axios from "axios";
import { getAccessToken, clearTokens } from "./auth";
import { getPortalAccessToken, clearPortalTokens } from "./portalAuth";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
});

// Attach Bearer token to every request — pick portal or admin token based on URL
api.interceptors.request.use((config) => {
  const url = config.url || "";
  const isPortalRequest =
    url.includes("/portal/") ||
    (typeof window !== "undefined" && window.location.pathname.startsWith("/customer"));

  const token = isPortalRequest ? getPortalAccessToken() : getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401, clear tokens and redirect to the correct login page
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window === "undefined") return Promise.reject(error);

    const url = error.config?.url || "";
    const isAuthEndpoint =
      url.includes("/auth/login") ||
      url.includes("/auth/register");
    if (error.response?.status === 401 && !isAuthEndpoint) {
      const isPortalRoute =
        url.includes("/portal/") ||
        window.location.pathname.startsWith("/customer");
      if (isPortalRoute) {
        clearPortalTokens();
        window.location.href = "/customer/login";
      } else {
        clearTokens();
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
