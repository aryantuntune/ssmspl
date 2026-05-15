import React, { useEffect, useMemo, useState } from 'react';
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
import { clearClientCache } from '../api/client';
import { SERVERS, setActiveServer } from '../lib/config';
import { credentials, type ServerId } from '../lib/storage';
import { colors, radii, spacing, text as t } from '../theme';

type FormState = {
  username: string;
  password: string;
};

/**
 * First-launch login flow.
 *
 * The user enters credentials for BOTH servers in one go.  Two tabs at the
 * top switch which form they're filling in; both forms persist locally so
 * tabbing between them never loses input.
 *
 * On "Sign in", we validate that both forms are filled, save BOTH credential
 * sets to SecureStore, then run an actual /superadmin-login against the
 * currently-selected tab's server.  The OTHER server stays "saved but
 * inactive" — the dashboard's server-switcher does the second login lazily
 * when the user taps over.
 *
 * If the user already has credentials saved for a server (e.g. they came
 * back via "Sign out" of the OTHER server), we pre-fill that form.
 */
export default function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [activeTab, setActiveTab] = useState<ServerId>('server2'); // Admin Portal default
  const [forms, setForms] = useState<Record<ServerId, FormState>>({
    server1: { username: '', password: '' },
    server2: { username: '', password: '' },
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);

  // On mount, pre-fill any already-saved credentials so the user doesn't
  // retype the half they already have.  Password gets pre-filled too — same
  // SecureStore threat model as before.
  useEffect(() => {
    (async () => {
      const a = await credentials.get('server1');
      const b = await credentials.get('server2');
      setForms({
        server1: { username: a?.username ?? '', password: a?.password ?? '' },
        server2: { username: b?.username ?? '', password: b?.password ?? '' },
      });
      setHydrating(false);
    })();
  }, []);

  const updateField = (id: ServerId, field: keyof FormState, val: string) => {
    setForms((cur) => ({ ...cur, [id]: { ...cur[id], [field]: val } }));
  };

  const bothFilled = useMemo(() => {
    return (
      forms.server1.username.trim() &&
      forms.server1.password &&
      forms.server2.username.trim() &&
      forms.server2.password
    );
  }, [forms]);

  const submit = async () => {
    if (!bothFilled) {
      setError(
        'Fill in BOTH server forms before signing in. The app saves credentials for both so you can hot-swap from the dashboard.',
      );
      return;
    }
    setError(null);
    setBusy(true);
    try {
      // 1. Save BOTH sets of credentials to SecureStore so server-switching
      //    later doesn't have to ask again.
      await credentials.set('server1', forms.server1.username.trim(), forms.server1.password);
      await credentials.set('server2', forms.server2.username.trim(), forms.server2.password);

      // 2. Set the active server to whichever tab the user was on when they
      //    tapped Sign in.  Then run a real login against that server.
      await setActiveServer(activeTab);
      clearClientCache();

      const f = forms[activeTab];
      await login(f.username.trim(), f.password);

      const me = await getMe();
      if (!['SUPER_ADMIN', 'ADMIN'].includes(me.role)) {
        setError(`Role ${me.role} can't use this app — System Administrator only`);
        setBusy(false);
        return;
      }

      onLoggedIn();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Login failed';
      setError(typeof detail === 'string' ? detail : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const tabHost = (id: ServerId) => SERVERS.find((s) => s.id === id)?.url ?? '';

  const currentForm = forms[activeTab];

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Brand block — shield monogram echoes the new app icon. */}
        <View style={styles.brandRow}>
          <View style={styles.monogram}>
            <Text style={styles.monogramText}>A</Text>
          </View>
          <View>
            <Text style={styles.brand}>SSMSPL</Text>
            <Text style={styles.subtitle}>Admin Console</Text>
          </View>
        </View>

        <Text style={styles.tagline}>
          Enter sign-in credentials for both servers. After this one-time setup,
          tap the dashboard server switcher to hot-swap between them.
        </Text>

        {/* Server tabs (mirrors the dashboard's identity-strip visuals) */}
        <View style={styles.tabRow}>
          {SERVERS.map((s) => {
            const active = activeTab === s.id;
            const tint =
              s.id === 'server2' ? colors.serverAdmin : colors.serverProd;
            const filled =
              forms[s.id].username.trim() && forms[s.id].password;
            return (
              <Pressable
                key={s.id}
                onPress={() => setActiveTab(s.id)}
                style={({ pressed }) => [
                  styles.tab,
                  active && { borderColor: tint, backgroundColor: colors.bgElev2 },
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={[styles.tabDot, { backgroundColor: tint }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tabName, active && { color: colors.text }]}>
                    {s.name}
                  </Text>
                  <Text style={styles.tabHost} numberOfLines={1}>
                    {tabHost(s.id).replace(/^https?:\/\//, '')}
                  </Text>
                </View>
                <Text style={[styles.tabCheck, filled ? { color: colors.ok } : { color: colors.textFaint }]}>
                  {filled ? '✓' : '○'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={currentForm.username}
          onChangeText={(v) => updateField(activeTab, 'username', v)}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={activeTab === 'server2' ? 'admin' : 'superadmin'}
          placeholderTextColor={colors.textFaint}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          style={styles.input}
          value={currentForm.password}
          onChangeText={(v) => updateField(activeTab, 'password', v)}
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
          style={({ pressed }) => [
            styles.button,
            (busy || hydrating || !bothFilled || pressed) && { opacity: 0.7 },
          ]}
          onPress={submit}
          disabled={busy || hydrating}
        >
          {busy ? (
            <ActivityIndicator color={colors.action.primaryText} />
          ) : (
            <Text style={styles.buttonText}>
              {bothFilled ? `Sign in to ${activeTab === 'server2' ? 'Admin Portal' : 'Production'}` : 'Fill both forms to continue'}
            </Text>
          )}
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
  tagline: { color: colors.textDim, fontSize: 13, marginBottom: spacing.xl, lineHeight: 18 },

  label: {
    ...t.section,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },

  tabRow: { gap: spacing.sm, marginBottom: spacing.sm },
  tab: {
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
  tabDot: { width: 10, height: 10, borderRadius: 5 },
  tabName: { color: colors.textMuted, fontSize: 14, fontWeight: '600' },
  tabHost: { color: colors.textDim, fontSize: 11, marginTop: 2, fontFamily: 'monospace' },
  tabCheck: { fontSize: 14, fontWeight: '900' },

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
