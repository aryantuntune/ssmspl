import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useSelector } from 'react-redux';
import { RootStackParamList } from '../types';
import { RootState } from '../store';
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import QRScannerScreen from '../screens/QRScannerScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isCheckingAuth, isAuthenticated } = useSelector((s: RootState) => s.auth);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isCheckingAuth ? (
        <Stack.Screen name="Splash" component={SplashScreen} />
      ) : !isAuthenticated ? (
        <Stack.Screen name="Login" component={LoginScreen} options={{ animationTypeForReplace: 'pop' }} />
      ) : (
        <>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen
            name="QRScanner"
            component={QRScannerScreen}
            options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
          />
        </>
      )}
    </Stack.Navigator>
  );
}
