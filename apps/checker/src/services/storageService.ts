import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CheckerUser } from '../types';
import { logger } from '../utils/logger';

const KEYS = {
  ACCESS_TOKEN: 'ssmspl_access_token',
  REFRESH_TOKEN: 'ssmspl_refresh_token',
  CHECKER_DATA: 'ssmspl_checker_data',
  VERIFICATION_COUNT: 'ssmspl_verification_count',
};

// --- Secure token storage ---

export async function getAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
  } catch {
    logger.warn('SecureStore read failed, trying AsyncStorage fallback');
    return AsyncStorage.getItem(KEYS.ACCESS_TOKEN);
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
  } catch {
    return AsyncStorage.getItem(KEYS.REFRESH_TOKEN);
  }
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, access);
    await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, refresh);
  } catch {
    logger.warn('SecureStore write failed, using AsyncStorage fallback');
    await AsyncStorage.setItem(KEYS.ACCESS_TOKEN, access);
    await AsyncStorage.setItem(KEYS.REFRESH_TOKEN, refresh);
  }
}

export async function clearTokens(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN);
    await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
  } catch {
    // ignore
  }
  await AsyncStorage.removeItem(KEYS.ACCESS_TOKEN);
  await AsyncStorage.removeItem(KEYS.REFRESH_TOKEN);
}

// --- Checker profile ---

export async function getCheckerData(): Promise<CheckerUser | null> {
  const raw = await AsyncStorage.getItem(KEYS.CHECKER_DATA);
  return raw ? JSON.parse(raw) : null;
}

export async function setCheckerData(checker: CheckerUser): Promise<void> {
  await AsyncStorage.setItem(KEYS.CHECKER_DATA, JSON.stringify(checker));
}

export async function clearCheckerData(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.CHECKER_DATA);
}

// --- Daily verification count ---

interface DailyCount {
  count: number;
  date: string; // YYYY-MM-DD
}

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

export async function getTodayCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEYS.VERIFICATION_COUNT);
  if (!raw) return 0;
  const data: DailyCount = JSON.parse(raw);
  if (data.date !== todayString()) return 0;
  return data.count;
}

export async function incrementTodayCount(): Promise<number> {
  const today = todayString();
  const raw = await AsyncStorage.getItem(KEYS.VERIFICATION_COUNT);
  let data: DailyCount = raw ? JSON.parse(raw) : { count: 0, date: today };
  if (data.date !== today) {
    data = { count: 0, date: today };
  }
  data.count += 1;
  await AsyncStorage.setItem(KEYS.VERIFICATION_COUNT, JSON.stringify(data));
  return data.count;
}

// --- Clear all ---

export async function clearAll(): Promise<void> {
  await clearTokens();
  await clearCheckerData();
}
