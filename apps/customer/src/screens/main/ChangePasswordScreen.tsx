import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  TextStyle,
  StatusBar,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { changePassword } from '../../services/authService';
import { isValidPassword } from '../../utils/validators';
import { ProfileStackParamList } from '../../types';
import { colors, spacing, borderRadius, typography } from '../../theme';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';

type ChangeNav = NativeStackNavigationProp<ProfileStackParamList, 'ChangePassword'>;

export default function ChangePasswordScreen() {
  const navigation = useNavigation<ChangeNav>();

  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{
    oldPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  const validate = (): boolean => {
    const newErrors: typeof errors = {};

    if (!oldPassword) {
      newErrors.oldPassword = 'Current password is required.';
    }

    if (!newPassword) {
      newErrors.newPassword = 'New password is required.';
    } else if (!isValidPassword(newPassword)) {
      newErrors.newPassword =
        'Password must be at least 8 characters with uppercase, lowercase, number, and special character.';
    }

    if (!confirmPassword) {
      newErrors.confirmPassword = 'Please confirm your new password.';
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match.';
    }

    if (oldPassword && newPassword && oldPassword === newPassword) {
      newErrors.newPassword = 'New password must be different from current password.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await changePassword(oldPassword, newPassword);
      Alert.alert('Success', 'Your password has been changed successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const message =
        typeof detail === 'string'
          ? detail
          : 'Failed to change password. Please check your current password and try again.';
      Alert.alert('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const isFormValid = oldPassword.length > 0 && newPassword.length > 0 && confirmPassword.length > 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>&#x2190;</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Change Password</Text>
        <View style={styles.backBtn} />
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Card style={styles.formCard}>
            <View style={styles.lockIconRow}>
              <View style={styles.lockIconCircle}>
                <Text style={styles.lockIcon}>&#x1F512;</Text>
              </View>
            </View>

            <Text style={styles.formTitle}>Update Your Password</Text>
            <Text style={styles.formDesc}>
              Enter your current password and choose a new secure password.
            </Text>

            <Input
              label="Current Password"
              placeholder="Enter current password"
              isPassword
              value={oldPassword}
              onChangeText={(text) => {
                setOldPassword(text);
                if (errors.oldPassword) setErrors((prev) => ({ ...prev, oldPassword: undefined }));
              }}
              error={errors.oldPassword}
              accessibilityLabel="Current password"
            />

            <Input
              label="New Password"
              placeholder="Enter new password"
              isPassword
              value={newPassword}
              onChangeText={(text) => {
                setNewPassword(text);
                if (errors.newPassword) setErrors((prev) => ({ ...prev, newPassword: undefined }));
              }}
              error={errors.newPassword}
              accessibilityLabel="New password"
            />

            <Input
              label="Confirm New Password"
              placeholder="Re-enter new password"
              isPassword
              value={confirmPassword}
              onChangeText={(text) => {
                setConfirmPassword(text);
                if (errors.confirmPassword) setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
              }}
              error={errors.confirmPassword}
              accessibilityLabel="Confirm new password"
            />

            {/* Password Requirements */}
            <View style={styles.requirements}>
              <Text style={styles.requirementsTitle}>Password Requirements:</Text>
              <PasswordRequirement
                met={newPassword.length >= 8}
                text="At least 8 characters"
              />
              <PasswordRequirement
                met={/[A-Z]/.test(newPassword)}
                text="One uppercase letter"
              />
              <PasswordRequirement
                met={/[a-z]/.test(newPassword)}
                text="One lowercase letter"
              />
              <PasswordRequirement
                met={/\d/.test(newPassword)}
                text="One number"
              />
              <PasswordRequirement
                met={/[^A-Za-z0-9]/.test(newPassword)}
                text="One special character"
              />
            </View>

            <Button
              title="Change Password"
              onPress={handleSubmit}
              loading={isSubmitting}
              disabled={!isFormValid || isSubmitting}
              style={styles.submitBtn}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <View style={reqStyles.row}>
      <Text style={[reqStyles.indicator, met && reqStyles.indicatorMet]}>
        {met ? '\u2713' : '\u2022'}
      </Text>
      <Text style={[reqStyles.text, met && reqStyles.textMet]}>{text}</Text>
    </View>
  );
}

const reqStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  indicator: {
    fontSize: 14,
    color: colors.textLight,
    width: 20,
  },
  indicatorMet: {
    color: colors.success,
    fontWeight: '700',
  },
  text: {
    ...typography.caption,
    color: colors.textLight,
  } as TextStyle,
  textMet: {
    color: colors.success,
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    backgroundColor: colors.primary,
    paddingTop: spacing.xxl + spacing.sm,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backText: {
    fontSize: 24,
    color: colors.textOnPrimary,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textOnPrimary,
  } as TextStyle,

  body: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },

  formCard: {
    padding: spacing.lg,
  },
  lockIconRow: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  lockIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.infoLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: {
    fontSize: 28,
  },
  formTitle: {
    ...typography.h3,
    color: colors.text,
    textAlign: 'center',
    marginBottom: spacing.xs,
  } as TextStyle,
  formDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  } as TextStyle,

  requirements: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  requirementsTitle: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  } as TextStyle,

  submitBtn: {
    marginTop: spacing.sm,
  },
});
