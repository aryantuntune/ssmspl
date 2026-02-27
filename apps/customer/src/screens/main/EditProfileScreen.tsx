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
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootState, AppDispatch } from '../../store';
import { updateProfile } from '../../store/slices/authSlice';
import { ProfileStackParamList } from '../../types';
import { isValidPhone } from '../../utils/validators';
import { colors, spacing, borderRadius, typography } from '../../theme';
import Input from '../../components/common/Input';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';

type EditNav = NativeStackNavigationProp<ProfileStackParamList, 'EditProfile'>;

export default function EditProfileScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation<EditNav>();
  const customer = useSelector((s: RootState) => s.auth.customer);

  const [firstName, setFirstName] = useState(customer?.first_name || '');
  const [lastName, setLastName] = useState(customer?.last_name || '');
  const [mobile, setMobile] = useState(customer?.mobile || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<{ firstName?: string; lastName?: string; mobile?: string }>({});

  const validate = (): boolean => {
    const newErrors: typeof errors = {};
    if (!firstName.trim()) {
      newErrors.firstName = 'First name is required.';
    }
    if (!lastName.trim()) {
      newErrors.lastName = 'Last name is required.';
    }
    if (mobile.trim() && !isValidPhone(mobile.trim())) {
      newErrors.mobile = 'Please enter a valid phone number.';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setIsSubmitting(true);
    try {
      await dispatch(
        updateProfile({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          mobile: mobile.trim() || undefined,
        }),
      ).unwrap();

      Alert.alert('Success', 'Profile updated successfully.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err: any) {
      const message = typeof err === 'string' ? err : 'Failed to update profile.';
      Alert.alert('Error', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasChanges =
    firstName.trim() !== (customer?.first_name || '') ||
    lastName.trim() !== (customer?.last_name || '') ||
    mobile.trim() !== (customer?.mobile || '');

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>&#x2190;</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
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
            <View style={styles.avatarRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {`${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?'}
                </Text>
              </View>
            </View>

            <Input
              label="First Name"
              placeholder="Enter your first name"
              value={firstName}
              onChangeText={(text) => {
                setFirstName(text);
                if (errors.firstName) setErrors((prev) => ({ ...prev, firstName: undefined }));
              }}
              error={errors.firstName}
              autoCapitalize="words"
              accessibilityLabel="First name"
            />

            <Input
              label="Last Name"
              placeholder="Enter your last name"
              value={lastName}
              onChangeText={(text) => {
                setLastName(text);
                if (errors.lastName) setErrors((prev) => ({ ...prev, lastName: undefined }));
              }}
              error={errors.lastName}
              autoCapitalize="words"
              accessibilityLabel="Last name"
            />

            <Input
              label="Mobile Number"
              placeholder="Enter your mobile number"
              value={mobile}
              onChangeText={(text) => {
                setMobile(text);
                if (errors.mobile) setErrors((prev) => ({ ...prev, mobile: undefined }));
              }}
              error={errors.mobile}
              keyboardType="phone-pad"
              accessibilityLabel="Mobile number"
            />

            <View style={styles.emailInfo}>
              <Text style={styles.emailInfoLabel}>Email</Text>
              <Text style={styles.emailInfoValue}>{customer?.email || 'Not set'}</Text>
              <Text style={styles.emailInfoHint}>Email cannot be changed</Text>
            </View>

            <Button
              title="Save Changes"
              onPress={handleSave}
              loading={isSubmitting}
              disabled={!hasChanges || isSubmitting}
              style={styles.saveBtn}
            />
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

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
  avatarRow: {
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  avatarText: {
    ...typography.h2,
    color: colors.textOnPrimary,
    fontWeight: '700',
  } as TextStyle,

  emailInfo: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  emailInfoLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  } as TextStyle,
  emailInfoValue: {
    ...typography.body,
    color: colors.textSecondary,
  } as TextStyle,
  emailInfoHint: {
    ...typography.caption,
    color: colors.textLight,
    marginTop: spacing.xs,
    fontStyle: 'italic',
  } as TextStyle,

  saveBtn: {
    marginTop: spacing.sm,
  },
});
