import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { TodayActivity } from '../api/systemHealth';
import { StatusBadge } from './StatusBadge';

export function TodayTile({ today }: { today: TodayActivity }) {
  if (today.error) {
    return (
      <View style={styles.tile}>
        <View style={styles.header}>
          <Text style={styles.title}>Today</Text>
          <StatusBadge severity={today.severity} />
        </View>
        <Text style={styles.errorText}>{today.error}</Text>
      </View>
    );
  }

  return (
    <View style={styles.tile}>
      <View style={styles.header}>
        <Text style={styles.title}>Today</Text>
        <StatusBadge severity={today.severity} />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Tickets sold</Text>
        <Text style={styles.value}>{today.tickets_today ?? 0}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Revenue</Text>
        <Text style={styles.value}>{fmtRupees(today.revenue_today ?? 0)}</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Last hour</Text>
        <Text style={styles.value}>{today.tickets_last_hour ?? 0} tickets</Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Active sessions</Text>
        <Text style={styles.value}>{today.active_sessions ?? 0}</Text>
      </View>
    </View>
  );
}

function fmtRupees(n: number): string {
  if (n >= 1_00_000) return `₹ ${(n / 1_00_000).toFixed(2)} L`;
  if (n >= 1000) return `₹ ${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  return `₹ ${n.toFixed(0)}`;
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
  errorText: { color: '#f87171', fontSize: 12 },
});
