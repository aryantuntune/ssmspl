import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { HealthEvent } from '../api/systemHealth';
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

export function AlertRow({ event }: { event: HealthEvent }) {
  return (
    <View style={styles.row}>
      <View style={styles.left}>
        <StatusBadge severity={event.severity} />
        <Text style={styles.when}>{formatWhen(event.created_at)}</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.check}>{event.check_name}</Text>
        <Text style={styles.message} numberOfLines={3}>
          {event.message}
        </Text>
        <Text style={styles.server}>{event.server_name}</Text>
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
  server: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 4,
  },
});
