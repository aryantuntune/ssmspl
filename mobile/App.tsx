import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { Subscription } from 'expo-notifications';

import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import IncidentReportScreen from './src/screens/IncidentReportScreen';
import LogsScreen from './src/screens/LogsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import VersionsScreen from './src/screens/VersionsScreen';
import BackupsScreen from './src/screens/BackupsScreen';
import LockedScreen from './src/screens/LockedScreen';
import TodosScreen from './src/screens/TodosScreen';
import { tokens } from './src/lib/storage';
import { bootstrapNotifications } from './src/lib/bootstrapNotifications';
import { requireBiometric } from './src/lib/biometric';
import { refreshActiveSession } from './src/api/client';
import { colors } from './src/theme';

// IMPORTANT: register the notification handler at module-load time, not
// inside any component effect.  expo-notifications walks back through this
// handler whenever a local-scheduled notification fires, including the ones
// dispatched with `trigger: null`.  If the handler is set up inside an
// effect, there's a window during which the OS may have already dispatched
// without it being live -> the notification is silently dropped.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

type Screen =
  | 'login'
  | 'dashboard'
  | 'settings'
  | 'logs'
  | 'versions'
  | 'incident'
  | 'backups'
  | 'todos'
  | 'locked';

// Refresh the access token on launch if it's older than this. 12h means
// even a multi-day phone restart gracefully renews behind the scenes before
// the user touches anything.
const REFRESH_THRESHOLD_MS = 12 * 60 * 60 * 1000;

export default function App() {
  const [screen, setScreen] = useState<Screen | null>(null);
  const [logsContainer, setLogsContainer] = useState<string | null>(null);
  const [lockedAttempts, setLockedAttempts] = useState(0);
  const [bioBusy, setBioBusy] = useState(false);
  const responseListener = useRef<Subscription>();

  // ---- Cold-launch flow ---------------------------------------------------
  // 1. Bootstrap the high-importance notification channel + permission ask.
  // 2. Load access token from SecureStore.
  // 3. If a token exists and is stale, try refresh-token rotation.
  // 4. Run biometric gate (skip silently if hardware/enrolment absent).
  // 5. Land on dashboard (or login).
  const runColdLaunch = useCallback(async () => {
    // (1) channel + permission
    bootstrapNotifications().catch(() => {});

    // (2) any cached token?
    const access = await tokens.getAccess();
    if (!access) {
      setScreen('login');
      return;
    }

    // (3) stale-token refresh
    const ageMs = await tokens.getAccessAgeMs();
    if (ageMs == null || ageMs > REFRESH_THRESHOLD_MS) {
      const ok = await refreshActiveSession();
      if (!ok) {
        await tokens.clear();
        setScreen('login');
        return;
      }
    }

    // (4) biometric gate
    await runBiometricGate();
  }, []);

  const runBiometricGate = useCallback(async () => {
    setBioBusy(true);
    const r = await requireBiometric('Unlock Admin Console');
    setBioBusy(false);
    if (r === 'ok' || r === 'unavailable') {
      setLockedAttempts(0);
      setScreen('dashboard');
      return;
    }
    // r === 'denied' — let the user retry; lock after 3.
    setLockedAttempts((cur) => cur + 1);
    setScreen('locked');
  }, []);

  useEffect(() => {
    runColdLaunch();
  }, [runColdLaunch]);

  // When user taps a push notification, jump to dashboard so they see live state.
  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {
      setScreen((cur) => (cur === 'login' || cur === 'locked' ? cur : 'dashboard'));
    });
    return () => {
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  if (screen === null) {
    return <View style={styles.bg} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor={colors.bg} />
      <SafeAreaView style={styles.bg} edges={['top', 'bottom']}>
        {screen === 'login' && (
          <LoginScreen
            onLoggedIn={() => {
              setLockedAttempts(0);
              setScreen('dashboard');
            }}
          />
        )}
        {screen === 'locked' && (
          <LockedScreen
            attempt={lockedAttempts}
            busy={bioBusy}
            onRetry={runBiometricGate}
            onForceLogin={async () => {
              await tokens.clear();
              setLockedAttempts(0);
              setScreen('login');
            }}
          />
        )}
        {screen === 'dashboard' && (
          <DashboardScreen
            onSettings={() => setScreen('settings')}
            onVersions={() => setScreen('versions')}
            onIncidentReport={() => setScreen('incident')}
            onBackups={() => setScreen('backups')}
            onTodos={() => setScreen('todos')}
            onTailLogs={(name) => {
              setLogsContainer(name);
              setScreen('logs');
            }}
          />
        )}
        {screen === 'todos' && <TodosScreen onClose={() => setScreen('dashboard')} />}
        {screen === 'logs' && logsContainer && (
          <LogsScreen
            containerName={logsContainer}
            onClose={() => setScreen('dashboard')}
          />
        )}
        {screen === 'versions' && (
          <VersionsScreen onClose={() => setScreen('dashboard')} />
        )}
        {screen === 'incident' && (
          <IncidentReportScreen onClose={() => setScreen('dashboard')} />
        )}
        {screen === 'backups' && (
          <BackupsScreen onClose={() => setScreen('dashboard')} />
        )}
        {screen === 'settings' && (
          <SettingsScreen
            onBack={() => setScreen('dashboard')}
            onLoggedOut={() => setScreen('login')}
          />
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
});
