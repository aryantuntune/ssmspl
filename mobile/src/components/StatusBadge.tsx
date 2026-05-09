import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Severity } from '../api/systemHealth';
import { radii, severityPalette } from '../theme';

const ICON: Record<Severity, string> = {
  OK: '✓',
  INFO: 'i',
  WARN: '!',
  CRIT: '!!',
};

export function StatusBadge({ severity, large = false }: { severity: Severity; large?: boolean }) {
  const p = severityPalette(severity);
  return (
    <View
      style={[
        styles.box,
        large && styles.boxLarge,
        { backgroundColor: p.bg, borderColor: p.accent },
      ]}
    >
      <Text style={[styles.icon, large && styles.iconLarge, { color: p.fg }]}>{ICON[severity]}</Text>
      <Text style={[styles.text, large && styles.textLarge, { color: p.fg }]}>{severity}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
    gap: 4,
  },
  boxLarge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  icon: {
    fontSize: 10,
    fontWeight: '900',
    width: 10,
    textAlign: 'center',
  },
  iconLarge: { fontSize: 12, width: 12 },
  text: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  textLarge: { fontSize: 12 },
});
