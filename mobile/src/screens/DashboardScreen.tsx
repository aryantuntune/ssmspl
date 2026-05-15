import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  fetchEvents,
  fetchStatus,
  type HealthEvent,
  type StatusSnapshot,
} from '../api/systemHealth';
import {
  fetchBackupEvents,
  fetchBackupSummary,
  type BackupEvent,
  type BackupSummary,
} from '../api/backupEvents';
import {
  ackAllEvents,
  getHostDaemonStatus,
  listContainers,
  type ContainerInspect,
} from '../api/systemActions';
import {
  fireLocalAlertsForNewBackupFailures,
  fireLocalAlertsForNewCrits,
} from '../lib/localAlerts';
import { ActionsPanel } from '../components/ActionsPanel';
import { AlertRow } from '../components/AlertRow';
import { BackupHistoryTile } from '../components/BackupHistoryTile';
import { ContainerCard } from '../components/ContainerCard';
import { HealthTile } from '../components/HealthTile';
import { MaintenanceTile } from '../components/MaintenanceTile';
import { ServerSwitcher } from '../components/ServerSwitcher';
import { StatusBadge } from '../components/StatusBadge';
import { SystemInfoTile } from '../components/SystemInfoTile';
import { TodayTile } from '../components/TodayTile';
import { activeServer, type ServerId } from '../lib/storage';
import { colors, radii, spacing, text as t, severityPalette } from '../theme';

const REFRESH_MS = 30_000;

export default function DashboardScreen({
  onSettings,
  onVersions,
  onIncidentReport,
  onBackups,
  onTodos,
  onTailLogs,
}: {
  onSettings: () => void;
  onVersions: () => void;
  onIncidentReport: () => void;
  onBackups: () => void;
  onTodos: () => void;
  onTailLogs: (containerName: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(null);
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [containers, setContainers] = useState<ContainerInspect[]>([]);
  const [backupSummary, setBackupSummary] = useState<BackupSummary>({ rows: [] });
  const [hostQueueAvailable, setHostQueueAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkAcking, setBulkAcking] = useState(false);
  // bumped by ServerSwitcher to force a remount of dependent children when
  // the active server changes, so cached state doesn't bleed across servers.
  const [serverEpoch, setServerEpoch] = useState(0);
  // Mirror of activeServer.get() — drives the prominent "Showing data from"
  // badge so the user is never in doubt which server's metrics are on screen.
  // Events stored in Server 2's DB can carry server_name="Server 1 Prod"
  // (because Server 2's health_check.sh probes Server 1's public URL); that
  // makes the events feed look like it's "about Server 1" even when the
  // active backend is Server 2. The badge cuts that ambiguity off at the top.
  const [activeId, setActiveId] = useState<ServerId | null>(null);

  // load() reads the current epoch when it starts. If the epoch has bumped
  // by the time the response arrives (i.e. the user switched servers mid-
  // flight), discard the result so server-A's slow response can't overwrite
  // server-B's fresh data. The race manifested as "tile highlight swaps but
  // metrics stay on old server" when the old server's fetch resolved AFTER
  // the new server's setSnapshot.
  const load = useCallback(async () => {
    const myEpoch = serverEpoch;
    setError(null);
    try {
      const [s, e] = await Promise.all([fetchStatus(), fetchEvents({ limit: 25, unacked_only: true })]);
      if (myEpoch !== epochRef.current) return; // stale — discard
      setSnapshot(s);
      setEvents(e);

      // Fire foreground local notifications for any new CRIT events the user
      // hasn't seen — belt-and-suspenders alongside the ntfy.sh server push.
      fireLocalAlertsForNewCrits(e).catch(() => {});

      try {
        const cs = await listContainers();
        if (myEpoch === epochRef.current) setContainers(cs);
      } catch {
        if (myEpoch === epochRef.current) setContainers([]);
      }

      // Backup events: summary for the tile, full list for failure-detection.
      try {
        const summary = await fetchBackupSummary();
        if (myEpoch === epochRef.current) setBackupSummary(summary);
      } catch {
        if (myEpoch === epochRef.current) setBackupSummary({ rows: [] });
      }
      try {
        const recent: BackupEvent[] = await fetchBackupEvents({ limit: 25 });
        fireLocalAlertsForNewBackupFailures(recent).catch(() => {});
      } catch {
        // backup events endpoint may not be deployed everywhere yet; tolerate
        // its absence rather than red-erroring the whole dashboard.
      }

      try {
        const h = await getHostDaemonStatus();
        if (myEpoch === epochRef.current) setHostQueueAvailable(!!h.detail?.queue_mounted);
      } catch {
        if (myEpoch === epochRef.current) setHostQueueAvailable(false);
      }
    } catch (err: any) {
      if (myEpoch !== epochRef.current) return;
      const detail = err?.response?.data?.detail || err?.message || 'Failed to load';
      setError(typeof detail === 'string' ? detail : 'Failed to load');
    } finally {
      if (myEpoch === epochRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverEpoch]);

  // Mirror serverEpoch into a ref so in-flight loads can compare without
  // capturing a stale closure value.
  const epochRef = React.useRef(0);
  useEffect(() => {
    epochRef.current = serverEpoch;
  }, [serverEpoch]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load, serverEpoch]);

  // Re-read the active server whenever the epoch bumps. Keeps the visible
  // "Showing data from" badge synced with whatever the switcher just did.
  useEffect(() => {
    (async () => setActiveId(await activeServer.get()))();
  }, [serverEpoch]);

  const onAckAll = () => {
    Alert.alert(
      'Acknowledge all alerts?',
      `Marks ${events.length} alert(s) as read. They stay in the database for audit but disappear from this list.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ack all',
          onPress: async () => {
            setBulkAcking(true);
            try {
              const r = await ackAllEvents();
              if (r.ok) {
                setEvents([]);
              } else {
                Alert.alert('Failed', r.error ?? 'unknown');
              }
            } catch (e: any) {
              Alert.alert('Failed', e?.response?.data?.detail || e?.message || 'unknown');
            } finally {
              setBulkAcking(false);
            }
          },
        },
      ],
    );
  };

  if (loading && !snapshot) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.action.primary} />
        <Text style={styles.dim}>Connecting…</Text>
      </View>
    );
  }

  const overall = snapshot?.overall_severity ?? 'OK';
  const overallPalette = severityPalette(overall);

  const critCount = events.filter((e) => e.severity === 'CRIT').length;
  const warnCount = events.filter((e) => e.severity === 'WARN').length;

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
      {/* ── Top bar: app title + settings cog ─────────────────────── */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.appTitle}>Admin Console</Text>
          <Text style={styles.appSub}>System health & ops</Text>
        </View>
        <Pressable
          onPress={onSettings}
          style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
        >
          <Text style={styles.iconBtnText}>⚙</Text>
        </Pressable>
      </View>

      {/* ── Server switcher: tap the OTHER tile to swap ─────────── */}
      <ServerSwitcher
        onSwitched={() => {
          setSnapshot(null);
          setEvents([]);
          setContainers([]);
          setBackupSummary({ rows: [] });
          setLoading(true);
          setServerEpoch((x) => x + 1);
        }}
      />

      {/* ── Status hero — biggest, loudest thing on screen ────────── */}
      <View style={[styles.hero, { borderColor: overallPalette.accent, backgroundColor: overallPalette.bg }]}>
        <View style={styles.heroTop}>
          <Text style={[styles.heroTitle, { color: overallPalette.fg }]}>{statusHeadline(overall, critCount)}</Text>
          <StatusBadge severity={overall} large />
        </View>
        <Text style={[styles.heroSub, { color: overallPalette.fg }]}>
          {statusSubtitle(overall, critCount, warnCount)}
        </Text>
        {activeId != null && (
          <View
            style={[
              styles.heroServerBadge,
              {
                backgroundColor: activeId === 'server2' ? colors.serverAdminBg : colors.serverProdBg,
                borderColor: activeId === 'server2' ? colors.serverAdmin : colors.serverProd,
              },
            ]}
          >
            <View
              style={[
                styles.heroServerDot,
                { backgroundColor: activeId === 'server2' ? colors.serverAdmin : colors.serverProd },
              ]}
            />
            <Text
              style={[
                styles.heroServerText,
                { color: activeId === 'server2' ? colors.serverAdmin : colors.serverProd },
              ]}
            >
              SHOWING DATA FROM · {activeId === 'server2' ? 'ADMIN PORTAL' : 'PRODUCTION'}
            </Text>
          </View>
        )}
      </View>

      {error && (
        <View style={styles.errorBox}>
          <Text style={styles.errorIcon}>!</Text>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      )}

      {/* ── Quick jumps ── */}
      <View style={styles.quickJump}>
        <JumpCard
          label="Todos"
          sub="Follow-ups & fixes"
          icon="✓"
          onPress={onTodos}
        />
        <JumpCard
          label="Incident report"
          sub="Logs · events · activity"
          icon="📋"
          onPress={onIncidentReport}
        />
      </View>
      <View style={styles.quickJump}>
        <JumpCard
          label="Versions"
          sub="Switch to a previous build"
          icon="↺"
          onPress={onVersions}
        />
      </View>

      <MaintenanceTile />

      {snapshot && (
        <>
          {/* High-priority business metrics first */}
          {snapshot.today && <TodayTile today={snapshot.today} />}

          <Text style={styles.sectionTitle}>Resources</Text>
          {snapshot.system && <SystemInfoTile system={snapshot.system} />}
          <View style={styles.duo}>
            <View style={styles.duoCol}>
              <HealthTile
                title="Disk"
                severity={snapshot.disk.severity}
                rows={[
                  { label: 'Used', value: `${snapshot.disk.pct_used}%` },
                  { label: 'Free', value: `${snapshot.disk.free_gb} GB` },
                  { label: 'Total', value: `${snapshot.disk.total_gb} GB` },
                ]}
              />
            </View>
            <View style={styles.duoCol}>
              <HealthTile
                title="Memory"
                severity={snapshot.memory.severity}
                rows={[
                  { label: 'Used', value: `${snapshot.memory.pct_used}%` },
                  { label: 'Free', value: `${snapshot.memory.available_mb} MB` },
                  { label: 'Total', value: `${snapshot.memory.total_mb} MB` },
                ]}
              />
            </View>
          </View>

          <Text style={styles.sectionTitle}>Database</Text>
          <HealthTile
            title="Connections"
            severity={snapshot.db.severity}
            rows={
              snapshot.db.error
                ? [{ label: 'Error', value: snapshot.db.error.slice(0, 60) }]
                : [
                    { label: 'In use', value: `${snapshot.db.connections}/${snapshot.db.max_connections}` },
                    { label: 'Saturation', value: `${snapshot.db.pct_used ?? '?'}%` },
                  ]
            }
          />
          <HealthTile
            title="Last ticket"
            severity={snapshot.ticketing.severity}
            rows={[
              { label: 'Created', value: `${snapshot.ticketing.minutes_since_last_ticket} min ago` },
              {
                label: 'Business hours',
                value: snapshot.ticketing.in_business_hours ? 'yes' : 'no',
              },
            ]}
          />
          {snapshot.replication.applicable && (
            <HealthTile
              title="Replication (admin DB)"
              severity={snapshot.replication.severity ?? 'OK'}
              rows={
                snapshot.replication.subscriptions?.map((s) => ({
                  label: s.name,
                  value: s.alive ? `alive · ${s.lag_s}s lag` : 'DEAD',
                })) ?? [{ label: 'Status', value: 'no subscriptions' }]
              }
            />
          )}

          <Text style={styles.sectionTitle}>Backups</Text>
          <HealthTile
            title="Latest backup"
            severity={snapshot.backup.severity}
            rows={
              snapshot.backup.present
                ? snapshot.backup.latest_file
                  ? [
                      { label: 'Age', value: `${snapshot.backup.age_hours} h ago` },
                      { label: 'Size', value: `${snapshot.backup.latest_size_mb} MB` },
                      { label: 'Total dumps', value: `${snapshot.backup.count}` },
                    ]
                  : [{ label: 'Status', value: snapshot.backup.message ?? 'no dumps yet' }]
                : [{ label: 'Status', value: snapshot.backup.message ?? 'backup dir not mounted' }]
            }
          />
          <BackupHistoryTile
            rows={backupSummary.rows}
            onOpen={onBackups}
            loading={loading && backupSummary.rows.length === 0}
          />
        </>
      )}

      {containers.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Containers</Text>
          {containers.map((c) => (
            <ContainerCard
              key={c.name}
              inspect={c}
              onTailLogs={onTailLogs}
              onAfterAction={load}
            />
          ))}
        </>
      )}

      {/* ── Actions live in their own block, visually distinct from
            readouts above ─────────────────────────────────────────── */}
      <View style={styles.actionsBlock}>
        <Text style={styles.actionsHeading}>Actions</Text>
        <Text style={styles.actionsSub}>Ops you can take from your phone.</Text>
        <ActionsPanel hostQueueAvailable={hostQueueAvailable} onAfterAction={load} />
      </View>

      <View style={styles.alertsHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>Open alerts</Text>
          <Text style={styles.dim}>
            {events.length === 0
              ? 'Showing only un-acknowledged events.'
              : `${events.length} alert${events.length === 1 ? '' : 's'} need attention.`}
          </Text>
        </View>
        {events.length > 0 && (
          <Pressable
            onPress={onAckAll}
            disabled={bulkAcking}
            style={({ pressed }) => [styles.ackAllBtn, pressed && { opacity: 0.7 }]}
          >
            {bulkAcking ? (
              <ActivityIndicator color={colors.action.ghostText} size="small" />
            ) : (
              <Text style={styles.ackAllText}>Ack all</Text>
            )}
          </Pressable>
        )}
      </View>

      {events.length === 0 ? (
        <View style={styles.emptyAlerts}>
          <Text style={styles.emptyText}>✓ All clear — no open alerts.</Text>
          <Text style={styles.emptySubText}>
            New CRIT events from the host health-check will appear here and trigger a push notification.
          </Text>
        </View>
      ) : (
        events.map((e) => (
          <AlertRow
            key={e.id}
            event={e}
            onAcked={(id) => setEvents((cur) => cur.filter((ev) => ev.id !== id))}
          />
        ))
      )}
    </ScrollView>
  );
}

function JumpCard({
  label,
  sub,
  icon,
  onPress,
}: {
  label: string;
  sub: string;
  icon: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.jumpBtn, pressed && { opacity: 0.7 }]}
    >
      <Text style={styles.jumpIcon}>{icon}</Text>
      <Text style={styles.jumpTitle}>{label}</Text>
      <Text style={styles.jumpSub} numberOfLines={1}>{sub}</Text>
    </Pressable>
  );
}

function statusHeadline(sev: string, crits: number): string {
  if (sev === 'CRIT' || crits > 0) return crits > 0 ? `${crits} CRITICAL alert${crits === 1 ? '' : 's'}` : 'Critical issue';
  if (sev === 'WARN') return 'Degraded — needs attention';
  if (sev === 'INFO') return 'Information available';
  return 'All systems healthy';
}

function statusSubtitle(sev: string, crits: number, warns: number): string {
  if (crits > 0) return 'Investigate now — push notifications were sent.';
  if (warns > 0) return `${warns} warning${warns === 1 ? '' : 's'} pending review.`;
  if (sev === 'WARN') return 'A subsystem is reporting WARN — see tiles below.';
  if (sev === 'INFO') return 'Everything operational. Routine checks below.';
  return 'Last checked just now. Pull to refresh.';
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  dim: { ...t.meta, marginTop: 4 },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: spacing.md,
  },
  appTitle: { ...t.h1, fontSize: 22 },
  appSub: { ...t.bodyMuted, marginTop: 2 },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radii.md,
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnText: { color: colors.textMuted, fontSize: 20 },

  hero: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderLeftWidth: 4,
    marginBottom: spacing.md,
  },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  heroServerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    borderWidth: 1,
  },
  heroServerDot: { width: 8, height: 8, borderRadius: 4 },
  heroServerText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  heroTitle: { fontSize: 18, fontWeight: '700', flexShrink: 1 },
  heroSub: { fontSize: 13, marginTop: 6, opacity: 0.85, lineHeight: 18 },

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

  quickJump: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  jumpBtn: {
    flex: 1,
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  jumpIcon: { fontSize: 18, marginBottom: 4 },
  jumpTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  jumpSub: { color: colors.textDim, fontSize: 11, marginTop: 2 },

  sectionTitle: {
    ...t.section,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },

  duo: { flexDirection: 'row', gap: spacing.sm },
  duoCol: { flex: 1 },

  actionsBlock: {
    backgroundColor: colors.bgElev2,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginTop: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionsHeading: { ...t.h2, fontSize: 16, marginBottom: 2 },
  actionsSub: { ...t.bodyMuted, fontSize: 12, marginBottom: spacing.sm },

  alertsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 6,
    gap: spacing.sm,
  },
  ackAllBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.action.ghost,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.action.ghostBorder,
    marginTop: spacing.lg,
  },
  ackAllText: { color: colors.action.ghostText, fontSize: 12, fontWeight: '700' },
  emptyAlerts: {
    backgroundColor: colors.bgElev,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: colors.ok,
  },
  emptyText: { color: colors.okText, fontSize: 14, fontWeight: '700' },
  emptySubText: { color: colors.textMuted, fontSize: 12, marginTop: 6, lineHeight: 16 },
});
