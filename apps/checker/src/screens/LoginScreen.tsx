import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { colors, spacing, borderRadius, typography } from '../theme';
import { RootState, AppDispatch } from '../store';
import { login, clearError } from '../store/slices/authSlice';
import { setSessionExpired } from '../store/slices/uiSlice';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import Card from '../components/common/Card';

export default function LoginScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const { isLoading, error } = useSelector((s: RootState) => s.auth);
  const sessionExpired = useSelector((s: RootState) => s.ui.sessionExpired);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    return () => { dispatch(clearError()); };
  }, [dispatch]);

  useEffect(() => {
    if (sessionExpired && (email || password)) {
      dispatch(setSessionExpired(false));
    }
  }, [email, password, sessionExpired, dispatch]);

  const isValid = email.includes('@') && password.length >= 6;

  const handleLogin = () => {
    if (!isValid) return;
    dispatch(login({ email: email.trim(), password }));
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Image source={require('../../assets/logo.png')} style={styles.logo} resizeMode="contain" />
          <Text style={styles.title}>Checker Login</Text>
          <Text style={styles.subtitle}>SSMSPL Ferry Verification</Text>
        </View>

        {sessionExpired && (
          <View style={styles.sessionBanner} accessibilityRole="alert">
            <Text style={styles.sessionText}>Session expired. Please log in again.</Text>
          </View>
        )}

        <Card style={styles.card}>
          {error && (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Input
            label="Email"
            placeholder="Enter your email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            autoComplete="email"
            accessibilityLabel="Email address"
          />

          <Input
            label="Password"
            placeholder="Enter your password"
            isPassword
            value={password}
            onChangeText={setPassword}
            accessibilityLabel="Password"
          />

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={isLoading}
            disabled={!isValid}
            style={styles.loginBtn}
          />
        </Card>

        <Text style={styles.footer}>Only authorized ticket checkers can access this app.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { width: 100, height: 84, marginBottom: spacing.xs },
  title: { ...typography.h1, color: colors.text, marginTop: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  card: { padding: spacing.lg },
  errorBox: {
    backgroundColor: colors.errorLight,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  errorText: { ...typography.bodySmall, color: colors.error, textAlign: 'center' },
  sessionBanner: {
    backgroundColor: colors.warningLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  sessionText: { ...typography.bodySmall, color: colors.text, textAlign: 'center' as const },
  loginBtn: { marginTop: spacing.sm },
  footer: {
    ...typography.caption,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
