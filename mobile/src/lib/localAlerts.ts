import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { prefs } from './storage';
import type { HealthEvent } from '../api/systemHealth';
import type { BackupEvent } from '../api/backupEvents';

const LAST_SEEN_KEY = 'ssmspl_last_seen_event_id';
const LAST_SEEN_BACKUP_KEY = 'ssmspl_last_seen_backup_event_id';

/**
 * Foreground local-notification watchdog.
 *
 * Compare the latest fetched events against the highest event ID we've ever
 * shown the user. For any NEW CRIT events, fire a local notification — these
 * work without push tokens (no EAS required), use Android's notification
 * channel "default" set to MAX importance + vibration + sound, and arrive
 * even if the app is backgrounded but recently active.
 *
 * For "wakes you from sleep" reliability with the app fully closed, the
 * server-side ntfy.sh push (configured in scripts/health_check.sh) is the
 * primary channel. This local-notification path is the secondary belt-and-
 * suspenders that fires the moment the user opens the app.
 */
export async function fireLocalAlertsForNewCrits(events: HealthEvent[]): Promise<void> {
  if (!events || events.length === 0) return;

  const lastSeenStr = await prefs.get(LAST_SEEN_KEY);
  const lastSeen = lastSeenStr ? Number(lastSeenStr) : 0;

  // Newest first → reverse for chronological notification ordering
  const newCrits = events
    .filter((e) => e.severity === 'CRIT' && !e.acked_at && e.id > lastSeen)
    .sort((a, b) => a.id - b.id);

  if (newCrits.length === 0) {
    // Update marker even when no CRITs, so we don't re-notify after future ack
    const maxId = Math.max(...events.map((e) => e.id), lastSeen);
    if (maxId > lastSeen) await prefs.set(LAST_SEEN_KEY, String(maxId));
    return;
  }

  for (const ev of newCrits) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `🚨 ${ev.server_name}: ${ev.check_name}`,
          body: ev.message.slice(0, 240),
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 400, 200, 400],
          data: { event_id: ev.id, severity: ev.severity, kind: 'health-crit' },
          // CRITICAL: target the high-importance channel created in
          // bootstrapNotifications.ts. Without this, Android routes the
          // notification through expo-notifications' silent fallback
          // channel which means no sound and no heads-up popup.
          ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
        },
        trigger: null, // immediate
      });
    } catch (e) {
      // schedule fails silently if permission not granted; don't disrupt UI
      console.warn('local notification schedule failed', e);
    }
  }

  const maxId = newCrits[newCrits.length - 1].id;
  await prefs.set(LAST_SEEN_KEY, String(maxId));
}

/**
 * Same idea but for backup events.  Fires a local notification when a NEW
 * `failed` (or `partial`) backup event shows up that the user hasn't been
 * notified of yet.
 *
 * Tracked separately from health events so they don't share the LAST_SEEN
 * cursor — a backup-event id space is independent of the health-event
 * id space.
 */
export async function fireLocalAlertsForNewBackupFailures(
  events: BackupEvent[],
): Promise<void> {
  if (!events || events.length === 0) return;

  const lastSeenStr = await prefs.get(LAST_SEEN_BACKUP_KEY);
  const lastSeen = lastSeenStr ? Number(lastSeenStr) : 0;

  const newFailures = events
    .filter(
      (e) =>
        (e.status === 'failed' || e.status === 'partial') && e.id > lastSeen,
    )
    .sort((a, b) => a.id - b.id);

  if (newFailures.length === 0) {
    const maxId = Math.max(...events.map((e) => e.id), lastSeen);
    if (maxId > lastSeen) await prefs.set(LAST_SEEN_BACKUP_KEY, String(maxId));
    return;
  }

  for (const ev of newFailures) {
    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: `⚠ Backup failed — ${prettyServer(ev.server_name)} ${ev.backup_type}`,
          body: (ev.message ?? '').slice(0, 240) || 'No additional detail.',
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.MAX,
          vibrate: [0, 400, 200, 400],
          data: {
            backup_event_id: ev.id,
            status: ev.status,
            kind: 'backup-failure',
          },
          ...(Platform.OS === 'android' ? { channelId: 'default' } : {}),
        },
        trigger: null,
      });
    } catch (e) {
      console.warn('backup-failure local notification schedule failed', e);
    }
  }

  const maxId = newFailures[newFailures.length - 1].id;
  await prefs.set(LAST_SEEN_BACKUP_KEY, String(maxId));
}

function prettyServer(name: string): string {
  if (/^admin/i.test(name)) return 'Server 2';
  if (/carferry/i.test(name)) return 'Server 1';
  return name;
}

/** Reset markers (e.g., after sign-out). */
export async function resetLocalAlertMarker(): Promise<void> {
  await prefs.remove(LAST_SEEN_KEY);
  await prefs.remove(LAST_SEEN_BACKUP_KEY);
}
