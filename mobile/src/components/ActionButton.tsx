import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

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
          pressed && { opacity: 0.7 },
          disabled && { opacity: 0.4 },
        ]}
      >
        <View style={styles.row}>
          {busy ? (
            <ActivityIndicator color={palette.text} size="small" />
          ) : (
            <Text style={[styles.icon, { color: palette.text }]}>{icon ?? '·'}</Text>
          )}
          <Text style={[styles.label, { color: palette.text }]} numberOfLines={1}>
            {label}
          </Text>
        </View>
        {hint && <Text style={styles.hint}>{hint}</Text>}
      </Pressable>
      {last && (
        <Text style={[styles.result, { color: last.ok ? '#34d399' : '#f87171' }]} numberOfLines={2}>
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
      return { bg: '#3f1d1d', border: '#7f1d1d', text: '#fecaca' };
    case 'warn':
      return { bg: '#3f2d0e', border: '#92400e', text: '#fcd34d' };
    case 'ghost':
      return { bg: '#0f172a', border: '#334155', text: '#cbd5e1' };
    case 'primary':
    default:
      return { bg: '#1e3a8a', border: '#1d4ed8', text: '#dbeafe' };
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minWidth: 0 },
  btn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  icon: { fontSize: 16 },
  label: { fontSize: 13, fontWeight: '600', flexShrink: 1 },
  hint: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
  result: { fontSize: 11, marginTop: 4, paddingHorizontal: 4 },
});
