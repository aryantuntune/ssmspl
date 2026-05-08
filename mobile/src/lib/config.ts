import Constants from 'expo-constants';
import { prefs, SERVER_URL_KEY } from './storage';

export type ServerOption = { name: string; url: string };

export const DEFAULT_SERVERS: ServerOption[] = (
  (Constants.expoConfig?.extra?.defaultServers as ServerOption[]) ?? [
    { name: 'Server 2 — Admin', url: 'https://admin.carferry.online' },
    { name: 'Server 1 — Prod', url: 'https://carferry.online' },
  ]
);

export async function getActiveServerUrl(): Promise<string> {
  const stored = await prefs.get(SERVER_URL_KEY);
  if (stored) return stored;
  return DEFAULT_SERVERS[0].url;
}

export async function setActiveServerUrl(url: string): Promise<void> {
  await prefs.set(SERVER_URL_KEY, url);
}
