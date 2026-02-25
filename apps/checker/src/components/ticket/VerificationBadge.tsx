import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface VerificationBadgeProps {
  status: string;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  CONFIRMED: { bg: colors.successLight, text: colors.success, label: 'Ready to Verify', icon: '' },
  VERIFIED: { bg: colors.infoLight, text: colors.info, label: 'Already Verified', icon: '' },
  CANCELLED: { bg: colors.errorLight, text: colors.error, label: 'Cancelled', icon: '' },
  PENDING: { bg: colors.warningLight, text: colors.warning, label: 'Payment Pending', icon: '' },
};

export default function VerificationBadge({ status }: VerificationBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.CONFIRMED;

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={styles.icon}>{config.icon}</Text>
      <Text style={[styles.text, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    gap: spacing.sm,
  },
  icon: { fontSize: 18 },
  text: { ...typography.bodySmall, fontWeight: '700' },
});
