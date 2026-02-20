import Cookies from "js-cookie";

const PORTAL_ACCESS_TOKEN_KEY = "ssmspl_portal_access_token";
const PORTAL_REFRESH_TOKEN_KEY = "ssmspl_portal_refresh_token";

const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";

export function setPortalTokens(accessToken: string, refreshToken: string): void {
  Cookies.set(PORTAL_ACCESS_TOKEN_KEY, accessToken, { secure: isSecure, sameSite: "strict", expires: 1 });
  Cookies.set(PORTAL_REFRESH_TOKEN_KEY, refreshToken, { secure: isSecure, sameSite: "strict", expires: 7 });
}

export function getPortalAccessToken(): string | undefined {
  return Cookies.get(PORTAL_ACCESS_TOKEN_KEY);
}

export function getPortalRefreshToken(): string | undefined {
  return Cookies.get(PORTAL_REFRESH_TOKEN_KEY);
}

export function clearPortalTokens(): void {
  Cookies.remove(PORTAL_ACCESS_TOKEN_KEY);
  Cookies.remove(PORTAL_REFRESH_TOKEN_KEY);
}

export function isPortalAuthenticated(): boolean {
  return !!getPortalAccessToken();
}
