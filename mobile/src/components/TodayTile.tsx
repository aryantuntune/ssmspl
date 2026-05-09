import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { TodayActivity } from '../api/systemHealth';
import { colors, radii, spacing, text as t, severityPalette } from '../theme';
import { StatusBadge } from './StatusBadge';

export function TodayTile({ today }: { today: TodayActivity }) {
  const p = severityPalette(today.severity);

  if (today.error) {
    return (
      <View style={[styles.tile, { borderLeftColor: p.accent }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Today</Text>
          <StatusBadge severity={today.severity} />
        </View>
        <Text style={styles.errorText}>{today.error}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.tile, { borderLeftColor: p.accent }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Today</Text>
        <StatusBadge severity={today.severity} />
      </View>

      {/* Hero: revenue is the number cashier-managers care about most */}
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>REVENUE</Text>
        <Text style={styles.heroValue}>{fmtRupees(today.revenue_today ?? 0)}</Text>
      </View>

      <View style={styles.metricsRow}>
        <Metric label="Tickets" value={`${today.tickets_today ?? 0}`} />
        <Metric label="Last hour" value={`${today.tickets_last_hour ?? 0}`} />
        <Metric label="Active sessions" value={`${today.active_sessions ?? 0}`} />
      </View>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricLabel}>{label}</Text>
    </View>
  );
}

function fmtRupees(n: number): string {
  if (n >= 1_00_000) return `₹${(n / 1_00_000).toFixed(2)} L`;
  if (n >= 1000) return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
  return `₹${n.toFixed(0)}`;
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
  hero: {
    backgroundColor: colors.bgElev2,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  heroLabel: { color: colors.textDim, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  heroValue: { color: colors.text, fontSize: 26, fontWeight: '700', marginTop: 2 },
  metricsRow: {
    flexDirection: 'row',
    backgroundColor: colors.bgElev2,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
  },
  metric: { flex: 1, alignItems: 'center' },
  metricValue: { color: colors.text, fontSize: 16, fontWeight: '700' },
  metricLabel: { color: colors.textDim, fontSize: 10, marginTop: 2 },
  errorText: { color: colors.critText, fontSize: 12 },
});
