import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { login, getMe } from '../api/auth';
import { DEFAULT_SERVERS, getActiveServerUrl, setActiveServerUrl } from '../lib/config';
import { registerForPushNotifications } from '../lib/notifications';
import { clearClientCache } from '../api/client';
import { colors, radii, spacing, text as t } from '../theme';

export default function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [serverUrl, setServerUrl] = useState<string>('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getActiveServerUrl().then(setServerUrl);
  }, []);

  const submit = async () => {
    if (!username || !password) {
      setError('Username and password required');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await setActiveServerUrl(serverUrl.trim().replace(/\/$/, ''));
      clearClientCache();
      await login(username.trim(), password);
      const me = await getMe();
      if (!['SUPER_ADMIN', 'ADMIN'].includes(me.role)) {
        setError(`Role ${me.role} can't use this app — System Administrator only`);
        setBusy(false);
        return;
      }
      registerForPushNotifications(`${me.username} (mobile)`).catch(() => {});
      onLoggedIn();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Login failed';
      setError(typeof detail === 'string' ? detail : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  // Friendly inferred host suffix for the chip subtitle (saves the user
  // from squinting at the URL)
  const hostFor = (u: string) => u.replace(/^https?:\/\//, '').replace(/\/$/, '');

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {/* Brand block — uses a small monogram tile so the screen feels
            considered, not a stock form */}
        <View style={styles.brandRow}>
          <View style={styles.monogram}>
            <Text style={styles.monogramText}>S</Text>
          </View>
          <View>
            <Text style={styles.brand}>SSMSPL</Text>
            <Text style={styles.subtitle}>Admin Console</Text>
          </View>
        </View>

        <Text style={styles.tagline}>System health & ops for both servers, in your pocket.</Text>

        <Text style={styles.label}>Choose a server</Text>
        <View style={styles.serverGrid}>
          {DEFAULT_SERVERS.map((s) => {
            const active = serverUrl === s.url;
            const isProd = /carferry\.online$/.test(hostFor(s.url));
            const tint = isProd ? colors.serverProd : colors.serverAdmin;
            return (
              <Pressable
                key={s.url}
                onPress={() => setServerUrl(s.url)}
                style={({ pressed }) => [
                  styles.serverCard,
                  active && { borderColor: tint, backgroundColor: colors.bgElev2 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={[styles.serverDot, { backgroundColor: tint }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.serverName, active && { color: colors.text }]}>{s.name}</Text>
                  <Text style={styles.serverHost}>{hostFor(s.url)}</Text>
                </View>
                {active && <Text style={[styles.checkMark, { color: tint }]}>●</Text>}
              </Pressable>
            );
          })}
        </View>

        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://admin.carferry.online"
          placeholderTextColor={colors.textFaint}
        />

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="superadmin"
          placeholderTextColor={colors.textFaint}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={colors.textFaint}
        />

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorIcon}>!</Text>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Pressable
          style={({ pressed }) => [styles.button, (busy || pressed) && { opacity: 0.7 }]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? <ActivityIndicator color={colors.action.primaryText} /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>

        <Text style={styles.footer}>System Administrator access only</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  container: {
    paddingHorizontal: spacing.xl,
    paddingTop: 56,
    paddingBottom: spacing.xxl,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  monogram: {
    width: 48,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.action.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: { color: colors.action.primaryText, fontSize: 22, fontWeight: '800' },
  brand: { ...t.h1, fontSize: 22, letterSpacing: 0.4 },
  subtitle: { color: colors.textMuted, fontSize: 13, marginTop: 2, fontWeight: '500' },
  tagline: { color: colors.textDim, fontSize: 13, marginBottom: spacing.xxl, lineHeight: 18 },

  label: {
    ...t.section,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  serverGrid: { gap: spacing.sm, marginBottom: spacing.sm },
  serverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.bgElev,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  serverDot: { width: 10, height: 10, borderRadius: 5 },
  serverName: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  serverHost: { color: colors.textDim, fontSize: 11, marginTop: 2, fontFamily: 'monospace' },
  checkMark: { fontSize: 12, fontWeight: '900' },

  input: {
    backgroundColor: colors.bgElev,
    color: colors.text,
    borderRadius: radii.md,
    padding: 14,
    fontSize: 15,
    borderWidth: 1,
    borderColor: colors.border,
    marginTop: spacing.xs,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.md,
    backgroundColor: colors.critBg,
    borderLeftWidth: 3,
    borderLeftColor: colors.crit,
    padding: spacing.md,
    borderRadius: radii.sm,
  },
  errorIcon: {
    color: colors.crit,
    fontWeight: '900',
    fontSize: 14,
    width: 14,
    textAlign: 'center',
  },
  errorText: { color: colors.critText, fontSize: 13, flex: 1, lineHeight: 18 },

  button: {
    marginTop: spacing.xl,
    backgroundColor: colors.action.primary,
    paddingVertical: 14,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.action.primaryBorder,
  },
  buttonText: { color: colors.action.primaryText, fontSize: 15, fontWeight: '700', letterSpacing: 0.3 },
  footer: {
    color: colors.textFaint,
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.lg,
    letterSpacing: 0.5,
  },
});
