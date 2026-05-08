import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';

import { getActiveServerUrl } from '../lib/config';
import { tokens } from '../lib/storage';

let cachedClient: AxiosInstance | null = null;
let cachedBase: string | null = null;

export async function getClient(): Promise<AxiosInstance> {
  const base = await getActiveServerUrl();
  if (cachedClient && cachedBase === base) return cachedClient;

  const client = axios.create({
    baseURL: base,
    timeout: 15000,
    headers: { 'Content-Type': 'application/json' },
  });

  client.interceptors.request.use(async (cfg: InternalAxiosRequestConfig) => {
    const token = await tokens.getAccess();
    if (token) cfg.headers.set('Authorization', `Bearer ${token}`);
    return cfg;
  });

  client.interceptors.response.use(
    (r) => r,
    async (err: AxiosError) => {
      if (err.response?.status === 401) {
        // Try refresh once
        const refresh = await tokens.getRefresh();
        if (refresh && err.config && !(err.config as any)._retried) {
          (err.config as any)._retried = true;
          try {
            const r = await axios.post(`${base}/api/auth/superadmin-refresh`, { refresh_token: refresh });
            const newAccess = r.data?.access_token;
            const newRefresh = r.data?.refresh_token;
            if (newAccess) await tokens.setAccess(newAccess);
            if (newRefresh) await tokens.setRefresh(newRefresh);
            err.config.headers.set('Authorization', `Bearer ${newAccess}`);
            return client.request(err.config);
          } catch {
            await tokens.clear();
          }
        }
      }
      return Promise.reject(err);
    },
  );

  cachedClient = client;
  cachedBase = base;
  return client;
}

export function clearClientCache() {
  cachedClient = null;
  cachedBase = null;
}
