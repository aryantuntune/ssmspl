import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import { getAccessToken, getRefreshToken, setTokens, clearAll } from './storageService';
import { MobileRefreshResponse } from '../types';
import { logger } from '../utils/logger';

const BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ||
  (__DEV__ ? 'http://10.0.2.2:8000' : 'https://api.ssmspl.com');

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig & { __retryCount?: number };
    if (!config) return Promise.reject(error);
    const retryCount = config.__retryCount ?? 0;
    const isNetworkError = !error.response;
    const isServerError = error.response && error.response.status >= 500;
    if ((isNetworkError || isServerError) && retryCount < MAX_RETRIES) {
      config.__retryCount = retryCount + 1;
      const delay = RETRY_BASE_DELAY * Math.pow(2, retryCount);
      logger.warn(`Retry ${config.__retryCount}/${MAX_RETRIES} after ${delay}ms for ${config.url}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return api(config);
    }
    return Promise.reject(error);
  },
);

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token);
    else reject(error);
  });
  failedQueue = [];
}

let onAuthFailure: (() => void) | null = null;
export function setAuthFailureHandler(handler: () => void) {
  onAuthFailure = handler;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }
    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      });
    }
    originalRequest._retry = true;
    isRefreshing = true;
    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) throw new Error('No refresh token');
      const { data } = await axios.post<MobileRefreshResponse>(
        `${BASE_URL}/api/portal/auth/mobile-refresh`,
        { refresh_token: refreshToken },
      );
      await setTokens(data.access_token, data.refresh_token);
      processQueue(null, data.access_token);
      originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      logger.error('Token refresh failed, logging out');
      await clearAll();
      onAuthFailure?.();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
