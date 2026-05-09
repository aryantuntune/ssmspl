import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { BackupHistoryEntry } from '../api/systemHealth';
import { colors, radii, spacing, text as t } from '../theme';

export function BackupHistoryTile({ entries }: { entries: BackupHistoryEntry[] }) {
  return (
    <View style={styles.tile}>
      <View style={styles.header}>
        <Text style={styles.title}>Recent backups</Text>
        <Text style={styles.dim}>{entries.length} dump{entries.length === 1 ? '' : 's'}</Text>
      </View>
      {entries.length === 0 ? (
        <Text style={styles.empty}>No backups yet — trigger one from Actions.</Text>
      ) : (
        entries.map((b, i) => (
          <View key={b.name} style={[styles.row, i === 0 && styles.rowFirst]}>
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
    backgroundColor: colors.bgElev,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  title: { ...t.h2, fontSize: 14 },
  dim: { ...t.meta },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  rowFirst: { borderTopWidth: 0 },
  rowLeft: { flex: 1, paddingRight: spacing.sm },
  fileName: { color: colors.text, fontSize: 12, fontFamily: 'monospace' },
  meta: { ...t.meta, marginTop: 2 },
  size: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },
  empty: { color: colors.textDim, fontSize: 12, fontStyle: 'italic' },
});
