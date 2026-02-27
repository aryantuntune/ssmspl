import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import NetInfo from '@react-native-community/netinfo';
import { store } from './src/store';
import { RootNavigator } from './src/navigation';
import { setAuthFailureHandler } from './src/services/api';
import { resetAuth } from './src/store/slices/authSlice';
import { setOnline, setSessionExpired } from './src/store/slices/appSlice';
import { AuthStackParamList } from './src/types';

function App() {
  const navRef = useRef<NavigationContainerRef<AuthStackParamList>>(null);

  useEffect(() => {
    setAuthFailureHandler(() => {
      store.dispatch(setSessionExpired(true));
      store.dispatch(resetAuth());
    });
  }, []);

  useEffect(() => {
    let wasOffline = false;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = state.isConnected ?? true;
      store.dispatch(setOnline(online));
      wasOffline = !online;
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const appState = { current: AppState.currentState };
    const sub = AppState.addEventListener('change', (nextState: AppStateStatus) => {
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

export default App;
