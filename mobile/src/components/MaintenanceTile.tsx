import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  getMaintenance,
  setMaintenance,
  type MaintenanceState,
  type MaintenanceStatus,
} from '../api/maintenance';

const POLL_MS = 5000;

export function MaintenanceTile() {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await getMaintenance());
      setError(null);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Failed to read state';
      setError(typeof detail === 'string' ? detail : 'Failed to read state');
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const flip = (enable: boolean) => {
    if (busy) return;
    if (enable) {
      Alert.alert(
        'Enable maintenance mode?',
        `Every visitor on ${status?.server ?? 'this server'} will see the maintenance page until you turn this OFF. Cashiers won't be able to sell tickets.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Enable', style: 'destructive', onPress: () => doFlip(true) },
        ],
      );
    } else {
      // Disabling is fast-recovery — no confirm
      doFlip(false);
    }
  };

  const doFlip = async (enable: boolean) => {
    setBusy(true);
    try {
      const r = await setMaintenance(enable);
      setStatus(r);
      setError(null);
    } catch (e: any) {
      const detail = e?.response?.data?.detail || e?.message || 'Toggle failed';
      Alert.alert('Maintenance toggle failed', typeof detail === 'string' ? detail : JSON.stringify(detail));
      setError(typeof detail === 'string' ? detail : 'Toggle failed');
      // Re-read state from server to know reality
      load();
    } finally {
      setBusy(false);
    }
  };

  const isOn = status?.state === 'maintenance' || status?.state === 'update';
  const stateColor = stateToColor(status?.state);

  return (
    <View style={[styles.tile, isOn && styles.tileOn]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Maintenance Mode</Text>
          <Text style={styles.subtitle}>
            {status?.server ? `${status.server} server` : 'Loading server name…'}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: stateColor.bg, borderColor: stateColor.border }]}>
          <Text style={[styles.statusText, { color: stateColor.text }]}>
            {(status?.state ?? '?').toUpperCase()}
          </Text>
        </View>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <View style={styles.btnRow}>
        <Pressable
          onPress={() => flip(false)}
          disabled={busy || status?.state === 'off'}
          style={({ pressed }) => [
            styles.btn,
            styles.btnOff,
            (busy || status?.state === 'off') && styles.btnDisabled,
            pressed && { opacity: 0.7 },
          ]}
        >
          {busy && status?.state !== 'off' ? (
            <ActivityIndicator size="small" color="#cbd5e1" />
          ) : (
            <Text style={styles.btnOffText}>Turn OFF</Text>
          )}
        </Pressable>

        <Pressable
          onPress={() => flip(true)}
          disabled={busy || isOn}
          style={({ pressed }) => [
            styles.btn,
            styles.btnOn,
            (busy || isOn) && styles.btnDisabled,
            pressed && { opacity: 0.7 },
          ]}
        >
          {busy && !isOn ? (
            <ActivityIndicator size="small" color="#fecaca" />
          ) : (
            <Text style={styles.btnOnText}>Turn ON</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.helper}>
        Flips a flag file that nginx checks on every request. Visitors see the maintenance page
        within ~1 second. No container restart required.
      </Text>
    </View>
  );
}

function stateToColor(state: MaintenanceState | undefined) {
  if (state === 'maintenance') return { bg: '#7f1d1d', border: '#ef4444', text: '#fecaca' };
  if (state === 'update') return { bg: '#78350f', border: '#f59e0b', text: '#fcd34d' };
  if (state === 'off') return { bg: '#064e3b', border: '#10b981', text: '#a7f3d0' };
  return { bg: '#1e293b', border: '#334155', text: '#94a3b8' };
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: '#1e293b',
    padding: 14,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tileOn: { borderColor: '#ef4444' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: { color: '#f8fafc', fontSize: 15, fontWeight: '600' },
  subtitle: { color: '#94a3b8', fontSize: 12, marginTop: 2 },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  error: {
    color: '#f87171',
    fontSize: 12,
    backgroundColor: '#7f1d1d20',
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
  },
  btnRow: { flexDirection: 'row', gap: 10 },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnOff: { backgroundColor: '#0f172a', borderColor: '#334155' },
  btnOffText: { color: '#cbd5e1', fontSize: 13, fontWeight: '600' },
  btnOn: { backgroundColor: '#3f1d1d', borderColor: '#7f1d1d' },
  btnOnText: { color: '#fecaca', fontSize: 13, fontWeight: '600' },
  btnDisabled: { opacity: 0.4 },
  helper: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 10,
    lineHeight: 14,
  },
});
