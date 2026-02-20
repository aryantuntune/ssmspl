import Cookies from "js-cookie";

const ACCESS_TOKEN_KEY = "ssmspl_access_token";
const REFRESH_TOKEN_KEY = "ssmspl_refresh_token";
const BRANCH_ID_KEY = "ssmspl_branch_id";
const BRANCH_NAME_KEY = "ssmspl_branch_name";

export function setTokens(accessToken: string, refreshToken: string): void {
  Cookies.set(ACCESS_TOKEN_KEY, accessToken, { secure: true, sameSite: "strict" });
  Cookies.set(REFRESH_TOKEN_KEY, refreshToken, { secure: true, sameSite: "strict", expires: 7 });
}

export function getAccessToken(): string | undefined {
  return Cookies.get(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | undefined {
  return Cookies.get(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  Cookies.remove(ACCESS_TOKEN_KEY);
  Cookies.remove(REFRESH_TOKEN_KEY);
  Cookies.remove(BRANCH_ID_KEY);
  Cookies.remove(BRANCH_NAME_KEY);
}

export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

export function setSelectedBranch(branchId: number, branchName: string): void {
  Cookies.set(BRANCH_ID_KEY, String(branchId), { secure: true, sameSite: "strict" });
  Cookies.set(BRANCH_NAME_KEY, branchName, { secure: true, sameSite: "strict" });
}

export function getSelectedBranchId(): number | null {
  const val = Cookies.get(BRANCH_ID_KEY);
  return val ? Number(val) : null;
}

export function getSelectedBranchName(): string | null {
  return Cookies.get(BRANCH_NAME_KEY) || null;
}
