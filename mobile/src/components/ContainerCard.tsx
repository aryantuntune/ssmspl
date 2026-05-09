import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  restartContainer,
  type ContainerInspect,
  type ContainerStats,
  getContainerStats,
} from '../api/systemActions';
import { colors, radii, spacing, text as t } from '../theme';

type Props = {
  inspect: ContainerInspect;
  onTailLogs: (name: string) => void;
  onAfterAction?: () => void;
};

export function ContainerCard({ inspect, onTailLogs, onAfterAction }: Props) {
  const [busy, setBusy] = useState(false);
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [statsBusy, setStatsBusy] = useState(false);

  // Single source of truth for "is this container in a bad state?".
  // Drives the left rail color and the dot.
  const railColor = (() => {
    if (inspect.error) return colors.crit;
    if (inspect.health === 'unhealthy') return colors.crit;
    if (inspect.health === 'starting') return colors.warn;
    if (inspect.status === 'running') return colors.ok;
    return colors.textDim;
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
    <View style={[styles.card, { borderLeftColor: railColor }]}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.dot, { backgroundColor: railColor }]} />
          <Text style={styles.name} numberOfLines={1}>
            {inspect.name}
          </Text>
        </View>
        <Text style={styles.status} numberOfLines={1}>
          {inspect.error ?? `${inspect.status}${inspect.health ? ' · ' + inspect.health : ''}`}
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
          style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.btnPressed]}
          onPress={() => onTailLogs(inspect.name)}
        >
          <Text style={styles.btnGhostText}>Logs</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnGhost, pressed && styles.btnPressed]}
          onPress={fetchStatsOnce}
          disabled={statsBusy}
        >
          {statsBusy ? (
            <ActivityIndicator color={colors.action.ghostText} size="small" />
          ) : (
            <Text style={styles.btnGhostText}>Stats</Text>
          )}
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.btn, styles.btnDanger, pressed && styles.btnPressed]}
          onPress={restart}
          disabled={busy || !!inspect.error}
        >
          {busy ? (
            <ActivityIndicator color={colors.action.dangerText} size="small" />
          ) : (
            <Text style={styles.btnDangerText}>Restart</Text>
          )}
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
    backgroundColor: colors.bgElev,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  name: { ...t.h2, fontSize: 14, flexShrink: 1 },
  status: { color: colors.textMuted, fontSize: 12, maxWidth: 180, textAlign: 'right' },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 6 },
  meta: { color: colors.textDim, fontSize: 11 },
  metaStrong: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  statsRow: {
    flexDirection: 'row',
    gap: 14,
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
  btn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  btnPressed: { opacity: 0.7 },
  btnGhost: { backgroundColor: colors.action.ghost, borderColor: colors.action.ghostBorder },
  btnGhostText: { color: colors.action.ghostText, fontSize: 12, fontWeight: '600' },
  btnDanger: { backgroundColor: colors.action.danger, borderColor: colors.action.dangerBorder },
  btnDangerText: { color: colors.action.dangerText, fontSize: 12, fontWeight: '700' },
});
