import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Two-server token + credential storage.
 *
 * Tokens are SecureStore-backed (Android Keystore on real devices). They are
 * NAMESPACED by server id ("server1" = production, "server2" = admin portal)
 * so we can keep both signed-in sessions cached and hot-swap between them
 * without re-typing credentials.
 *
 * Credentials (username/password) are stored too, because the user wants
 * one-tap server switching even after the access token expires — we re-run
 * /superadmin-login transparently against the saved creds.  This is internal-
 * use-only on a personal phone with biometric gate on top, so storing the
 * password in Keystore is acceptable for this app's threat model.
 */

export type ServerId = 'server1' | 'server2';

// ---- Tokens (per server) ---------------------------------------------------

function accessKey(id: ServerId): string {
  return `ssmspl_${id}_access_token`;
}
function refreshKey(id: ServerId): string {
  return `ssmspl_${id}_refresh_token`;
}
function issuedAtKey(id: ServerId): string {
  return `ssmspl_${id}_issued_at`;
}

export const tokens = {
  /** Get the access token for the currently-active server. */
  getAccess: async (): Promise<string | null> => {
    const id = await activeServer.get();
    return SecureStore.getItemAsync(accessKey(id));
  },
  getRefresh: async (): Promise<string | null> => {
    const id = await activeServer.get();
    return SecureStore.getItemAsync(refreshKey(id));
  },
  setAccess: async (v: string): Promise<void> => {
    const id = await activeServer.get();
    await SecureStore.setItemAsync(accessKey(id), v);
    await SecureStore.setItemAsync(issuedAtKey(id), String(Date.now()));
  },
  setRefresh: async (v: string): Promise<void> => {
    const id = await activeServer.get();
    await SecureStore.setItemAsync(refreshKey(id), v);
  },
  /** Access-token age in milliseconds since it was set on this device. */
  getAccessAgeMs: async (): Promise<number | null> => {
    const id = await activeServer.get();
    const raw = await SecureStore.getItemAsync(issuedAtKey(id));
    if (!raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Date.now() - n;
  },
  /** Wipe tokens for the active server only. */
  clear: async (): Promise<void> => {
    const id = await activeServer.get();
    await SecureStore.deleteItemAsync(accessKey(id)).catch(() => {});
    await SecureStore.deleteItemAsync(refreshKey(id)).catch(() => {});
    await SecureStore.deleteItemAsync(issuedAtKey(id)).catch(() => {});
  },
  /** Wipe tokens for both servers (used by "Forget all credentials"). */
  clearAll: async (): Promise<void> => {
    for (const id of ['server1', 'server2'] as const) {
      await SecureStore.deleteItemAsync(accessKey(id)).catch(() => {});
      await SecureStore.deleteItemAsync(refreshKey(id)).catch(() => {});
      await SecureStore.deleteItemAsync(issuedAtKey(id)).catch(() => {});
    }
  },
};

// ---- Credentials (per server, SecureStore) --------------------------------

function userKey(id: ServerId): string {
  return `creds.${id}.username`;
}
function passKey(id: ServerId): string {
  return `creds.${id}.password`;
}

export const credentials = {
  set: async (id: ServerId, username: string, password: string): Promise<void> => {
    await SecureStore.setItemAsync(userKey(id), username);
    await SecureStore.setItemAsync(passKey(id), password);
  },
  get: async (id: ServerId): Promise<{ username: string; password: string } | null> => {
    const username = await SecureStore.getItemAsync(userKey(id));
    const password = await SecureStore.getItemAsync(passKey(id));
    if (!username || !password) return null;
    return { username, password };
  },
  clear: async (id: ServerId): Promise<void> => {
    await SecureStore.deleteItemAsync(userKey(id)).catch(() => {});
    await SecureStore.deleteItemAsync(passKey(id)).catch(() => {});
  },
  clearAll: async (): Promise<void> => {
    for (const id of ['server1', 'server2'] as const) {
      await SecureStore.deleteItemAsync(userKey(id)).catch(() => {});
      await SecureStore.deleteItemAsync(passKey(id)).catch(() => {});
    }
  },
  hasBoth: async (): Promise<boolean> => {
    const a = await credentials.get('server1');
    const b = await credentials.get('server2');
    return !!(a && b);
  },
};

// ---- Active-server pointer (AsyncStorage, non-secret) ---------------------

const ACTIVE_SERVER_KEY = 'ssmspl_active_server';

export const activeServer = {
  get: async (): Promise<ServerId> => {
    const v = await AsyncStorage.getItem(ACTIVE_SERVER_KEY);
    return v === 'server1' ? 'server1' : 'server2';
  },
  set: async (id: ServerId): Promise<void> => {
    await AsyncStorage.setItem(ACTIVE_SERVER_KEY, id);
  },
};

// ---- Generic prefs --------------------------------------------------------

export const prefs = {
  get: (key: string) => AsyncStorage.getItem(key),
  set: (key: string, value: string) => AsyncStorage.setItem(key, value),
  remove: (key: string) => AsyncStorage.removeItem(key),
};

// Legacy key kept for backwards-compat with any read sites we haven't
// converted yet.  All new code uses activeServer.* + ServerId-keyed URLs.
export const SERVER_URL_KEY = 'ssmspl_server_url';
export const PUSH_TOKEN_KEY = 'ssmspl_push_token';
