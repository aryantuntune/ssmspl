import { getClient } from './client';

export type Severity = 'OK' | 'INFO' | 'WARN' | 'CRIT';

export type DiskStatus = {
  total_gb: number; used_gb: number; free_gb: number; pct_used: number; severity: Severity;
};
export type MemoryStatus = {
  total_mb: number; used_mb: number; available_mb: number; pct_used: number; severity: Severity;
};
export type DbStatus = {
  connections?: number; max_connections?: number; pct_used?: number; severity: Severity; error?: string;
};
export type BackupStatus = {
  present: boolean; count?: number; latest_file?: string; latest_size_mb?: number; age_hours?: number;
  severity: Severity; message?: string;
};
export type TicketingStatus = {
  seconds_since_last_ticket: number; minutes_since_last_ticket: number;
  in_business_hours: boolean; severity: Severity;
};
export type ReplicationStatus = {
  applicable: boolean;
  subscriptions?: { name: string; enabled: boolean; alive: boolean; lag_s: number; severity: Severity }[];
  severity?: Severity;
};

export type StatusSnapshot = {
  server: string;
  checked_at: string;
  disk: DiskStatus;
  memory: MemoryStatus;
  db: DbStatus;
  backup: BackupStatus;
  ticketing: TicketingStatus;
  replication: ReplicationStatus;
  overall_severity: Severity;
};

export type HealthEvent = {
  id: number;
  server_name: string;
  severity: 'INFO' | 'WARN' | 'CRIT';
  check_name: string;
  message: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

export type PushDeviceRead = {
  id: string;
  expo_push_token: string;
  device_label: string | null;
  platform: string;
  is_active: boolean;
  created_at: string;
  last_seen_at: string;
};

export async function fetchStatus(): Promise<StatusSnapshot> {
  const c = await getClient();
  const r = await c.get('/api/system-health/status');
  return r.data;
}

export async function fetchEvents(params: { severity?: 'INFO' | 'WARN' | 'CRIT'; limit?: number } = {}): Promise<HealthEvent[]> {
  const c = await getClient();
  const r = await c.get('/api/system-health/events', { params });
  return r.data;
}

export async function registerDevice(token: string, label?: string): Promise<PushDeviceRead> {
  const c = await getClient();
  const r = await c.post('/api/system-health/devices', {
    expo_push_token: token,
    device_label: label,
    platform: 'android',
  });
  return r.data;
}

export async function listDevices(): Promise<PushDeviceRead[]> {
  const c = await getClient();
  const r = await c.get('/api/system-health/devices');
  return r.data;
}

export async function unregisterDevice(id: string): Promise<void> {
  const c = await getClient();
  await c.delete(`/api/system-health/devices/${id}`);
}
