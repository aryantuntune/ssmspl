import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { SystemInfo } from '../api/systemHealth';
import { StatusBadge } from './StatusBadge';

export function SystemInfoTile({ system }: { system: SystemInfo }) {
  if (system.error) {
    return (
      <View style={styles.tile}>
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
    <View style={styles.tile}>
      <View style={styles.header}>
        <Text style={styles.title}>System</Text>
        <StatusBadge severity={system.severity} />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Uptime</Text>
        <Text style={styles.value}>{system.uptime_str}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>CPU usage</Text>
        <Text style={styles.value}>
          {system.cpu_pct}% across {system.cpu_count} core{system.cpu_count === 1 ? '' : 's'}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Load average</Text>
        <Text style={styles.value}>
          {system.load_avg_1} · {system.load_avg_5} · {system.load_avg_15}
          <Text style={styles.dim}> {loadHint}</Text>
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Network now</Text>
        <Text style={styles.value}>
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
    backgroundColor: '#1e293b',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  title: { color: '#f8fafc', fontSize: 15, fontWeight: '600' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  label: { color: '#94a3b8', fontSize: 13 },
  value: { color: '#e2e8f0', fontSize: 13, fontWeight: '500' },
  dim: { color: '#64748b', fontWeight: '400' },
  errorText: { color: '#f87171', fontSize: 12 },
});
