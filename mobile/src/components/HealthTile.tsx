import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Severity } from '../api/systemHealth';
import { colors, radii, spacing, text as t, severityPalette } from '../theme';
import { StatusBadge } from './StatusBadge';

type Row = { label: string; value: string };

export function HealthTile({
  title,
  severity,
  rows,
}: {
  title: string;
  severity: Severity;
  rows: Row[];
}) {
  const p = severityPalette(severity);
  // A 3px left rail in the severity color is the cheapest, loudest
  // status signal that doesn't require touching every cell.
  return (
    <View style={[styles.tile, { borderLeftColor: p.accent }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <StatusBadge severity={severity} />
      </View>
      {rows.map((r) => (
        <View style={styles.row} key={r.label}>
          <Text style={styles.label}>{r.label}</Text>
          <Text style={styles.value} numberOfLines={1}>
            {r.value}
          </Text>
        </View>
      ))}
    </View>
  );
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
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    gap: spacing.md,
  },
  label: { ...t.label, flexShrink: 0 },
  value: { ...t.value, flexShrink: 1, textAlign: 'right' },
});
