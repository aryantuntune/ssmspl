import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  fetchBackupEvents,
  type BackupEvent,
  type BackupEventStatus,
} from '../api/backupEvents';
import { colors, radii, spacing, text as t } from '../theme';

/**
 * Full backup events history.
 *
 * Pulls the last N events (default 30) from /api/backups/events. The user
 * lands here from a tap on BackupHistoryTile.  Layout mirrors AlertRow /
 * IncidentReport style so the app feels consistent.
 */
export default function BackupsScreen({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<BackupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const e = await fetchBackupEvents({ limit: 30 });
      setEvents(e);
    } catch (err: any) {
      const detail = err?.response?.data?.detail || err?.message || 'Failed to load';
      setError(typeof detail === 'string' ? detail : 'Failed to load');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor={colors.textMuted}
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }
    >
      <View style={styles.headerRow}>
        <Pressable onPress={onClose} hitSlop={10}>
          <Text style={styles.backBtn}>‹ Back</Text>
        </Pressable>
        <Text style={styles.h1}>Backups</Text>
        <View style={{ width: 60 }} />
      </View>

      <Text style={styles.tagline}>
        Last 30 backup events across both servers. Pull to refresh.
      </Text>

      {loading && events.length === 0 && (
        <View style={styles.center}>
          <ActivityIndicator color={colors.action.primary} />
        </View>
      )}

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {!loading && events.length === 0 && !error && (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No backup events recorded yet.</Text>
          <Text style={styles.emptySub}>
            Once a server runs a backup job and reports to the API, events appear here.
          </Text>
        </View>
      )}

      {events.map((e) => (
        <Row key={e.id} event={e} />
      ))}
    </ScrollView>
  );
}

function Row({ event }: { event: BackupEvent }) {
  const { fg, bg, accent, glyph, label } = statusStyle(event.status);
  const dt = formatTimestamp(event.occurred_at);
  return (
    <View style={[styles.row, { borderLeftColor: accent, backgroundColor: bg }]}>
      <View style={styles.rowTop}>
        <Text style={[styles.rowTitle, { color: fg }]} numberOfLines={1}>
          {glyph} {prettyServer(event.server_name)} · {prettyType(event.backup_type)}
        </Text>
        <Text style={[styles.statusBadge, { color: fg, borderColor: accent }]}>{label}</Text>
      </View>
      <Text style={styles.rowMeta} numberOfLines={2}>
        {event.message}
      </Text>
      <View style={styles.rowFooter}>
        <Text style={styles.footerMeta}>{dt}</Text>
        {event.size_mb != null && (
          <Text style={styles.footerMeta}>{event.size_mb.toFixed(1)} MB</Text>
        )}
      </View>
    </View>
  );
}

function statusStyle(s: BackupEventStatus): {
  fg: string;
  bg: string;
  accent: string;
  glyph: string;
  label: string;
} {
  switch (s) {
    case 'success':
      return {
        fg: colors.okText,
        bg: colors.okBg,
        accent: colors.ok,
        glyph: '✓',
        label: 'OK',
      };
    case 'failed':
      return {
        fg: colors.critText,
        bg: colors.critBg,
        accent: colors.crit,
        glyph: '✗',
        label: 'FAILED',
      };
    case 'partial':
      return {
        fg: colors.warnText,
        bg: colors.warnBg,
        accent: colors.warn,
        glyph: '⚠',
        label: 'PARTIAL',
      };
    case 'running':
    default:
      return {
        fg: colors.infoText,
        bg: colors.infoBg,
        accent: colors.info,
        glyph: '↻',
        label: 'RUNNING',
      };
  }
}

function prettyServer(name: string): string {
  if (/^admin/i.test(name)) return 'Server 2';
  if (/carferry/i.test(name)) return 'Server 1';
  return name;
}

function prettyType(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\bdb\b/gi, 'DB')
    .trim();
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.valueOf())) return iso;
    return d.toLocaleString();
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: 60 },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xxl },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    marginTop: spacing.md,
  },
  backBtn: { color: colors.action.primary, fontSize: 16, fontWeight: '600' },
  h1: { ...t.h1, fontSize: 18 },
  tagline: { ...t.bodyMuted, marginBottom: spacing.lg },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.critBg,
    borderLeftWidth: 3,
    borderLeftColor: colors.crit,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
  errorIcon: { color: colors.crit, fontWeight: '900', fontSize: 14, width: 14, textAlign: 'center' },
  errorText: { color: colors.critText, fontSize: 13, flex: 1, lineHeight: 18 },

  emptyBox: {
    backgroundColor: colors.bgElev,
    borderLeftWidth: 3,
    borderLeftColor: colors.ok,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    marginBottom: spacing.md,
  },
  emptyText: { color: colors.okText, fontSize: 14, fontWeight: '700' },
  emptySub: { color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 16 },

  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  statusBadge: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    borderWidth: 1,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  rowMeta: { color: colors.textMuted, fontSize: 12, marginTop: 6, lineHeight: 16 },
  rowFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  footerMeta: { ...t.meta },
});
