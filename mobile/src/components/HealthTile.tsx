import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Severity } from '../api/systemHealth';
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
  return (
    <View style={styles.tile}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <StatusBadge severity={severity} />
      </View>
      {rows.map((r) => (
        <View style={styles.row} key={r.label}>
          <Text style={styles.label}>{r.label}</Text>
          <Text style={styles.value}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
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
  title: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  label: {
    color: '#94a3b8',
    fontSize: 13,
  },
  value: {
    color: '#e2e8f0',
    fontSize: 13,
    fontWeight: '500',
  },
});
