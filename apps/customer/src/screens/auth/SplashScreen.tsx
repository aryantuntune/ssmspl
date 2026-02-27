import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { useDispatch } from 'react-redux';
import { colors, typography } from '../../theme';
import { AppDispatch } from '../../store';
import { checkAuthStatus } from '../../store/slices/authSlice';

const logoWhite = require('../../../assets/logo-white.png');

export default function SplashScreen() {
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    dispatch(checkAuthStatus());
  }, [dispatch]);

  return (
    <View style={styles.container} accessibilityLabel="Loading SSMSPL Customer">
      <Image source={logoWhite} style={styles.logo} resizeMode="contain" />
      <Text style={styles.title}>SSMSPL</Text>
      <Text style={styles.subtitle}>Ferry Booking</Text>
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
  logo: { width: 120, height: 100, marginBottom: 16 },
  title: { ...typography.h1, color: colors.textOnPrimary },
  subtitle: { ...typography.body, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  loader: { marginTop: 32 },
  sub: { ...typography.body, color: 'rgba(255,255,255,0.7)', marginTop: 12 },
});
