import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';

type Props = {
  label: string;
  value: number;
  badge?: string;
  loading?: boolean;
};

export default function StatCard({ label, value, badge, loading }: Props) {
  const pulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!loading) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [loading, pulse]);

  return (
    <View style={styles.card} accessibilityRole="summary" accessibilityLabel={`${label}: ${value}`}>
      <View>
        <Text style={styles.label}>{label}</Text>
        {loading ? (
          <Animated.View style={[styles.skeleton, { opacity: pulse }]} />
        ) : (
          <Text style={styles.value}>{value}</Text>
        )}
      </View>
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  label: { ...typography.bodySmall, color: colors.textSecondary },
  value: { ...typography.h1, color: colors.text, marginTop: 4 },
  skeleton: {
    width: 48,
    height: 32,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.border,
    marginTop: 4,
  },
  badge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  badgeText: { ...typography.caption, color: colors.success, fontWeight: '600' },
});
