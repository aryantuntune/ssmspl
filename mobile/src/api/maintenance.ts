import { getClient } from './client';

const BASE = '/api/system-health/actions';

export type MaintenanceState = 'off' | 'maintenance' | 'update';

export type MaintenanceStatus = {
  state: MaintenanceState;
  server: string;
};

export async function getMaintenance(): Promise<MaintenanceStatus> {
  const c = await getClient();
  const r = await c.get(`${BASE}/maintenance`);
  return r.data;
}

export async function setMaintenance(
  enabled: boolean,
  mode: 'maintenance' | 'update' = 'maintenance',
): Promise<MaintenanceStatus> {
  const c = await getClient();
  const r = await c.post(`${BASE}/maintenance`, { enabled, mode });
  return r.data;
}
