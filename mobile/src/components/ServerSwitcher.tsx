import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { SERVERS } from '../lib/config';
import { switchToServer } from '../lib/serverSwitcher';
import { activeServer, credentials, type ServerId } from '../lib/storage';
import { colors, radii, spacing, text as t } from '../theme';

/**
 * Two-tile server switcher.
 *
 * Shown at the top of the Dashboard.  The currently-active server is
 * highlighted; tapping the OTHER server triggers a transparent
 * /superadmin-login against the cached credentials, swaps the API base,
 * and notifies the parent to refetch.
 */
export function ServerSwitcher({ onSwitched }: { onSwitched: () => void }) {
  const [active, setActive] = useState<ServerId | null>(null);
  const [busy, setBusy] = useState<ServerId | null>(null);
  const [hasCreds, setHasCreds] = useState<Record<ServerId, boolean>>({
    server1: false,
    server2: false,
  });

  useEffect(() => {
    (async () => {
      setActive(await activeServer.get());
      const a = await credentials.get('server1');
      const b = await credentials.get('server2');
      setHasCreds({ server1: !!a, server2: !!b });
    })();
  }, []);

  const tap = async (id: ServerId) => {
    if (id === active || busy) return;
    if (!hasCreds[id]) {
      Alert.alert(
        'No credentials saved',
        'Sign out and re-add credentials for that server first.',
      );
      return;
    }
    setBusy(id);
    const r = await switchToServer(id);
    setBusy(null);
    if (!r.ok) {
      Alert.alert('Switch failed', r.reason ?? 'Unknown error');
      return;
    }
    setActive(id);
    onSwitched();
  };

  if (active === null) return null;

  return (
    <View style={styles.row}>
      {SERVERS.map((s) => {
        const isActive = active === s.id;
        const tint = s.id === 'server2' ? colors.serverAdmin : colors.serverProd;
        const cred = hasCreds[s.id];
        return (
          <Pressable
            key={s.id}
            onPress={() => tap(s.id)}
            disabled={!!busy}
            style={({ pressed }) => [
              styles.card,
              isActive
                ? { borderColor: tint, backgroundColor: colors.bgElev2 }
                : { borderColor: colors.border, backgroundColor: colors.bgElev },
              pressed && !isActive && { opacity: 0.85 },
            ]}
          >
            <View style={styles.cardTop}>
              <View style={[styles.dot, { backgroundColor: tint }]} />
              <Text style={[styles.label, { color: tint }]}>
                {s.id === 'server2' ? 'ADMIN PORTAL' : 'PRODUCTION'}
              </Text>
              {busy === s.id ? (
                <ActivityIndicator size="small" color={tint} />
              ) : isActive ? (
                <Text style={[styles.activeMark, { color: tint }]}>● live</Text>
              ) : !cred ? (
                <Text style={styles.noCreds}>no creds</Text>
              ) : (
                <Text style={styles.tapHint}>tap</Text>
              )}
            </View>
            <Text style={styles.host} numberOfLines={1}>
              {s.url.replace(/^https?:\/\//, '')}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  card: {
    flex: 1,
    borderWidth: 1,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.2, flex: 1 },
  activeMark: { fontSize: 11, fontWeight: '700' },
  tapHint: { ...t.meta, fontSize: 10 },
  noCreds: { color: colors.warnText, fontSize: 10, fontWeight: '700' },
  host: { color: colors.text, fontSize: 12, fontFamily: 'monospace', marginTop: 2 },
});
