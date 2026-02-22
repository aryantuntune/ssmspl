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
