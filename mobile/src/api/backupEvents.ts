import { getClient } from './client';

/**
 * Backup events API.
 *
 * Backed by the backend endpoints landed in commit `e43ff8b`:
 *   GET /api/backups/events             — recent events, newest first
 *   GET /api/backups/events/summary     — per-(server, type) freshness rollup
 *
 * Both are SUPER_ADMIN/ADMIN-only.
 *
 * IMPORTANT: the backend's response shape uses `server_id`,
 * `file_size_bytes`, `latest_attempt_at` etc. and `/summary` returns an
 * array DIRECTLY (not wrapped in `{rows: [...]}`). This client wraps the
 * raw response in the historical mobile-side shape so the consumers
 * (BackupHistoryTile / BackupsScreen / localAlerts) keep working without
 * each one needing its own field-rename. If you change the backend
 * contract, change the adapter functions at the bottom of this file —
 * not the consumers.
 */

export type BackupEventStatus = 'success' | 'failed' | 'partial' | 'running';

export type BackupEvent = {
  id: number;
  /** Logical server identity, e.g. "server1-prod" or "server2-admin". */
  server_name: string;
  /** Type of backup, e.g. "db_dump", "snapshot". */
  backup_type: string;
  status: BackupEventStatus;
  /** Wall-clock ISO 8601 timestamp. */
  occurred_at: string;
  /** Size in MB if the backup produced an artifact, otherwise null. */
  size_mb: number | null;
  /** Human-readable detail (error message on failure, file name on success). */
  message: string;
};

export type BackupSummaryRow = {
  server_name: string;
  backup_type: string;
  latest_status: BackupEventStatus;
  /** Hours since last *successful* event of this type, or +Infinity if never. */
  freshness_hours: number;
  /** ISO 8601 timestamp of latest attempt (success or fail), or null. */
  latest_occurred_at: string | null;
  /** Most recent file/message (for sub-rows in the tile). */
  latest_message: string | null;
  /** Latest size in MB (null if not applicable). */
  latest_size_mb: number | null;
};

export type BackupSummary = {
  /** Per-(server, type) rows. */
  rows: BackupSummaryRow[];
};

// ---------------------------------------------------------------------------
// Adapter — the raw shapes returned by the backend.
// ---------------------------------------------------------------------------

type RawBackupEvent = {
  id: number;
  server_id: string;
  backup_type: string;
  status: string;
  file_name: string | null;
  file_size_bytes: number | null;
  sha256: string | null;
  message: string | null;
  occurred_at: string;
  received_at: string;
};

type RawBackupSummaryRow = {
  server_id: string;
  backup_type: string;
  latest_success_at: string | null;
  latest_attempt_at: string | null;
  latest_status: string | null;
  latest_size_bytes: number | null;
  freshness_hours: number | null;
};

function normalizeStatus(s: string | null | undefined): BackupEventStatus {
  if (s === 'success' || s === 'failed' || s === 'partial' || s === 'running') return s;
  return 'failed';
}

function adaptEvent(raw: RawBackupEvent): BackupEvent {
  const sizeMb =
    raw.file_size_bytes != null ? Math.round((raw.file_size_bytes / 1_048_576) * 10) / 10 : null;
  return {
    id: raw.id,
    server_name: raw.server_id,
    backup_type: raw.backup_type,
    status: normalizeStatus(raw.status),
    occurred_at: raw.occurred_at,
    size_mb: sizeMb,
    message: raw.message ?? raw.file_name ?? '',
  };
}

function adaptSummaryRow(raw: RawBackupSummaryRow): BackupSummaryRow {
  const sizeMb =
    raw.latest_size_bytes != null
      ? Math.round((raw.latest_size_bytes / 1_048_576) * 10) / 10
      : null;
  return {
    server_name: raw.server_id,
    backup_type: raw.backup_type,
    latest_status: normalizeStatus(raw.latest_status),
    // backend returns null when no success has ever been recorded; callers
    // compare against a number, so use +Infinity so a stale check (>36)
    // correctly flags "never succeeded".
    freshness_hours: raw.freshness_hours ?? Number.POSITIVE_INFINITY,
    latest_occurred_at: raw.latest_attempt_at,
    latest_message: null, // backend doesn't expose this on /summary
    latest_size_mb: sizeMb,
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function fetchBackupSummary(): Promise<BackupSummary> {
  const c = await getClient();
  const r = await c.get<RawBackupSummaryRow[]>('/api/backups/events/summary');
  const rows = Array.isArray(r.data) ? r.data.map(adaptSummaryRow) : [];
  return { rows };
}

export async function fetchBackupEvents(opts?: {
  limit?: number;
  server_name?: string;
  backup_type?: string;
  status?: BackupEventStatus;
}): Promise<BackupEvent[]> {
  const c = await getClient();
  // Backend filter param is `server_id`, not `server_name`. Rename on the way out.
  const params: Record<string, string | number | undefined> = { limit: opts?.limit };
  if (opts?.server_name) params.server_id = opts.server_name;
  if (opts?.backup_type) params.backup_type = opts.backup_type;
  if (opts?.status) params.status = opts.status;
  const r = await c.get<RawBackupEvent[]>('/api/backups/events', { params });
  return Array.isArray(r.data) ? r.data.map(adaptEvent) : [];
}
