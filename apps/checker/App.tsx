import React, { useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from './src/store';
import { RootNavigator } from './src/navigation';
import { setAuthFailureHandler } from './src/services/api';
import { resetAuth } from './src/store/slices/authSlice';
import { RootStackParamList } from './src/types';

export default function App() {
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  React.useEffect(() => {
    setAuthFailureHandler(() => {
      store.dispatch(resetAuth());
      navRef.current?.reset({ index: 0, routes: [{ name: 'Login' }] });
    });
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
