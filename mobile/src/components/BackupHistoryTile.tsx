import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { BackupHistoryEntry } from '../api/systemHealth';

export function BackupHistoryTile({ entries }: { entries: BackupHistoryEntry[] }) {
  return (
    <View style={styles.tile}>
      <View style={styles.header}>
        <Text style={styles.title}>Recent backups</Text>
        <Text style={styles.dim}>{entries.length} dump{entries.length === 1 ? '' : 's'}</Text>
      </View>
      {entries.length === 0 ? (
        <Text style={styles.empty}>No backups yet — trigger one from the actions below.</Text>
      ) : (
        entries.map((b) => (
          <View key={b.name} style={styles.row}>
            <View style={styles.rowLeft}>
              <Text style={styles.fileName} numberOfLines={1}>
                {b.name}
              </Text>
              <Text style={styles.meta}>{fmtAge(b.age_hours)}</Text>
            </View>
            <Text style={styles.size}>{b.size_mb.toFixed(1)} MB</Text>
          </View>
        ))
      )}
    </View>
  );
}

function fmtAge(hours: number): string {
  if (hours < 1) return `${Math.round(hours * 60)} min ago`;
  if (hours < 24) return `${hours.toFixed(1)} h ago`;
  return `${Math.round(hours / 24)} d ago`;
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
  dim: { color: '#94a3b8', fontSize: 12 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#0f172a',
  },
  rowLeft: { flex: 1, paddingRight: 8 },
  fileName: { color: '#e2e8f0', fontSize: 12, fontFamily: 'monospace' },
  meta: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  size: { color: '#cbd5e1', fontSize: 12, fontWeight: '500' },
  empty: { color: '#64748b', fontSize: 12, fontStyle: 'italic' },
});
