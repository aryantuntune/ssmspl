import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Customer } from '../types';
import { logger } from '../utils/logger';

const KEYS = {
  ACCESS_TOKEN: 'ssmspl_customer_access_token',
  REFRESH_TOKEN: 'ssmspl_customer_refresh_token',
  CUSTOMER_DATA: 'ssmspl_customer_data',
  LANGUAGE: 'ssmspl_customer_language',
  THEME: 'ssmspl_customer_theme',
};

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

export async function getCustomerData(): Promise<Customer | null> {
  const raw = await AsyncStorage.getItem(KEYS.CUSTOMER_DATA);
  return raw ? JSON.parse(raw) : null;
}

export async function setCustomerData(customer: Customer): Promise<void> {
  await AsyncStorage.setItem(KEYS.CUSTOMER_DATA, JSON.stringify(customer));
}

export async function clearCustomerData(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.CUSTOMER_DATA);
}

export async function getLanguage(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.LANGUAGE)) || 'en';
}

export async function setLanguage(lang: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.LANGUAGE, lang);
}

export async function getStoredTheme(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.THEME)) || 'light';
}

export async function setStoredTheme(theme: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.THEME, theme);
}

export async function clearAll(): Promise<void> {
  await clearTokens();
  await clearCustomerData();
}
