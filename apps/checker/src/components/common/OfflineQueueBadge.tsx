import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { colors, spacing, borderRadius, typography } from '../../theme';

type Props = {
  onRetry: () => void;
};

export default function OfflineQueueBadge({ onRetry }: Props) {
  const { pendingCheckIns, isOnline } = useSelector((s: RootState) => s.ui);

  if (pendingCheckIns === 0) return null;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onRetry}
      disabled={!isOnline}
      accessibilityRole="button"
      accessibilityLabel={`${pendingCheckIns} pending check-ins. Tap to retry.`}
    >
      <View style={styles.badge}>
        <Text style={styles.count}>{pendingCheckIns}</Text>
      </View>
      <Text style={styles.text}>
        pending check-in{pendingCheckIns > 1 ? 's' : ''}
      </Text>
      {isOnline && <Text style={styles.retry}>Tap to retry</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  badge: {
    backgroundColor: colors.warning,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { ...typography.caption, color: '#000', fontWeight: '700' },
  text: { ...typography.bodySmall, color: '#000', flex: 1 },
  retry: { ...typography.caption, color: colors.primary, fontWeight: '600' },
});
