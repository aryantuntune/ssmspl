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
