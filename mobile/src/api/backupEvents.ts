import { getClient } from './client';

/**
 * Backup events API.
 *
 * Backed by the sister-agent's new endpoints on the backend:
 *   GET /api/backups/events             — recent events, newest first
 *   GET /api/backups/events/summary     — per-(server, type) freshness rollup
 *
 * Both are SUPER_ADMIN-only on the server side.
 */

export type BackupEventStatus = 'success' | 'failed' | 'partial' | 'running';

export type BackupEvent = {
  id: number;
  /** Logical server name, e.g. "carferry.online" or "admin.carferry.online" */
  server_name: string;
  /** Type of backup, e.g. "prod_db", "admin_snapshot", "media", "logs". */
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
  /** Latest event status seen for this (server, type). */
  latest_status: BackupEventStatus;
  /** Hours since latest_occurred_at. Inf if no event ever. */
  freshness_hours: number;
  /** ISO 8601 timestamp of latest event, or null if no event recorded. */
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

export async function fetchBackupSummary(): Promise<BackupSummary> {
  const c = await getClient();
  const r = await c.get('/api/backups/events/summary');
  return r.data;
}

export async function fetchBackupEvents(opts?: {
  limit?: number;
  server_name?: string;
  backup_type?: string;
  status?: BackupEventStatus;
}): Promise<BackupEvent[]> {
  const c = await getClient();
  const r = await c.get('/api/backups/events', { params: opts ?? {} });
  return r.data;
}
