import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { colors, spacing, typography } from '../../theme';

export default function NetworkBanner() {
  const isOnline = useSelector((s: RootState) => s.ui.isOnline);

  if (isOnline) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLabel="No internet connection">
      <Text style={styles.text}>No internet connection</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.warning,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  text: {
    ...typography.caption,
    color: '#000',
    fontWeight: '600',
  },
});
