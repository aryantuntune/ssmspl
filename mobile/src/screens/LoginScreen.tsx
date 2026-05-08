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
        setError(`Role ${me.role} can't use this app — SUPER_ADMIN/ADMIN only`);
        setBusy(false);
        return;
      }
      // Best-effort push registration; failures don't block login. The
      // Settings screen surfaces the precise reason if registration didn't
      // succeed (permission denied, EAS project ID missing, backend error…).
      registerForPushNotifications(`${me.username} (mobile)`).catch(() => {});
      onLoggedIn();
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Login failed';
      setError(typeof detail === 'string' ? detail : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.brand}>SSMSPL</Text>
        <Text style={styles.subtitle}>SuperAdmin · System Health</Text>

        <Text style={styles.label}>Server</Text>
        <View style={styles.serverRow}>
          {DEFAULT_SERVERS.map((s) => (
            <Pressable
              key={s.url}
              onPress={() => setServerUrl(s.url)}
              style={[
                styles.serverChip,
                serverUrl === s.url && styles.serverChipActive,
              ]}
            >
              <Text style={[styles.serverChipText, serverUrl === s.url && styles.serverChipTextActive]}>
                {s.name}
              </Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={serverUrl}
          onChangeText={setServerUrl}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://admin.carferry.online"
          placeholderTextColor="#64748b"
        />

        <Text style={styles.label}>Username</Text>
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="superadmin"
          placeholderTextColor="#64748b"
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
          placeholderTextColor="#64748b"
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable style={[styles.button, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0b1220' },
  container: {
    padding: 24,
    paddingTop: 80,
  },
  brand: {
    color: '#f8fafc',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 1,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 14,
    marginBottom: 32,
  },
  label: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 16,
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  serverRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  serverChip: {
    backgroundColor: '#1e293b',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginRight: 8,
    marginBottom: 8,
  },
  serverChipActive: {
    backgroundColor: '#3b82f6',
  },
  serverChipText: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  serverChipTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#1e293b',
    color: '#f8fafc',
    borderRadius: 8,
    padding: 14,
    fontSize: 15,
  },
  button: {
    marginTop: 32,
    backgroundColor: '#3b82f6',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#ef4444',
    marginTop: 16,
    fontSize: 13,
  },
});
