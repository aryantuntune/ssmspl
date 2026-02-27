import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import * as authService from '../../services/authService';
import { AuthStackParamList } from '../../types';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'ForgotPasswordOTP'>;
type Route = RouteProp<AuthStackParamList, 'ForgotPasswordOTP'>;

export default function ForgotPasswordOTPScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { email } = route.params;
  const [otp, setOtp] = useState('');
  const [resending, setResending] = useState(false);

  const handleVerify = () => {
    if (otp.length === 6) {
      navigation.navigate('ResetPassword', { email, otp });
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await authService.resendOtp(email, 'password_reset');
      Alert.alert('OTP Sent', 'A new reset code has been sent.');
    } catch {
      Alert.alert('Error', 'Failed to resend. Please try again.');
    }
    setResending(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Enter Reset Code</Text>
      <Text style={styles.subtitle}>Code sent to {email}</Text>

      <Card style={styles.card}>
        <Input label="Reset Code" placeholder="Enter 6-digit code" keyboardType="number-pad" maxLength={6} value={otp} onChangeText={setOtp} />
        <Button title="Continue" onPress={handleVerify} disabled={otp.length !== 6} style={styles.btn} />
        <TouchableOpacity onPress={handleResend} disabled={resending} style={styles.resendBtn}>
          <Text style={styles.resendText}>{resending ? 'Sending...' : 'Resend Code'}</Text>
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
  btn: { marginTop: spacing.md },
  resendBtn: { alignItems: 'center', marginTop: spacing.lg },
  resendText: { ...typography.body, color: colors.primary },
});
