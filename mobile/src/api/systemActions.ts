import { getClient } from './client';

const ACTIONS_BASE = '/api/system-health/actions';

export type ActionResult = {
  ok: boolean;
  detail?: Record<string, unknown> | null;
  error?: string | null;
};

export type ContainerInspect = {
  name: string;
  id?: string;
  status?: string;
  health?: string | null;
  restart_count?: number;
  started_at?: string;
  image?: string;
  error?: string;
};

export type ContainerStats = {
  name: string;
  cpu_pct: number;
  mem_used_mb: number;
  mem_limit_mb: number;
};

export type HostDaemonStatus = {
  ok: boolean;
  detail?: {
    queue_mounted: boolean;
    queue_root: string;
    allowed_actions: string[];
  };
};

// ─── container actions ──────────────────────────────────────────────

export async function listContainers(): Promise<ContainerInspect[]> {
  const c = await getClient();
  const r = await c.get(`${ACTIONS_BASE}/containers`);
  return r.data;
}

export async function tailContainerLogs(name: string, lines = 200): Promise<{ name: string; lines: string[]; count: number }> {
  const c = await getClient();
  const r = await c.get(`${ACTIONS_BASE}/containers/${encodeURIComponent(name)}/logs`, { params: { lines } });
  return r.data;
}

export async function getContainerStats(name: string): Promise<ContainerStats> {
  const c = await getClient();
  const r = await c.get(`${ACTIONS_BASE}/containers/${encodeURIComponent(name)}/stats`);
  return r.data;
}

export async function restartContainer(name: string): Promise<ActionResult> {
  const c = await getClient();
  const r = await c.post(`${ACTIONS_BASE}/restart-container`, { name });
  return r.data;
}

export async function pruneImages(): Promise<ActionResult> {
  const c = await getClient();
  const r = await c.post(`${ACTIONS_BASE}/prune-images`);
  return r.data;
}

// ─── filesystem actions ─────────────────────────────────────────────

export async function triggerBackup(): Promise<ActionResult> {
  const c = await getClient();
  const r = await c.post(`${ACTIONS_BASE}/trigger-backup`);
  return r.data;
}

export async function forceSync(): Promise<ActionResult> {
  const c = await getClient();
  const r = await c.post(`${ACTIONS_BASE}/force-sync`);
  return r.data;
}

// ─── DB actions ─────────────────────────────────────────────────────

export async function testPush(): Promise<ActionResult> {
  const c = await getClient();
  const r = await c.post(`${ACTIONS_BASE}/test-push`);
  return r.data;
}

export async function ackEvent(eventId: number): Promise<ActionResult> {
  const c = await getClient();
  const r = await c.post(`${ACTIONS_BASE}/events/${eventId}/ack`);
  return r.data;
}

export async function ackAllEvents(): Promise<ActionResult> {
  const c = await getClient();
  const r = await c.post(`${ACTIONS_BASE}/events/ack-all`);
  return r.data;
}

// ─── host-daemon actions ────────────────────────────────────────────

export async function getHostDaemonStatus(): Promise<HostDaemonStatus> {
  const c = await getClient();
  const r = await c.get(`${ACTIONS_BASE}/host-daemon-status`);
  return r.data;
}

export async function submitHostAction(
  action: string,
  params: Record<string, unknown> = {},
  timeoutS = 30,
): Promise<ActionResult> {
  const c = await getClient();
  const r = await c.post(`${ACTIONS_BASE}/host`, { action, params, timeout_s: timeoutS });
  return r.data;
}

// ─── version + releases + rollback ─────────────────────────────────

export type VersionInfo = {
  git_sha: string;
  build_ts: string;
  alembic_head: string;
  image_tag: string;
};

export type ReleaseEntry = {
  image_tag: string;
  git_sha: string;
  build_ts: string;
  alembic_head: string;
  deployed_at?: string;
  deployed_by?: string;
  host?: string;
  image_present: boolean;
  is_current: boolean;
};

export type ReleasesResponse = {
  current: VersionInfo;
  releases: ReleaseEntry[];
};

export async function getCurrentVersion(): Promise<VersionInfo> {
  const c = await getClient();
  const r = await c.get(`${ACTIONS_BASE}/version`);
  return r.data;
}

export async function listReleases(limit = 20): Promise<ReleasesResponse> {
  const c = await getClient();
  const r = await c.get(`${ACTIONS_BASE}/releases`, { params: { limit } });
  return r.data;
}

export async function rollbackToRelease(
  imageTag: string,
  forceSchemaDrift = false,
): Promise<ActionResult> {
  const c = await getClient();
  const r = await c.post(`${ACTIONS_BASE}/rollback`, {
    image_tag: imageTag,
    force_schema_drift: forceSchemaDrift,
  });
  return r.data;
}

// ─── incident report ───────────────────────────────────────────────

export type IncidentReport = {
  generated_at: string;
  version: VersionInfo;
  snapshot: any;
  containers: any[];
  container_logs: Record<string, string[]>;
  events: Array<{
    id: number;
    server_name: string;
    severity: string;
    check_name: string;
    message: string;
    created_at: string | null;
    acked_at: string | null;
  }>;
  activity: Array<{
    id: string | null;
    action_type: string;
    user_id: string | null;
    created_at: string | null;
    metadata: Record<string, unknown> | null;
  }>;
};

export async function fetchIncidentReport(logLines = 200): Promise<IncidentReport> {
  const c = await getClient();
  const r = await c.get(`${ACTIONS_BASE}/incident-report`, { params: { log_lines: logLines } });
  return r.data;
}
