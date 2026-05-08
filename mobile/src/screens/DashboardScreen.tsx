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
  fetchEvents,
  fetchStatus,
  type HealthEvent,
  type StatusSnapshot,
} from '../api/systemHealth';
import { AlertRow } from '../components/AlertRow';
import { HealthTile } from '../components/HealthTile';
import { StatusBadge } from '../components/StatusBadge';

const REFRESH_MS = 30_000;

export default function DashboardScreen({
  onSettings,
}: {
  onSettings: () => void;
}) {
  const [snapshot, setSnapshot] = useState<StatusSnapshot | null>(null);
  const [events, setEvents] = useState<HealthEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, e] = await Promise.all([fetchStatus(), fetchEvents({ limit: 25 })]);
      setSnapshot(s);
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
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

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
        <View>
          <Text style={styles.h1}>System Health</Text>
          <Text style={styles.dim}>{snapshot?.server ?? 'unknown'}</Text>
        </View>
        <View style={styles.headerRight}>
          {snapshot && <StatusBadge severity={snapshot.overall_severity} />}
          <Pressable onPress={onSettings} style={styles.gearBtn}>
            <Text style={styles.gear}>⚙</Text>
          </Pressable>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {snapshot && (
        <>
          <HealthTile
            title="Disk"
            severity={snapshot.disk.severity}
            rows={[
              { label: 'Used', value: `${snapshot.disk.pct_used}%` },
              { label: 'Free', value: `${snapshot.disk.free_gb} GB` },
              { label: 'Total', value: `${snapshot.disk.total_gb} GB` },
            ]}
          />
          <HealthTile
            title="Memory"
            severity={snapshot.memory.severity}
            rows={[
              { label: 'Used', value: `${snapshot.memory.pct_used}%` },
              { label: 'Available', value: `${snapshot.memory.available_mb} MB` },
              { label: 'Total', value: `${snapshot.memory.total_mb} MB` },
            ]}
          />
          <HealthTile
            title="Database"
            severity={snapshot.db.severity}
            rows={
              snapshot.db.error
                ? [{ label: 'Error', value: snapshot.db.error.slice(0, 60) }]
                : [
                    { label: 'Connections', value: `${snapshot.db.connections}/${snapshot.db.max_connections}` },
                    { label: 'Saturation', value: `${snapshot.db.pct_used ?? '?'}%` },
                  ]
            }
          />
          <HealthTile
            title="Backup"
            severity={snapshot.backup.severity}
            rows={
              snapshot.backup.present
                ? snapshot.backup.latest_file
                  ? [
                      { label: 'Latest', value: `${snapshot.backup.age_hours}h ago` },
                      { label: 'Size', value: `${snapshot.backup.latest_size_mb} MB` },
                      { label: 'Total dumps', value: `${snapshot.backup.count}` },
                    ]
                  : [{ label: 'Status', value: snapshot.backup.message ?? 'no dumps' }]
                : [{ label: 'Status', value: snapshot.backup.message ?? 'not mounted' }]
            }
          />
          <HealthTile
            title="Ticketing"
            severity={snapshot.ticketing.severity}
            rows={[
              {
                label: 'Last ticket',
                value: `${snapshot.ticketing.minutes_since_last_ticket} min ago`,
              },
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
                  value: s.alive ? `alive (${s.lag_s}s lag)` : 'DEAD',
                })) ?? [{ label: 'Status', value: 'no subscriptions' }]
              }
            />
          )}
        </>
      )}

      <Text style={[styles.h2, { marginTop: 8 }]}>Recent alerts</Text>
      {events.length === 0 ? (
        <Text style={styles.dim}>No events yet. The host-side health-check will populate this once it fires.</Text>
      ) : (
        events.map((e) => <AlertRow key={e.id} event={e} />)
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
  h2: { color: '#cbd5e1', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  dim: { color: '#94a3b8', fontSize: 12, marginTop: 4 },
  error: {
    color: '#ef4444',
    backgroundColor: '#7f1d1d20',
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
    fontSize: 13,
  },
  gearBtn: { padding: 6, marginLeft: 12 },
  gear: { color: '#cbd5e1', fontSize: 22 },
});
