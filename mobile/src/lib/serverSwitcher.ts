import { clearClientCache } from '../api/client';
import { login as authLogin } from '../api/auth';
import { setActiveServer } from './config';
import { credentials, type ServerId } from './storage';

/**
 * Switch to the given server, logging in transparently with the saved
 * credentials. Returns true on success, false if no saved credentials or
 * the login itself failed.
 *
 * Caller is responsible for re-fetching dashboard data afterward (we just
 * clear the axios client cache here so the next request uses the new base).
 */
export async function switchToServer(id: ServerId): Promise<{ ok: boolean; reason?: string }> {
  const creds = await credentials.get(id);
  if (!creds) {
    return { ok: false, reason: 'No saved credentials for that server. Sign in once and they\'ll be remembered.' };
  }
  await setActiveServer(id);
  clearClientCache();
  try {
    await authLogin(creds.username, creds.password);
    return { ok: true };
  } catch (e: any) {
    const detail = e?.response?.data?.detail || e?.message || 'Login failed';
    return { ok: false, reason: typeof detail === 'string' ? detail : 'Login failed' };
  }
}
