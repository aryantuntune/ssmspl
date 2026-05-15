import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, text as t } from '../theme';

/**
 * "Locked — try again" screen.
 *
 * Shown when biometric authentication is cancelled or fails on cold launch
 * but the user still has saved tokens.  Three failed attempts in a row force
 * a full re-login (handled by the parent).
 */
export default function LockedScreen({
  attempt,
  busy,
  onRetry,
  onForceLogin,
}: {
  attempt: number;
  busy: boolean;
  onRetry: () => void;
  onForceLogin: () => void;
}) {
  return (
    <View style={styles.flex}>
      <View style={styles.card}>
        <Text style={styles.glyph}>🔒</Text>
        <Text style={styles.title}>Locked</Text>
        <Text style={styles.sub}>
          {attempt >= 3
            ? 'Too many failed attempts. Sign in again.'
            : 'Authenticate to continue.'}
        </Text>
        {attempt < 3 ? (
          <Pressable
            onPress={onRetry}
            disabled={busy}
            style={({ pressed }) => [styles.button, (busy || pressed) && { opacity: 0.7 }]}
          >
            {busy ? (
              <ActivityIndicator color={colors.action.primaryText} />
            ) : (
              <Text style={styles.buttonText}>Retry</Text>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={onForceLogin}
            style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
          >
            <Text style={styles.buttonText}>Sign in</Text>
          </Pressable>
        )}
        <Text style={styles.attempts}>
          Attempt {Math.min(attempt, 3)} of 3
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: 'center',
  },
  glyph: { fontSize: 48, marginBottom: spacing.md },
  title: { ...t.h1, fontSize: 22 },
  sub: { ...t.bodyMuted, marginTop: spacing.sm, textAlign: 'center', lineHeight: 18 },
  button: {
    marginTop: spacing.xl,
    width: '100%',
    backgroundColor: colors.action.primary,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.action.primaryBorder,
  },
  buttonText: { color: colors.action.primaryText, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  attempts: { ...t.meta, marginTop: spacing.md },
});
