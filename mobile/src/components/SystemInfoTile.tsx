import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SystemInfo } from '../api/systemHealth';
import { colors, radii, spacing, text as t, severityPalette } from '../theme';
import { StatusBadge } from './StatusBadge';

export function SystemInfoTile({ system }: { system: SystemInfo }) {
  const p = severityPalette(system.severity);

  if (system.error) {
    return (
      <View style={[styles.tile, { borderLeftColor: p.accent }]}>
        <View style={styles.header}>
          <Text style={styles.title}>System</Text>
          <StatusBadge severity={system.severity} />
        </View>
        <Text style={styles.errorText}>{system.error}</Text>
      </View>
    );
  }

  const loadOver = system.cpu_count > 0 ? system.load_avg_1 / system.cpu_count : 0;
  const loadHint =
    loadOver > 2 ? '· overloaded' : loadOver > 1.5 ? '· high' : loadOver > 1 ? '· busy' : '· idle';

  return (
    <View style={[styles.tile, { borderLeftColor: p.accent }]}>
      <View style={styles.header}>
        <Text style={styles.title}>System</Text>
        <StatusBadge severity={system.severity} />
      </View>

      {/* Headline metric block — uptime + cpu in one glance */}
      <View style={styles.statsBlock}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{system.cpu_pct}%</Text>
          <Text style={styles.statLabel}>CPU · {system.cpu_count} core{system.cpu_count === 1 ? '' : 's'}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.stat}>
          <Text style={styles.statValue}>{system.uptime_str}</Text>
          <Text style={styles.statLabel}>uptime</Text>
        </View>
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Load avg</Text>
        <Text style={styles.value} numberOfLines={1}>
          {system.load_avg_1} · {system.load_avg_5} · {system.load_avg_15}
          <Text style={styles.dim}> {loadHint}</Text>
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Network now</Text>
        <Text style={styles.value} numberOfLines={1}>
          ↓ {fmtKbs(system.net_rx_kbs)}  ↑ {fmtKbs(system.net_tx_kbs)}
        </Text>
      </View>
    </View>
  );
}

function fmtKbs(kbs: number): string {
  if (kbs >= 1024) return `${(kbs / 1024).toFixed(1)} MB/s`;
  return `${kbs.toFixed(1)} KB/s`;
}

const styles = StyleSheet.create({
  tile: {
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
    marginBottom: spacing.sm,
  },
  title: { ...t.h2, fontSize: 14 },
  statsBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElev2,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  stat: { flex: 1 },
  divider: { width: 1, alignSelf: 'stretch', backgroundColor: colors.border, marginHorizontal: spacing.md },
  statValue: { color: colors.text, fontSize: 18, fontWeight: '700' },
  statLabel: { ...t.meta, marginTop: 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    gap: spacing.md,
  },
  label: { ...t.label, flexShrink: 0 },
  value: { ...t.value, flexShrink: 1, textAlign: 'right' },
  dim: { color: colors.textDim, fontWeight: '400' },
  errorText: { color: colors.critText, fontSize: 12 },
});
