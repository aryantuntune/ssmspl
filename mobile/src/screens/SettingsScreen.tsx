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
import { colors, radii, spacing, text as t } from '../theme';

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
    } catch {
      // ignore
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
        <ActivityIndicator color={colors.action.primary} />
      </View>
    );
  }

  // Friendly role label — never expose "Super Admin" wording.
  const roleLabel = (role: string | undefined) => {
    if (!role) return '';
    if (role === 'SUPER_ADMIN') return 'System Administrator';
    if (role === 'ADMIN') return 'Administrator';
    return role;
  };

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll}>
      <View style={styles.headerRow}>
        <Pressable onPress={onBack} hitSlop={10}>
          <Text style={styles.backBtn}>‹ Back</Text>
        </Pressable>
        <Text style={styles.h1}>Settings</Text>
        <View style={{ width: 60 }} />
      </View>

      <Text style={styles.label}>Logged in as</Text>
      <View style={styles.box}>
        <Text style={styles.value}>{me?.full_name}</Text>
        <Text style={styles.dim}>
          @{me?.username} · {roleLabel(me?.role)}
        </Text>
      </View>

      <Text style={styles.label}>Server</Text>
      <View style={styles.box}>
        <Text style={styles.value} numberOfLines={1}>{server}</Text>
      </View>

      <Text style={styles.label}>Push devices</Text>
      {devices.length === 0 && (
        <View style={styles.box}>
          <Text style={styles.dim}>No registered devices yet</Text>
        </View>
      )}
      {devices.map((d) => (
        <View key={d.id} style={[styles.box, !d.is_active && { opacity: 0.5 }]}>
          <View style={styles.deviceTop}>
            <Text style={styles.value} numberOfLines={1}>
              {d.device_label || 'Unnamed device'}
            </Text>
            <View style={[styles.statusPill, d.is_active ? styles.statusActive : styles.statusInactive]}>
              <Text style={[styles.statusText, d.is_active ? { color: colors.okText } : { color: colors.textMuted }]}>
                {d.is_active ? 'ACTIVE' : 'INACTIVE'}
              </Text>
            </View>
          </View>
          <Text style={styles.dim} numberOfLines={1}>
            {d.platform} · token {d.expo_push_token.slice(0, 28)}…
          </Text>
          <Pressable
            onPress={() => removeDevice(d.id)}
            style={({ pressed }) => [styles.miniBtn, pressed && { opacity: 0.6 }]}
          >
            <Text style={styles.miniBtnText}>Remove</Text>
          </Pressable>
        </View>
      ))}

      <Pressable
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.7 }]}
        onPress={reRegisterPush}
      >
        <Text style={styles.buttonText}>Re-register push notifications</Text>
      </Pressable>

      <Pressable
        style={({ pressed }) => [styles.button, styles.danger, pressed && { opacity: 0.7 }]}
        onPress={doLogout}
      >
        <Text style={styles.buttonText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.lg, paddingBottom: 60 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
    marginTop: spacing.md,
  },
  backBtn: { color: colors.action.primary, fontSize: 16, fontWeight: '600' },
  h1: { ...t.h1, fontSize: 18 },
  label: {
    ...t.section,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  box: {
    backgroundColor: colors.bgElev,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  value: { color: colors.text, fontSize: 14, fontWeight: '600' },
  dim: { ...t.meta, marginTop: 2 },
  deviceTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: 2,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  statusActive: { backgroundColor: colors.okBg, borderColor: colors.ok },
  statusInactive: { backgroundColor: colors.bgElev2, borderColor: colors.borderStrong },
  statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  button: {
    backgroundColor: colors.action.primary,
    paddingVertical: 14,
    borderRadius: radii.md,
    marginTop: spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.action.primaryBorder,
  },
  danger: {
    backgroundColor: colors.action.danger,
    borderColor: colors.action.dangerBorder,
    marginTop: spacing.md,
  },
  buttonText: { color: colors.action.primaryText, fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  miniBtn: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    backgroundColor: colors.bgElev2,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  miniBtnText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },
});
