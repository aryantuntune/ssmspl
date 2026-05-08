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

export async function ensurePermissions(): Promise<boolean> {
  if (!Device.isDevice) return false;
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') {
    const r = await Notifications.requestPermissionsAsync();
    status = r.status;
  }
  return status === 'granted';
}

export async function getExpoPushToken(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
    });
  }
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  try {
    const r = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    return r.data;
  } catch (e) {
    console.warn('getExpoPushTokenAsync failed', e);
    return null;
  }
}

export async function registerForPushNotifications(deviceLabel?: string): Promise<string | null> {
  const granted = await ensurePermissions();
  if (!granted) return null;
  const token = await getExpoPushToken();
  if (!token) return null;
  try {
    await registerDevice(token, deviceLabel);
    await prefs.set(PUSH_TOKEN_KEY, token);
  } catch (e) {
    console.warn('registerDevice failed', e);
  }
  return token;
}
