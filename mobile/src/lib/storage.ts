import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

// SecureStore for tokens (Android Keystore-backed); AsyncStorage for everything else.

export const tokens = {
  getAccess: () => SecureStore.getItemAsync('ssmspl_access_token'),
  getRefresh: () => SecureStore.getItemAsync('ssmspl_refresh_token'),
  setAccess: (v: string) => SecureStore.setItemAsync('ssmspl_access_token', v),
  setRefresh: (v: string) => SecureStore.setItemAsync('ssmspl_refresh_token', v),
  clear: async () => {
    await SecureStore.deleteItemAsync('ssmspl_access_token').catch(() => {});
    await SecureStore.deleteItemAsync('ssmspl_refresh_token').catch(() => {});
  },
};

export const prefs = {
  get: (key: string) => AsyncStorage.getItem(key),
  set: (key: string, value: string) => AsyncStorage.setItem(key, value),
  remove: (key: string) => AsyncStorage.removeItem(key),
};

export const SERVER_URL_KEY = 'ssmspl_server_url';
export const PUSH_TOKEN_KEY = 'ssmspl_push_token';
