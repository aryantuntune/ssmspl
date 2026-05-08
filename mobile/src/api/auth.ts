import { getClient } from './client';
import { tokens } from '../lib/storage';

export type Me = {
  id: string;
  username: string;
  full_name: string;
  role: string;
  email: string | null;
};

export async function login(username: string, password: string) {
  const client = await getClient();
  // /superadmin-login returns tokens in JSON body (the regular /login uses
  // HttpOnly cookies which React Native doesn't auto-manage).
  const r = await client.post('/api/auth/superadmin-login', { username, password });
  const { access_token, refresh_token } = r.data;
  if (access_token) await tokens.setAccess(access_token);
  if (refresh_token) await tokens.setRefresh(refresh_token);
  return r.data;
}

export async function getMe(): Promise<Me> {
  const client = await getClient();
  const r = await client.get('/api/auth/me');
  return r.data;
}

export async function logout() {
  const client = await getClient();
  try {
    await client.post('/api/auth/logout');
  } catch {
    /* ignore */
  } finally {
    await tokens.clear();
  }
}
