import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { HealthEvent } from '../api/systemHealth';
import { ackEvent } from '../api/systemActions';
import { colors, radii, spacing, severityPalette } from '../theme';

function formatWhen(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffS = Math.floor((now - d.getTime()) / 1000);
  if (diffS < 60) return `${diffS}s ago`;
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ago`;
  if (diffS < 86400) return `${Math.floor(diffS / 3600)}h ago`;
  return d.toLocaleString();
}

export function AlertRow({ event, onAcked }: { event: HealthEvent; onAcked?: (id: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [acked, setAcked] = useState(false);
  const p = severityPalette(event.severity);

  const onAck = async () => {
    setBusy(true);
    try {
      await ackEvent(event.id);
      setAcked(true);
      onAcked?.(event.id);
    } catch {
      // swallow — UI remains in non-acked state, user can retry
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.row, { borderLeftColor: p.accent }, acked && styles.rowAcked]}>
      <View style={styles.topRow}>
        <View style={[styles.sevPill, { backgroundColor: p.bg }]}>
          <Text style={[styles.sevText, { color: p.fg }]}>{event.severity}</Text>
        </View>
        <Text style={styles.check} numberOfLines={1}>
          {event.check_name}
        </Text>
        <Text style={styles.when}>{formatWhen(event.created_at)}</Text>
      </View>
      <Text style={styles.message} numberOfLines={4}>
        {event.message}
      </Text>
      <View style={styles.footer}>
        <Text style={styles.server}>{event.server_name}</Text>
        {!acked && (
          <Pressable onPress={onAck} disabled={busy} style={styles.ackBtn}>
            {busy ? (
              <ActivityIndicator size="small" color={colors.action.ghostText} />
            ) : (
              <Text style={styles.ackText}>Acknowledge</Text>
            )}
          </Pressable>
        )}
        {acked && <Text style={styles.ackedLabel}>✓ acked</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.bgElev,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
    borderLeftWidth: 3,
  },
  rowAcked: { opacity: 0.55 },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 6,
  },
  sevPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  sevText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  check: { color: colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
  when: { color: colors.textDim, fontSize: 11 },
  message: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  server: { color: colors.textDim, fontSize: 11 },
  ackBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    backgroundColor: colors.action.ghost,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.action.ghostBorder,
  },
  ackText: { color: colors.action.ghostText, fontSize: 11, fontWeight: '700' },
  ackedLabel: { color: colors.ok, fontSize: 11, fontWeight: '600' },
});
