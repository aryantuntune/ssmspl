import * as Notifications from 'expo-notifications';

import { prefs } from './storage';
import type { HealthEvent } from '../api/systemHealth';

const LAST_SEEN_KEY = 'ssmspl_last_seen_event_id';

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

/** Reset the marker (e.g., after sign-out). */
export async function resetLocalAlertMarker(): Promise<void> {
  await prefs.remove(LAST_SEEN_KEY);
}
