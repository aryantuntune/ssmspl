/**
 * Standalone notification bootstrap for the SuperAdmin app.
 *
 * Runs on every app launch. Does NOT depend on EAS, FCM, or any
 * external push provider — the app issues its own LOCAL notifications
 * from the foreground polling loop in DashboardScreen → localAlerts.ts.
 *
 * Two things must be in place for those notifications to actually
 * surface on the phone:
 *
 * 1. Notification permission granted. On Android 13+ this is a runtime
 *    prompt; on older Android it's auto-granted at install time.
 *
 * 2. A high-importance notification channel named "default". The
 *    `Notifications.scheduleNotificationAsync` call in localAlerts.ts
 *    posts to this channel; if the channel doesn't exist or is set to
 *    LOW importance, the OS silently downgrades the notification to a
 *    silent statusbar entry — no sound, no vibration, no pop-up.
 *
 * Both of these were previously gated behind the EAS push-token flow,
 * which short-circuits because there's no EAS project configured. So
 * the local-notification path was wired but the OS was muting every
 * one of them. This bootstrap fixes that without adding any new deps.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

let bootstrapped = false;

export async function bootstrapNotifications(): Promise<{ permission: boolean; channel: boolean }> {
  if (bootstrapped) return { permission: true, channel: true };

  let permission = false;
  try {
    const cur = await Notifications.getPermissionsAsync();
    permission = cur.status === 'granted';
    if (!permission) {
      const req = await Notifications.requestPermissionsAsync({
        android: {},
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      permission = req.status === 'granted';
    }
  } catch {
    // permission check should never throw, but if it does we just keep
    // permission=false and the rest of the app keeps working.
  }

  let channel = false;
  if (Platform.OS === 'android') {
    try {
      // The "default" channel name MUST match the channelId targeted by
      // localAlerts.ts (it omits channelId, so expo-notifications uses
      // "default"). MAX importance gives heads-up popup + sound + vibrate
      // even when the app is backgrounded but recently active.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Server health alerts',
        description: 'CRIT-level health events from your servers (e.g. backend down, DB unreachable).',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 400, 200, 400],
        lightColor: '#ef4444',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
        lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
        bypassDnd: false,
      });
      channel = true;
    } catch {
      // setNotificationChannelAsync can fail on very old Android — non-fatal.
    }
  } else {
    channel = true;
  }

  bootstrapped = true;
  return { permission, channel };
}
