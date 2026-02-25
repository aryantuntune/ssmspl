import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography } from '../theme';
import { RootState, AppDispatch } from '../store';
import { checkAuthStatus } from '../store/slices/authSlice';
import { RootStackParamList } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Splash'>;
};

export default function SplashScreen({ navigation }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { isCheckingAuth, isAuthenticated } = useSelector((s: RootState) => s.auth);

  useEffect(() => {
    dispatch(checkAuthStatus());
  }, [dispatch]);

  useEffect(() => {
    if (!isCheckingAuth) {
      navigation.reset({
        index: 0,
        routes: [{ name: isAuthenticated ? 'Home' : 'Login' }],
      });
    }
  }, [isCheckingAuth, isAuthenticated, navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🎫</Text>
      <Text style={styles.title}>SSMSPL Checker</Text>
      <ActivityIndicator size="large" color={colors.textOnPrimary} style={styles.loader} />
      <Text style={styles.sub}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { ...typography.h1, color: colors.textOnPrimary },
  loader: { marginTop: 32 },
  sub: { ...typography.body, color: 'rgba(255,255,255,0.7)', marginTop: 12 },
});
