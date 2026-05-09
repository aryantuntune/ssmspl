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
import { colors, radii, spacing, text as t } from '../theme';

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
      load();
    } finally {
      setBusy(false);
    }
  };

  const isOn = status?.state === 'maintenance' || status?.state === 'update';
  const sc = stateToColor(status?.state);

  return (
    <View style={[styles.tile, isOn && { borderColor: sc.accent }]}>
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Maintenance Mode</Text>
          <Text style={styles.subtitle}>
            {status?.server ? `${status.server} server` : 'Loading server name…'}
          </Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: sc.bg, borderColor: sc.accent }]}>
          <Text style={[styles.statusText, { color: sc.fg }]}>
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
            <ActivityIndicator size="small" color={colors.action.ghostText} />
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
            <ActivityIndicator size="small" color={colors.action.dangerText} />
          ) : (
            <Text style={styles.btnOnText}>Turn ON</Text>
          )}
        </Pressable>
      </View>

      <Text style={styles.helper}>
        Flips an nginx flag — visitors see the maintenance page within ~1 second.
        No container restart required.
      </Text>
    </View>
  );
}

function stateToColor(state: MaintenanceState | undefined) {
  if (state === 'maintenance') return { bg: colors.critBg, accent: colors.crit, fg: colors.critText };
  if (state === 'update') return { bg: colors.warnBg, accent: colors.warn, fg: colors.warnText };
  if (state === 'off') return { bg: colors.okBg, accent: colors.ok, fg: colors.okText };
  return { bg: colors.bgElev2, accent: colors.border, fg: colors.textMuted };
}

const styles = StyleSheet.create({
  tile: {
    backgroundColor: colors.bgElev,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: { ...t.h2, fontSize: 14 },
  subtitle: { ...t.meta, marginTop: 2 },
  statusPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 4,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  error: {
    color: colors.critText,
    fontSize: 12,
    backgroundColor: colors.critBg,
    padding: 8,
    borderRadius: radii.sm,
    marginBottom: 10,
  },
  btnRow: { flexDirection: 'row', gap: spacing.sm },
  btn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.md,
    alignItems: 'center',
    borderWidth: 1,
  },
  btnOff: { backgroundColor: colors.action.ghost, borderColor: colors.action.ghostBorder },
  btnOffText: { color: colors.action.ghostText, fontSize: 13, fontWeight: '700' },
  btnOn: { backgroundColor: colors.action.danger, borderColor: colors.action.dangerBorder },
  btnOnText: { color: colors.action.dangerText, fontSize: 13, fontWeight: '700' },
  btnDisabled: { opacity: 0.4 },
  helper: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 10,
    lineHeight: 14,
  },
});
