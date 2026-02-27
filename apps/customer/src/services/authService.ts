import api from './api';
import { MobileLoginResponse, Customer } from '../types';
import { setTokens, setCustomerData, clearAll, getRefreshToken } from './storageService';

export async function login(email: string, password: string): Promise<MobileLoginResponse> {
  const { data } = await api.post<MobileLoginResponse>('/api/portal/auth/mobile-login', {
    email,
    password,
  });
  await setTokens(data.access_token, data.refresh_token);
  await setCustomerData(data.user);
  return data;
}

export async function register(
  first_name: string,
  last_name: string,
  email: string,
  password: string,
  mobile: string,
): Promise<{ message: string; email: string }> {
  const { data } = await api.post('/api/portal/auth/register', {
    first_name,
    last_name,
    email,
    password,
    mobile,
  });
  return data;
}

export async function verifyOtp(email: string, otp: string): Promise<void> {
  await api.post('/api/portal/auth/verify-email', { email, otp });
}

export async function resendOtp(email: string, purpose: string = 'registration'): Promise<void> {
  await api.post(`/api/portal/auth/resend-otp?purpose=${purpose}`, { email });
}

export async function forgotPassword(email: string): Promise<void> {
  await api.post('/api/portal/auth/forgot-password', { email });
}

export async function resetPassword(email: string, otp: string, new_password: string): Promise<void> {
  await api.post('/api/portal/auth/reset-password', { email, otp, new_password });
}

export async function googleSignIn(
  google_id: string,
  email: string,
  first_name: string,
  last_name: string,
): Promise<MobileLoginResponse> {
  const { data } = await api.post<MobileLoginResponse>('/api/portal/auth/google-signin', {
    google_id,
    email,
    first_name,
    last_name,
  });
  await setTokens(data.access_token, data.refresh_token);
  await setCustomerData(data.user);
  return data;
}

export async function getProfile(): Promise<Customer> {
  const { data } = await api.get<Customer>('/api/portal/auth/me');
  return data;
}

export async function updateProfile(
  first_name?: string,
  last_name?: string,
  mobile?: string,
): Promise<Customer> {
  const { data } = await api.put<Customer>('/api/portal/auth/profile', {
    first_name,
    last_name,
    mobile,
  });
  await setCustomerData(data);
  return data;
}

export async function changePassword(old_password: string, new_password: string): Promise<void> {
  await api.post('/api/portal/auth/change-password', { old_password, new_password });
}

export async function logout(): Promise<void> {
  try {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      await api.post('/api/portal/auth/logout', { refresh_token: refreshToken });
    }
  } catch {
    // Best-effort
  }
  await clearAll();
}
