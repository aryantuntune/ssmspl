import api from './api';
import { MobileLoginResponse } from '../types';
import { setTokens, setCheckerData, clearAll, getRefreshToken } from './storageService';

export async function login(email: string, password: string): Promise<MobileLoginResponse> {
  const { data } = await api.post<MobileLoginResponse>('/api/auth/mobile-login', {
    email,
    password,
  });
  await setTokens(data.access_token, data.refresh_token);
  await setCheckerData(data.user);
  return data;
}

export async function logout(): Promise<void> {
  try {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      await api.post('/api/auth/logout', { refresh_token: refreshToken });
    }
  } catch {
    // Best-effort — proceed with local cleanup even if backend call fails
  }
  await clearAll();
}

export async function getProfile(): Promise<MobileLoginResponse['user']> {
  const { data } = await api.get('/api/auth/me');
  return {
    id: data.id,
    full_name: data.full_name,
    email: data.email,
    role: data.role,
    route_id: data.route_id,
    route_name: data.route_name,
  };
}
