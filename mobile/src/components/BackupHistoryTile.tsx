import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { BackupSummaryRow } from '../api/backupEvents';
import { colors, radii, spacing, text as t } from '../theme';

/**
 * Per-server-per-type backup freshness rollup.
 *
 * Each row is the LATEST event for a given (server, backup_type) combo. Rows
 * go red + flag when:
 *   • latest_status is "failed" or "partial", OR
 *   • freshness_hours exceeds `staleHours` (default 36).
 *
 * Tapping the tile opens the full BackupsScreen (events history).
 */
export function BackupHistoryTile({
  rows,
  staleHours = 36,
  onOpen,
  loading = false,
}: {
  rows: BackupSummaryRow[];
  staleHours?: number;
  onOpen?: () => void;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onOpen}
      style={({ pressed }) => [styles.tile, pressed && onOpen && { opacity: 0.85 }]}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Backup history</Text>
        <Text style={styles.dim}>
          {loading
            ? 'Loading…'
            : `${rows.length} stream${rows.length === 1 ? '' : 's'}`}
        </Text>
      </View>
      {rows.length === 0 ? (
        <Text style={styles.empty}>
          {loading ? 'Fetching backup events…' : 'No backup events recorded yet.'}
        </Text>
      ) : (
        rows.map((r, i) => {
          const stale = r.freshness_hours > staleHours;
          const failed = r.latest_status === 'failed' || r.latest_status === 'partial';
          const bad = stale || failed;
          return (
            <View
              key={`${r.server_name}::${r.backup_type}`}
              style={[styles.row, i === 0 && styles.rowFirst, bad && styles.rowBad]}
            >
              <View style={styles.rowLeft}>
                <Text style={[styles.label, bad && styles.labelBad]} numberOfLines={1}>
                  {prettyServer(r.server_name)} {prettyType(r.backup_type)}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {fmtAge(r.freshness_hours)} {r.latest_size_mb != null && `· ${r.latest_size_mb.toFixed(1)} MB`}
                </Text>
              </View>
              <Text style={[styles.statusGlyph, bad ? styles.bad : styles.ok]}>
                {bad ? '⚠' : '✓'}
              </Text>
            </View>
          );
        })
      )}
      {onOpen && (
        <Text style={styles.linkHint}>Tap for full history →</Text>
      )}
    </Pressable>
  );
}

function prettyServer(name: string): string {
  if (/^admin/i.test(name)) return 'Server 2';
  if (/carferry/i.test(name)) return 'Server 1';
  return name;
}

function prettyType(name: string): string {
  // Snake_case to friendlier short label, e.g. "prod_db" -> "prod DB"
  return name
    .replace(/_/g, ' ')
    .replace(/\bdb\b/gi, 'DB')
    .trim();
}

function fmtAge(hours: number): string {
  if (!Number.isFinite(hours) || hours < 0) return 'no events';
  if (hours < 1) return `${Math.round(hours * 60)} min ago`;
  if (hours < 24) return `${hours.toFixed(1)}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.bgElev,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: { ...t.h2, fontSize: 14 },
  dim: { ...t.meta },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowFirst: { borderTopWidth: 0 },
  rowBad: {
    backgroundColor: colors.critBg,
    borderRadius: radii.sm,
    borderTopWidth: 0,
    marginTop: 4,
    paddingHorizontal: 8,
  },
  rowLeft: { flex: 1, paddingRight: spacing.sm },
  label: { color: colors.text, fontSize: 13, fontWeight: '600' },
  labelBad: { color: colors.critText },
  meta: { ...t.meta, marginTop: 2 },
  statusGlyph: { fontSize: 16, fontWeight: '900' },
  ok: { color: colors.ok },
  bad: { color: colors.crit },
  empty: { color: colors.textDim, fontSize: 12, fontStyle: 'italic' },
  linkHint: {
    ...t.meta,
    marginTop: spacing.sm,
    textAlign: 'right',
    color: colors.action.primary,
    fontWeight: '600',
  },
});
