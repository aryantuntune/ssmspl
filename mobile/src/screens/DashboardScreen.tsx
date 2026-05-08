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
  fetchBackupHistory,
  fetchEvents,
  fetchStatus,
  type BackupHistoryEntry,
  type HealthEvent,
  type StatusSnapshot,
} from '../api/systemHealth';
import {
  ackAllEvents,
  getHostDaemonStatus,
  listContainers,
  type ContainerInspect,
} from '../api/systemActions';
import { ActionsPanel } from '../components/ActionsPanel';
import { AlertRow } from '../components/AlertRow';
import { BackupHistoryTile } from '../components/BackupHistoryTile';
import { ContainerCard } from '../components/ContainerCard';
import { HealthTile } from '../components/HealthTile';
import { StatusBadge } from '../components/StatusBadge';
import { SystemInfoTile } from '../components/SystemInfoTile';
import { TodayTile } from '../components/TodayTile';

const REFRESH_MS = 30_000;

export default function DashboardScreen({
  onSettings,
  onVersions,
  onIncidentReport,
  onTailLogs,
}: {
  onSettings: () => void;
  onVersions: () => void;
  onIncidentReport: () => void;
  onTailLogs: (containerName: string) => void;
}) {
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(null);
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [containers, setContainers] = useState<ContainerInspect[]>([]);
  const [backups, setBackups] = useState<BackupHistoryEntry[]>([]);
  const [hostQueueAvailable, setHostQueueAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkAcking, setBulkAcking] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, e] = await Promise.all([fetchStatus(), fetchEvents({ limit: 25, unacked_only: true })]);
      setSnapshot(s);
      setEvents(e);

      try { setContainers(await listContainers()); } catch { setContainers([]); }
      try { setBackups(await fetchBackupHistory(5)); } catch { setBackups([]); }
      try {
        const h = await getHostDaemonStatus();
        setHostQueueAvailable(!!h.detail?.queue_mounted);
      } catch {
        setHostQueueAvailable(false);
      }
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
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

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
        <ActivityIndicator color="#3b82f6" />
        <Text style={styles.dim}>Connecting…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          tintColor="#cbd5e1"
          onRefresh={() => {
            setRefreshing(true);
            load();
          }}
        />
      }
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>System Health</Text>
          <Text style={styles.dim}>{snapshot?.server ?? 'unknown'}</Text>
        </View>
        <View style={styles.headerRight}>
          {snapshot && <StatusBadge severity={snapshot.overall_severity} />}
          <Pressable onPress={onSettings} style={styles.iconBtn}>
            <Text style={styles.icon}>⚙</Text>
          </Pressable>
        </View>
      </View>

      <View style={styles.quickJump}>
        <Pressable onPress={onIncidentReport} style={styles.jumpBtn}>
          <Text style={styles.jumpTitle}>Incident report</Text>
          <Text style={styles.jumpSub}>Logs · events · activity in one place</Text>
        </Pressable>
        <Pressable onPress={onVersions} style={styles.jumpBtn}>
          <Text style={styles.jumpTitle}>Versions & rollback</Text>
          <Text style={styles.jumpSub}>Switch admin-backend to a previous build</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {snapshot && (
        <>
          {/* High-priority business metrics first */}
          {snapshot.today && <TodayTile today={snapshot.today} />}

          <Text style={styles.sectionTitle}>Resources</Text>
          {snapshot.system && <SystemInfoTile system={snapshot.system} />}
          <HealthTile
            title="Disk"
            severity={snapshot.disk.severity}
            rows={[
              { label: 'Used', value: `${snapshot.disk.pct_used}% of ${snapshot.disk.total_gb} GB` },
              { label: 'Free', value: `${snapshot.disk.free_gb} GB` },
            ]}
          />
          <HealthTile
            title="Memory"
            severity={snapshot.memory.severity}
            rows={[
              { label: 'Used', value: `${snapshot.memory.pct_used}% of ${snapshot.memory.total_mb} MB` },
              { label: 'Available', value: `${snapshot.memory.available_mb} MB` },
            ]}
          />

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
          <BackupHistoryTile entries={backups} />
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

      <Text style={styles.sectionTitle}>Actions</Text>
      <ActionsPanel hostQueueAvailable={hostQueueAvailable} onAfterAction={load} />

      <View style={styles.alertsHeader}>
        <View>
          <Text style={styles.sectionTitle}>Open alerts</Text>
          <Text style={styles.dim}>
            {events.length === 0
              ? 'Showing only un-acknowledged events.'
              : `${events.length} alert${events.length === 1 ? '' : 's'} need attention.`}
          </Text>
        </View>
        {events.length > 0 && (
          <Pressable onPress={onAckAll} disabled={bulkAcking} style={styles.ackAllBtn}>
            {bulkAcking ? (
              <ActivityIndicator color="#cbd5e1" size="small" />
            ) : (
              <Text style={styles.ackAllText}>Ack all</Text>
            )}
          </Pressable>
        )}
      </View>

      {events.length === 0 ? (
        <View style={styles.emptyAlerts}>
          <Text style={styles.emptyText}>All clear — no open alerts.</Text>
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

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0b1220' },
  scroll: { padding: 16, paddingBottom: 60 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0b1220' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  h1: { color: '#f8fafc', fontSize: 22, fontWeight: '700' },
  sectionTitle: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dim: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  error: {
    color: '#ef4444',
    backgroundColor: '#7f1d1d20',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
  iconBtn: { padding: 6, marginLeft: 12 },
  icon: { color: '#cbd5e1', fontSize: 22 },
  quickJump: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  jumpBtn: {
    flex: 1,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    padding: 12,
    borderRadius: 10,
  },
  jumpTitle: { color: '#f8fafc', fontSize: 13, fontWeight: '600' },
  jumpSub: { color: '#94a3b8', fontSize: 11, marginTop: 4, lineHeight: 14 },
  alertsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 6,
  },
  ackAllBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#334155',
    marginTop: 18,
  },
  ackAllText: { color: '#cbd5e1', fontSize: 12, fontWeight: '600' },
  emptyAlerts: {
    backgroundColor: '#1e293b',
    padding: 14,
    borderRadius: 10,
    marginBottom: 8,
  },
  emptyText: { color: '#34d399', fontSize: 14, fontWeight: '600' },
  emptySubText: { color: '#94a3b8', fontSize: 12, marginTop: 6, lineHeight: 16 },
});
