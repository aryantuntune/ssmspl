import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { RootState, AppDispatch } from '../../store';
import { verifyOtp, clearError } from '../../store/slices/authSlice';
import * as authService from '../../services/authService';
import { AuthStackParamList } from '../../types';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'OTP'>;
type Route = RouteProp<AuthStackParamList, 'OTP'>;

export default function OTPScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { isLoading, error } = useSelector((s: RootState) => s.auth);
  const { email } = route.params;

  const [otp, setOtp] = useState('');
  const [resending, setResending] = useState(false);

  const handleVerify = async () => {
    const result = await dispatch(verifyOtp({ email, otp }));
    if (verifyOtp.fulfilled.match(result)) {
      Alert.alert('Email Verified', 'Your account has been verified. Please sign in.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await authService.resendOtp(email, 'registration');
      Alert.alert('OTP Sent', 'A new verification code has been sent to your email.');
    } catch {
      Alert.alert('Error', 'Failed to resend OTP. Please try again.');
    }
    setResending(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Verify Email</Text>
      <Text style={styles.subtitle}>Enter the 6-digit code sent to {email}</Text>

      <Card style={styles.card}>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <Input
          label="Verification Code"
          placeholder="Enter 6-digit OTP"
          keyboardType="number-pad"
          maxLength={6}
          value={otp}
          onChangeText={setOtp}
        />

        <Button title="Verify" onPress={handleVerify} loading={isLoading} disabled={otp.length !== 6} style={styles.btn} />

        <TouchableOpacity onPress={handleResend} disabled={resending} style={styles.resendBtn}>
          <Text style={styles.resendText}>{resending ? 'Sending...' : 'Resend OTP'}</Text>
        </TouchableOpacity>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: spacing.lg, justifyContent: 'center' },
  title: { ...typography.h1, color: colors.text, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs, marginBottom: spacing.lg },
  card: { padding: spacing.lg },
  errorBox: { backgroundColor: colors.errorLight, padding: spacing.md, borderRadius: borderRadius.sm, marginBottom: spacing.md },
  errorText: { ...typography.bodySmall, color: colors.error, textAlign: 'center' },
  btn: { marginTop: spacing.md },
  resendBtn: { alignItems: 'center', marginTop: spacing.lg },
  resendText: { ...typography.body, color: colors.primary },
});
