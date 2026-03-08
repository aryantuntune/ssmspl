import React, { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Linking, Alert } from 'react-native';
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

  // Handle ssmspl://payment-callback deep link from payment gateway flow
  useEffect(() => {
    const handleDeepLink = (event: { url: string }) => {
      try {
        const url = new URL(event.url);
        if (url.hostname === 'payment-callback' || url.pathname === '/payment-callback') {
          const status = url.searchParams.get('status');
          const bookingId = url.searchParams.get('booking_id');

          if (status === 'success') {
            Alert.alert(
              'Payment Successful!',
              'Your booking has been confirmed. View it in My Bookings.',
              [{ text: 'OK' }],
            );
          } else {
            Alert.alert(
              'Payment Failed',
              'Your payment could not be processed. You can retry from My Bookings.',
              [{ text: 'OK' }],
            );
          }
        }
      } catch {
        // Ignore malformed URLs
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);

    // Handle cold start deep link
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
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
