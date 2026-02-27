import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../../theme';
import * as authService from '../../services/authService';
import { AuthStackParamList } from '../../types';
import { isValidPassword } from '../../utils/validators';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';

type Nav = NativeStackNavigationProp<AuthStackParamList, 'ResetPassword'>;
type Route = RouteProp<AuthStackParamList, 'ResetPassword'>;

export default function ResetPasswordScreen() {
  const navigation = useNavigation<Nav>();
  const route = useRoute<Route>();
  const { email, otp } = route.params;

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const isValid = isValidPassword(password) && password === confirmPassword;

  const handleReset = async () => {
    setLoading(true);
    try {
      await authService.resetPassword(email, otp, password);
      Alert.alert('Password Reset', 'Your password has been updated. Please sign in.', [
        { text: 'OK', onPress: () => navigation.navigate('Login') },
      ]);
    } catch {
      Alert.alert('Error', 'Failed to reset password. Please try again.');
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>New Password</Text>
      <Text style={styles.subtitle}>Create a new password for your account</Text>

      <Card style={styles.card}>
        <Input label="New Password" placeholder="Min 8 chars, upper, lower, digit, special" isPassword value={password} onChangeText={setPassword} />
        <Input
          label="Confirm Password"
          placeholder="Re-enter password"
          isPassword
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          error={confirmPassword && password !== confirmPassword ? 'Passwords do not match' : undefined}
        />
        <Button title="Reset Password" onPress={handleReset} loading={loading} disabled={!isValid} style={styles.btn} />
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
});
