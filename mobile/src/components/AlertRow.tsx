import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type { HealthEvent } from '../api/systemHealth';
import { ackEvent } from '../api/systemActions';
import { StatusBadge } from './StatusBadge';

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
    <View style={[styles.row, acked && styles.rowAcked]}>
      <View style={styles.left}>
        <StatusBadge severity={event.severity} />
        <Text style={styles.when}>{formatWhen(event.created_at)}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.check}>{event.check_name}</Text>
        <Text style={styles.message} numberOfLines={4}>
          {event.message}
        </Text>
        <View style={styles.footer}>
          <Text style={styles.server}>{event.server_name}</Text>
          {!acked && (
            <Pressable onPress={onAck} disabled={busy} style={styles.ackBtn}>
              {busy ? (
                <ActivityIndicator size="small" color="#cbd5e1" />
              ) : (
                <Text style={styles.ackText}>Ack</Text>
              )}
            </Pressable>
          )}
          {acked && <Text style={styles.ackedLabel}>✓ acked</Text>}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 10,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  rowAcked: { opacity: 0.55 },
  left: {
    width: 84,
    alignItems: 'flex-start',
  },
  when: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 4,
  },
  body: {
    flex: 1,
    marginLeft: 8,
  },
  check: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 2,
  },
  message: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  server: {
    color: '#64748b',
    fontSize: 11,
  },
  ackBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#0f172a',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  ackText: { color: '#cbd5e1', fontSize: 11, fontWeight: '600' },
  ackedLabel: { color: '#34d399', fontSize: 11, fontWeight: '500' },
});
