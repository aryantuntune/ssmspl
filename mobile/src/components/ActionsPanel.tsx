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
      <Text style={styles.section}>Backups & sync</Text>
      <View style={styles.row}>
        <ActionButton
          label="Backup database now"
          variant="primary"
          confirm="Start a manual pg_dump? Runs in ~30s; non-blocking."
          hint="Triggers an immediate Postgres dump"
          onPress={() => wrap(triggerBackup)}
          resultLabel={(r) =>
            r?.ok
              ? `Triggered at ${(r?.detail?.triggered_at ?? '').slice(11, 19)} UTC`
              : r?.error ?? 'Failed'
          }
        />
        <ActionButton
          label="Sync to Google Drive"
          variant="primary"
          hint="Uploads pending backups offsite"
          onPress={() => wrap(forceSync)}
          resultLabel={(r) => (r?.ok ? 'Sync queued for next run' : r?.error ?? 'Failed')}
        />
      </View>

      <Text style={styles.section}>Maintenance</Text>
      <View style={styles.row}>
        <ActionButton
          label="Clean unused Docker images"
          variant="warn"
          confirm="Delete dangling Docker images? Frees disk; safe — only removes what's no longer referenced."
          hint="Frees disk space"
          onPress={() => wrap(pruneImages)}
          resultLabel={(r) => {
            if (!r?.ok) return r?.error ?? 'Failed';
            const d = r.detail ?? {};
            return `Removed ${d.images_deleted ?? 0} image(s) · freed ${d.space_reclaimed_mb ?? 0} MB`;
          }}
        />
        <ActionButton
          label="Send test alert to phone"
          variant="ghost"
          hint="Verifies push notifications work"
          onPress={() => wrap(testPush)}
          resultLabel={(r) => {
            const d = r?.detail ?? {};
            return `Sent to ${d.sent ?? 0} device(s) · ${d.failed ?? 0} failed`;
          }}
        />
      </View>

      {hostQueueAvailable && (
        <>
          <Text style={styles.section}>Host-level fixes</Text>
          <Text style={styles.subtle}>
            These run on the host machine itself, not in a container — used to recover from broken
            networking or stuck containers.
          </Text>
          <View style={styles.row}>
            <ActionButton
              label="Re-apply iptables rules"
              variant="warn"
              hint="Fixes Docker FORWARD-chain breakage"
              onPress={() => submitHostAction('run_iptables_fix')}
              resultLabel={hostResultLabel}
            />
            <ActionButton
              label="Run host health check"
              variant="ghost"
              hint="Re-runs health_check.sh manually"
              onPress={() => submitHostAction('run_health_check', {}, 60)}
              resultLabel={hostResultLabel}
            />
          </View>
          <View style={styles.row}>
            <ActionButton
              label="Truncate large host logs"
              variant="ghost"
              confirm="Truncate any /var/log file over 200MB on the host?"
              hint="Frees disk in /var/log"
              onPress={() => submitHostAction('cleanup_logs')}
              resultLabel={hostResultLabel}
            />
            <ActionButton
              label="Force-recreate admin-backend"
              variant="danger"
              confirm="Stop & recreate the admin-backend container? ~30s downtime — use when it's stuck."
              hint="Recovers from zombie container"
              onPress={() => submitHostAction('force_recreate_admin_backend', {}, 90)}
              resultLabel={hostResultLabel}
            />
          </View>
        </>
      )}

      {!hostQueueAvailable && (
        <Text style={styles.note}>
          Host-action daemon is not installed yet. Once set up, this panel gains buttons for
          iptables fix, container force-recreate, and host log cleanup.
        </Text>
      )}
    </View>
  );
}

function hostResultLabel(r: any): string {
  if (!r) return 'No response';
  if (r.error) return r.error;
  if (r.exit_code === 0) return 'Done';
  if (r.exit_code != null) return `Exit code ${r.exit_code}`;
  return r.ok ? 'Queued' : 'Failed';
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  section: {
    color: '#cbd5e1',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 18,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  subtle: { color: '#94a3b8', fontSize: 12, marginBottom: 10, lineHeight: 16 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  note: {
    color: '#94a3b8',
    fontSize: 12,
    fontStyle: 'italic',
    backgroundColor: '#1e293b',
    padding: 10,
    borderRadius: 8,
    marginTop: 14,
  },
});
