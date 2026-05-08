import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { logout, getMe, type Me } from '../api/auth';
import { listDevices, unregisterDevice, type PushDeviceRead } from '../api/systemHealth';
import { getActiveServerUrl } from '../lib/config';
import { registerForPushNotifications } from '../lib/notifications';

export default function SettingsScreen({
  onBack,
  onLoggedOut,
}: {
  onBack: () => void;
  onLoggedOut: () => void;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [server, setServer] = useState('');
  const [devices, setDevices] = useState<PushDeviceRead[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [m, s, d] = await Promise.all([getMe(), getActiveServerUrl(), listDevices()]);
      setMe(m);
      setServer(s);
      setDevices(d);
    } catch (e) {
      // Ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const reRegisterPush = async () => {
    const r = await registerForPushNotifications(`${me?.username ?? 'mobile'} (re-reg)`);
    if (r.ok && r.token) {
      Alert.alert('Push registered', `Token: ${r.token.slice(0, 30)}…\n\nThis device will now receive CRIT alerts.`);
      load();
    } else {
      Alert.alert(
        'Push registration failed',
        r.reason ?? 'Unknown error. Check device notification settings.',
      );
    }
  };

  const removeDevice = async (id: string) => {
    Alert.alert('Remove device?', 'You will stop receiving push from this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await unregisterDevice(id);
          load();
        },
      },
    ]);
  };

  const doLogout = async () => {
    await logout();
    onLoggedOut();
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#3b82f6" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack}>
          <Text style={styles.backBtn}>‹ Back</Text>
        </Pressable>
        <Text style={styles.h1}>Settings</Text>
        <View style={{ width: 50 }} />
      </View>

      <Text style={styles.label}>Logged in as</Text>
      <View style={styles.box}>
        <Text style={styles.value}>{me?.full_name}</Text>
        <Text style={styles.dim}>
          @{me?.username} · {me?.role}
        </Text>
      </View>

      <Text style={styles.label}>Server</Text>
      <View style={styles.box}>
        <Text style={styles.value}>{server}</Text>
      </View>

      <Text style={styles.label}>Push devices</Text>
      {devices.length === 0 && (
        <View style={styles.box}>
          <Text style={styles.dim}>No registered devices yet</Text>
        </View>
      )}
      {devices.map((d) => (
        <View key={d.id} style={[styles.box, !d.is_active && { opacity: 0.5 }]}>
          <Text style={styles.value}>{d.device_label || 'Unnamed device'}</Text>
          <Text style={styles.dim}>
            {d.platform} · {d.is_active ? 'active' : 'inactive'} · token {d.expo_push_token.slice(0, 28)}…
          </Text>
          <Pressable onPress={() => removeDevice(d.id)} style={styles.miniBtn}>
            <Text style={styles.miniBtnText}>Remove</Text>
          </Pressable>
        </View>
      ))}

      <Pressable style={styles.button} onPress={reRegisterPush}>
        <Text style={styles.buttonText}>Re-register push notifications</Text>
      </Pressable>

      <Pressable style={[styles.button, styles.danger]} onPress={doLogout}>
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#0b1220' },
  scroll: { padding: 16, paddingBottom: 60 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0b1220',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 24,
    marginTop: 12,
  },
  backBtn: { color: '#3b82f6', fontSize: 16 },
  h1: { color: '#f8fafc', fontSize: 18, fontWeight: '700' },
  label: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 6,
    letterSpacing: 0.5,
  },
  box: {
    backgroundColor: '#1e293b',
    padding: 12,
    borderRadius: 8,
    marginBottom: 6,
  },
  value: { color: '#f8fafc', fontSize: 14, fontWeight: '500' },
  dim: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  button: {
    backgroundColor: '#3b82f6',
    padding: 14,
    borderRadius: 8,
    marginTop: 16,
    alignItems: 'center',
  },
  danger: { backgroundColor: '#ef4444', marginTop: 12 },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  miniBtn: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#475569',
    borderRadius: 4,
  },
  miniBtnText: { color: '#fff', fontSize: 11 },
});
