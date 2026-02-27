import React, { useState } from 'react';
import {
  View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Alert,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { RootState, AppDispatch } from '../../store';
import { register, clearError } from '../../store/slices/authSlice';
import { AuthStackParamList } from '../../types';
import { isValidEmail, isValidPassword, isValidPhone } from '../../utils/validators';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'Register'>;

export default function RegisterScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation<Nav>();
  const { isLoading, error } = useSelector((s: RootState) => s.auth);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const isValid =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    isValidEmail(email) &&
    isValidPhone(mobile) &&
    isValidPassword(password) &&
    password === confirmPassword;

  const handleRegister = async () => {
    if (!isValid) return;
    const result = await dispatch(register({
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      password,
      mobile: mobile.trim(),
    }));
    if (register.fulfilled.match(result)) {
      navigation.navigate('OTP', { email: email.trim() });
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Register to start booking ferry tickets</Text>

        <Card style={styles.card}>
          {error && (
            <View style={styles.errorBox} accessibilityRole="alert">
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Input label="First Name" placeholder="Enter first name" value={firstName} onChangeText={setFirstName} />
          <Input label="Last Name" placeholder="Enter last name" value={lastName} onChangeText={setLastName} />
          <Input label="Email" placeholder="Enter email" keyboardType="email-address" value={email} onChangeText={setEmail} autoComplete="email" />
          <Input label="Mobile" placeholder="+91XXXXXXXXXX" keyboardType="phone-pad" value={mobile} onChangeText={setMobile} />
          <Input label="Password" placeholder="Min 8 chars, upper, lower, digit, special" isPassword value={password} onChangeText={setPassword} />
          <Input
            label="Confirm Password"
            placeholder="Re-enter password"
            isPassword
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            error={confirmPassword && password !== confirmPassword ? 'Passwords do not match' : undefined}
          />

          <Button title="Register" onPress={handleRegister} loading={isLoading} disabled={!isValid} style={styles.btn} />
        </Card>

        <View style={styles.loginRow}>
          <Text style={styles.loginText}>Already have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('Login')}>
            <Text style={styles.loginLink}>Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, padding: spacing.lg, paddingTop: spacing.xxl },
  title: { ...typography.h1, color: colors.text, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.lg },
  card: { padding: spacing.lg },
  errorBox: { backgroundColor: colors.errorLight, padding: spacing.md, borderRadius: borderRadius.sm, marginBottom: spacing.md },
  errorText: { ...typography.bodySmall, color: colors.error, textAlign: 'center' },
  btn: { marginTop: spacing.md },
  loginRow: { flexDirection: 'row', justifyContent: 'center', marginTop: spacing.lg },
  loginText: { ...typography.body, color: colors.textSecondary },
  loginLink: { ...typography.body, color: colors.primary, fontWeight: '600' },
});
