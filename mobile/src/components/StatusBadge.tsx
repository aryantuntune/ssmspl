import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Severity } from '../api/systemHealth';

const COLOR: Record<Severity, { bg: string; fg: string }> = {
  OK: { bg: '#10b981', fg: '#fff' },
  INFO: { bg: '#3b82f6', fg: '#fff' },
  WARN: { bg: '#f59e0b', fg: '#1f2937' },
  CRIT: { bg: '#ef4444', fg: '#fff' },
};

export function StatusBadge({ severity }: { severity: Severity }) {
  const c = COLOR[severity] ?? COLOR.OK;
  return (
    <View style={[styles.box, { backgroundColor: c.bg }]}>
      <Text style={[styles.text, { color: c.fg }]}>{severity}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
