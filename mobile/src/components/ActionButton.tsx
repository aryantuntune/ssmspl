import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from '../theme';

type Variant = 'primary' | 'warn' | 'danger' | 'ghost';

type Props = {
  label: string;
  onPress: () => Promise<unknown>;
  confirm?: string;
  variant?: Variant;
  icon?: string;
  hint?: string;
  disabled?: boolean;
  resultLabel?: (r: any) => string | null;
};

export function ActionButton({
  label,
  onPress,
  confirm,
  variant = 'primary',
  icon,
  hint,
  disabled,
  resultLabel,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<{ ok: boolean; text: string } | null>(null);

  const run = async () => {
    setBusy(true);
    setLast(null);
    try {
      const r: any = await onPress();
      const ok = r?.ok !== false;
      const text = resultLabel?.(r) ?? (ok ? 'Done' : (r?.error ?? 'Failed'));
      setLast({ ok, text: String(text).slice(0, 80) });
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Failed';
      setLast({ ok: false, text: String(detail).slice(0, 80) });
    } finally {
      setBusy(false);
    }
  };

  const trigger = () => {
    if (busy || disabled) return;
    if (confirm) {
      Alert.alert('Confirm', confirm, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Run', style: 'destructive', onPress: run },
      ]);
    } else {
      run();
    }
  };

  const palette = paletteFor(variant);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={trigger}
        disabled={busy || disabled}
        style={({ pressed }) => [
          styles.btn,
          { backgroundColor: palette.bg, borderColor: palette.border },
          pressed && { opacity: 0.75 },
          disabled && { opacity: 0.4 },
        ]}
      >
        <View style={styles.row}>
          {busy ? (
            <ActivityIndicator color={palette.text} size="small" />
          ) : (
            <Text style={[styles.icon, { color: palette.text }]}>{icon ?? '›'}</Text>
          )}
          <Text style={[styles.label, { color: palette.text }]} numberOfLines={2}>
            {label}
          </Text>
        </View>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </Pressable>
      {last && (
        <Text style={[styles.result, { color: last.ok ? colors.ok : colors.crit }]} numberOfLines={2}>
          {last.ok ? '✓ ' : '✗ '}
          {last.text}
        </Text>
      )}
    </View>
  );
}

function paletteFor(v: Variant) {
  switch (v) {
    case 'danger':
      return {
        bg: colors.action.danger,
        border: colors.action.dangerBorder,
        text: colors.action.dangerText,
      };
    case 'warn':
      return {
        bg: colors.action.warn,
        border: colors.action.warnBorder,
        text: colors.action.warnText,
      };
    case 'ghost':
      return {
        bg: colors.action.ghost,
        border: colors.action.ghostBorder,
        text: colors.action.ghostText,
      };
    case 'primary':
    default:
      return {
        bg: colors.action.primary,
        border: colors.action.primaryBorder,
        text: colors.action.primaryText,
      };
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0 },
  btn: {
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  icon: { fontSize: 16, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700', flexShrink: 1 },
  hint: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
  result: { fontSize: 11, marginTop: 4, paddingHorizontal: 4 },
});
