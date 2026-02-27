import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';
import { store } from './src/store';
import { RootNavigator } from './src/navigation';
import { setAuthFailureHandler } from './src/services/api';
import { resetAuth } from './src/store/slices/authSlice';
import { setOnline, setSessionExpired, syncPendingCount } from './src/store/slices/uiSlice';
import { flushOfflineQueue } from './src/utils/offlineQueue';
import { RootStackParamList } from './src/types';

const sentryDsn = Constants.expoConfig?.extra?.sentryDsn;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
  });
}

function App() {
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  useEffect(() => {
    setAuthFailureHandler(() => {
      store.dispatch(setSessionExpired(true));
      store.dispatch(resetAuth());
      navRef.current?.reset({ index: 0, routes: [{ name: 'Login' }] });
    });
  }, []);

  const appState = useRef(AppState.currentState);

  useEffect(() => {
    let wasOffline = false;
    const unsubscribe = NetInfo.addEventListener(async (state) => {
      const online = state.isConnected ?? true;
      store.dispatch(setOnline(online));
      if (online && wasOffline) {
        await flushOfflineQueue();
        store.dispatch(syncPendingCount());
      }
      wasOffline = !online;
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextState === 'active') {
        const netState = await NetInfo.fetch();
        if (netState.isConnected) {
          await flushOfflineQueue();
          store.dispatch(syncPendingCount());
        }
      }
      appState.current = nextState;
    });
    return () => sub.remove();
  }, []);

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <NavigationContainer ref={navRef}>
          <RootNavigator />
          <StatusBar style="auto" />
        </NavigationContainer>
      </SafeAreaProvider>
    </Provider>
  );
}

export default sentryDsn ? Sentry.wrap(App) : App;
