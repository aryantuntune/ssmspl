import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import { Subscription } from 'expo-notifications';

import LoginScreen from './src/screens/LoginScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import LogsScreen from './src/screens/LogsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import { tokens } from './src/lib/storage';

type Screen = 'login' | 'dashboard' | 'settings' | 'logs';

export default function App() {
  const [screen, setScreen] = useState<Screen | null>(null);
  const [logsContainer, setLogsContainer] = useState<string | null>(null);
  const responseListener = useRef<Subscription>();

  const checkAuth = useCallback(async () => {
    const t = await tokens.getAccess();
    setScreen(t ? 'dashboard' : 'login');
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  // When user taps a push notification, jump to dashboard so they see live state.
  useEffect(() => {
    responseListener.current = Notifications.addNotificationResponseReceivedListener(() => {
      setScreen((cur) => (cur === 'login' ? cur : 'dashboard'));
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
      <StatusBar style="light" backgroundColor="#0b1220" />
      <SafeAreaView style={styles.bg} edges={['top', 'bottom']}>
        {screen === 'login' && <LoginScreen onLoggedIn={() => setScreen('dashboard')} />}
        {screen === 'dashboard' && (
          <DashboardScreen
            onSettings={() => setScreen('settings')}
            onTailLogs={(name) => {
              setLogsContainer(name);
              setScreen('logs');
            }}
          />
        )}
        {screen === 'logs' && logsContainer && (
          <LogsScreen
            containerName={logsContainer}
            onClose={() => setScreen('dashboard')}
          />
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
  bg: { flex: 1, backgroundColor: '#0b1220' },
});
