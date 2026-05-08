import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  restartContainer,
  type ContainerInspect,
  type ContainerStats,
  getContainerStats,
} from '../api/systemActions';

type Props = {
  inspect: ContainerInspect;
  onTailLogs: (name: string) => void;
  onAfterAction?: () => void;
};

export function ContainerCard({ inspect, onTailLogs, onAfterAction }: Props) {
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [statsBusy, setStatsBusy] = useState(false);

  const dotColor = (() => {
    if (inspect.error) return '#f87171';
    if (inspect.health === 'unhealthy') return '#f87171';
    if (inspect.health === 'starting') return '#fbbf24';
    if (inspect.status === 'running') return '#34d399';
    return '#94a3b8';
  })();

  const restart = () => {
    Alert.alert(
      `Restart ${inspect.name}?`,
      'Brief downtime — service will be unavailable for ~10 s.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restart',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              const r = await restartContainer(inspect.name);
              if (!r.ok) {
                Alert.alert('Restart failed', r.error ?? 'unknown');
              }
              onAfterAction?.();
            } catch (e: any) {
              Alert.alert('Restart failed', e?.response?.data?.detail || e?.message || 'unknown');
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const fetchStatsOnce = async () => {
    setStatsBusy(true);
    try {
      const s = await getContainerStats(inspect.name);
      setStats(s);
    } catch (e: any) {
      Alert.alert('Stats failed', e?.response?.data?.detail || e?.message || 'unknown');
    } finally {
      setStatsBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.dot, { backgroundColor: dotColor }]} />
          <Text style={styles.name}>{inspect.name}</Text>
        </View>
        <Text style={styles.status}>
          {inspect.error ?? `${inspect.status}${inspect.health ? ` · ${inspect.health}` : ''}`}
        </Text>
      </View>

      {!inspect.error && (
        <View style={styles.metaRow}>
          <Text style={styles.meta}>id {inspect.id ?? '?'}</Text>
          <Text style={styles.meta}>restarts {inspect.restart_count ?? 0}</Text>
          {inspect.started_at && (
            <Text style={styles.meta} numberOfLines={1}>
              up {ago(inspect.started_at)}
            </Text>
          )}
        </View>
      )}

      {stats && (
        <View style={styles.statsRow}>
          <Text style={styles.metaStrong}>CPU {stats.cpu_pct}%</Text>
          <Text style={styles.metaStrong}>
            mem {stats.mem_used_mb}/{stats.mem_limit_mb} MB
          </Text>
        </View>
      )}

      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, styles.btnGhost]}
          onPress={() => onTailLogs(inspect.name)}
        >
          <Text style={styles.btnGhostText}>Logs</Text>
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnGhost]}
          onPress={fetchStatsOnce}
          disabled={statsBusy}
        >
          {statsBusy ? <ActivityIndicator color="#cbd5e1" size="small" /> : <Text style={styles.btnGhostText}>Stats</Text>}
        </Pressable>
        <Pressable
          style={[styles.btn, styles.btnDanger]}
          onPress={restart}
          disabled={busy || !!inspect.error}
        >
          {busy ? <ActivityIndicator color="#fecaca" size="small" /> : <Text style={styles.btnDangerText}>Restart</Text>}
        </Pressable>
      </View>
    </View>
  );
}

function ago(iso: string): string {
  try {
    const dt = new Date(iso).getTime();
    const sec = Math.max(0, Math.floor((Date.now() - dt) / 1000));
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.floor(sec / 60)}m`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
    return `${Math.floor(sec / 86400)}d`;
  } catch {
    return '?';
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 10,
    marginBottom: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { color: '#f8fafc', fontSize: 14, fontWeight: '600' },
  status: { color: '#94a3b8', fontSize: 12, maxWidth: 180, textAlign: 'right' },
  metaRow: { flexDirection: 'row', gap: 12, marginTop: 6 },
  meta: { color: '#64748b', fontSize: 11 },
  metaStrong: { color: '#cbd5e1', fontSize: 12, fontWeight: '500' },
  statsRow: { flexDirection: 'row', gap: 14, marginTop: 6 },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhost: { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#334155' },
  btnGhostText: { color: '#cbd5e1', fontSize: 12, fontWeight: '600' },
  btnDanger: { backgroundColor: '#3f1d1d', borderWidth: 1, borderColor: '#7f1d1d' },
  btnDangerText: { color: '#fecaca', fontSize: 12, fontWeight: '600' },
});
