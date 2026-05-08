import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { registerDevice } from '../api/systemHealth';
import { prefs, PUSH_TOKEN_KEY } from './storage';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export type PushRegistrationResult = {
  token: string | null;
  ok: boolean;
  reason?: string;
};

const PLACEHOLDER_PROJECT_ID = 'REPLACE_WITH_YOUR_EAS_PROJECT_ID';

function getValidProjectId(): string | null {
  const id =
    (Constants.expoConfig?.extra as any)?.eas?.projectId ??
    (Constants as any).easConfig?.projectId ??
    null;
  if (!id || id === PLACEHOLDER_PROJECT_ID || id.length < 8) return null;
  return id;
}

export async function ensurePermissions(): Promise<boolean> {
  if (!Device.isDevice) return false;
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const r = await Notifications.requestPermissionsAsync();
    status = r.status;
  }
  return status === 'granted';
}

export async function registerForPushNotifications(deviceLabel?: string): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return { token: null, ok: false, reason: 'Not a physical device — push only works on real hardware.' };
  }

  const granted = await ensurePermissions();
  if (!granted) {
    return { token: null, ok: false, reason: 'Notification permission denied. Enable in Android Settings → Apps → SSMSPL SuperAdmin → Notifications.' };
  }

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#3B82F6',
      });
    } catch {
      // channel setup is best-effort
    }
  }

  const projectId = getValidProjectId();
  if (!projectId) {
    return {
      token: null,
      ok: false,
      reason:
        'No EAS project ID configured. Run `npx eas init` in mobile/ to create one, then put the UUID in app.json under extra.eas.projectId. Without it, Expo refuses to issue push tokens.',
    };
  }

  let token: string;
  try {
    const r = await Notifications.getExpoPushTokenAsync({ projectId });
    token = r.data;
  } catch (e: any) {
    return {
      token: null,
      ok: false,
      reason: `Expo push-token fetch failed: ${e?.message ?? e}`,
    };
  }

  try {
    await registerDevice(token, deviceLabel);
    await prefs.set(PUSH_TOKEN_KEY, token);
  } catch (e: any) {
    return {
      token,
      ok: false,
      reason: `Got token but backend registerDevice failed: ${e?.response?.data?.detail ?? e?.message ?? e}`,
    };
  }

  return { token, ok: true };
}
