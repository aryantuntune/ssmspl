import Constants from 'expo-constants';

import { activeServer, type ServerId } from './storage';

export type ServerOption = { id: ServerId; name: string; url: string };

/**
 * The two servers are fixed: Production (Server 1) and Admin Portal
 * (Server 2).  URLs come from app.json `extra.defaultServers` so they
 * can be overridden per-build flavour; defaults below match the live
 * deployment.
 *
 * Order in the array is "what the user sees first" — Admin Portal is
 * listed first because that's the day-to-day server.
 */
export const SERVERS: ServerOption[] = (() => {
  const raw = Constants.expoConfig?.extra?.defaultServers as
    | { name: string; url: string }[]
    | undefined;
  const admin = raw?.find((s) => /admin/i.test(s.url))?.url ?? 'https://admin.carferry.online';
  const prod =
    raw?.find((s) => !/admin/i.test(s.url) && /carferry\.online$/.test(s.url))?.url ??
    'https://carferry.online';
  return [
    { id: 'server2', name: 'Admin Portal', url: admin },
    { id: 'server1', name: 'Production', url: prod },
  ];
})();

export function getServer(id: ServerId): ServerOption {
  const found = SERVERS.find((s) => s.id === id);
  // Safe fallback: SERVERS is hard-coded above so this can only miss if
  // someone mutates the array.  Treat it as a fatal misconfig.
  if (!found) {
    throw new Error(`Unknown server id: ${id}`);
  }
  return found;
}

/** URL string for the currently-active server. */
export async function getActiveServerUrl(): Promise<string> {
  const id = await activeServer.get();
  return getServer(id).url;
}

/** Switch which server is active. Re-cache the axios client after this. */
export async function setActiveServer(id: ServerId): Promise<void> {
  await activeServer.set(id);
}

/** Friendly tags used by Dashboard/Login UI. */
export function isAdminPortal(id: ServerId): boolean {
  return id === 'server2';
}

// ---- Back-compat shim for old code paths ---------------------------------
// Some screens still import DEFAULT_SERVERS; map it to the new shape.
export const DEFAULT_SERVERS = SERVERS.map((s) => ({ name: s.name, url: s.url }));

// Old setActiveServerUrl callsites pass a URL string. Translate to id-based.
export async function setActiveServerUrl(url: string): Promise<void> {
  const normalized = url.replace(/\/$/, '');
  const match = SERVERS.find((s) => s.url.replace(/\/$/, '') === normalized);
  if (!match) {
    // Caller passed something we don't recognise — treat the user-given URL
    // as if it were the admin URL.  This keeps legacy login flows working.
    await activeServer.set('server2');
    return;
  }
  await activeServer.set(match.id);
}
