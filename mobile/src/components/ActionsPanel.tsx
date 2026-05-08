import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  forceSync,
  pruneImages,
  submitHostAction,
  testPush,
  triggerBackup,
  type ActionResult,
} from '../api/systemActions';
import { ActionButton } from './ActionButton';

type Props = {
  hostQueueAvailable: boolean;
  onAfterAction?: () => void;
};

export function ActionsPanel({ hostQueueAvailable, onAfterAction }: Props) {
  const wrap = async <T extends ActionResult>(fn: () => Promise<T>): Promise<T> => {
    const r = await fn();
    onAfterAction?.();
    return r;
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Quick actions</Text>

      <View style={styles.row}>
        <ActionButton
          label="Trigger backup"
          icon="⤓"
          variant="primary"
          confirm="Start a manual pg_dump now?"
          hint="writes .trigger marker"
          onPress={() => wrap(triggerBackup)}
          resultLabel={(r) => (r?.ok ? `triggered @ ${(r?.detail?.triggered_at ?? '').slice(11, 19)}` : r?.error ?? 'failed')}
        />
        <ActionButton
          label="Force GDrive sync"
          icon="↑"
          variant="primary"
          hint="touches .sync_needed"
          onPress={() => wrap(forceSync)}
          resultLabel={(r) => (r?.ok ? 'sync queued' : r?.error ?? 'failed')}
        />
      </View>

      <View style={styles.row}>
        <ActionButton
          label="Prune images"
          icon="✂"
          variant="warn"
          confirm="Delete dangling docker images? Frees disk."
          hint="docker image prune"
          onPress={() => wrap(pruneImages)}
          resultLabel={(r) => {
            if (!r?.ok) return r?.error ?? 'failed';
            const d = r.detail ?? {};
            return `${d.images_deleted ?? 0} images, ${d.space_reclaimed_mb ?? 0} MB freed`;
          }}
        />
        <ActionButton
          label="Test push"
          icon="📨"
          variant="ghost"
          hint="fans out to all devices"
          onPress={() => wrap(testPush)}
          resultLabel={(r) => {
            const d = r?.detail ?? {};
            return `sent ${d.sent ?? 0}, failed ${d.failed ?? 0}`;
          }}
        />
      </View>

      {hostQueueAvailable && (
        <>
          <Text style={[styles.title, { marginTop: 18 }]}>Host actions</Text>
          <Text style={styles.subtle}>Privileged ops via the host-side daemon.</Text>
          <View style={styles.row}>
            <ActionButton
              label="iptables fix"
              icon="🛡"
              variant="warn"
              hint="re-runs FORWARD-chain script"
              onPress={() => submitHostAction('run_iptables_fix')}
              resultLabel={hostResultLabel}
            />
            <ActionButton
              label="Run health-check"
              icon="♥"
              variant="ghost"
              hint="manual scripts/health_check.sh"
              onPress={() => submitHostAction('run_health_check', {}, 60)}
              resultLabel={hostResultLabel}
            />
          </View>
          <View style={styles.row}>
            <ActionButton
              label="Cleanup logs"
              icon="🧹"
              variant="ghost"
              confirm="Truncate large log files (>100 MB) on host?"
              hint="frees /var/log space"
              onPress={() => submitHostAction('cleanup_logs')}
              resultLabel={hostResultLabel}
            />
            <ActionButton
              label="Force-recreate backend"
              icon="↻"
              variant="danger"
              confirm="Stop & recreate admin-backend container? Brief downtime."
              hint="for zombie-pid recovery"
              onPress={() => submitHostAction('force_recreate_admin_backend', {}, 90)}
              resultLabel={hostResultLabel}
            />
          </View>
        </>
      )}

      {!hostQueueAvailable && (
        <Text style={styles.note}>
          Host-action daemon not detected. Install ssmspl-host-action-daemon on the server to enable
          privileged ops (iptables fix, force-recreate, log cleanup).
        </Text>
      )}
    </View>
  );
}

function hostResultLabel(r: any): string {
  if (!r) return 'no response';
  if (r.error) return r.error;
  if (r.exit_code === 0) return 'ok';
  if (r.exit_code != null) return `exit ${r.exit_code}`;
  return r.ok ? 'queued' : 'failed';
}

const styles = StyleSheet.create({
  wrap: { marginTop: 20 },
  title: { color: '#cbd5e1', fontSize: 16, fontWeight: '600', marginBottom: 8 },
  subtle: { color: '#94a3b8', fontSize: 12, marginBottom: 8 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  note: {
    color: '#94a3b8',
    fontSize: 12,
    fontStyle: 'italic',
    backgroundColor: '#1e293b',
    padding: 10,
    borderRadius: 8,
    marginTop: 4,
  },
});
