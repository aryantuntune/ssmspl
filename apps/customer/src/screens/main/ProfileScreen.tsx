import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  TextStyle,
  StatusBar,
  Switch,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootState, AppDispatch } from '../../store';
import { logout } from '../../store/slices/authSlice';
import { setTheme, setLanguage } from '../../store/slices/appSlice';
import { ProfileStackParamList } from '../../types';
import { colors, spacing, borderRadius, typography } from '../../theme';
import NetworkBanner from '../../components/common/NetworkBanner';
import Card from '../../components/common/Card';

type ProfileNav = NativeStackNavigationProp<ProfileStackParamList, 'ProfileMain'>;

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

interface MenuItemProps {
  label: string;
  value?: string;
  onPress?: () => void;
  rightElement?: React.ReactNode;
  showArrow?: boolean;
  danger?: boolean;
}

function MenuItem({ label, value, onPress, rightElement, showArrow = true, danger = false }: MenuItemProps) {
  return (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={onPress}
      disabled={!onPress && !rightElement}
      activeOpacity={onPress ? 0.7 : 1}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View style={styles.menuItemLeft}>
        <Text style={[styles.menuItemLabel, danger && styles.menuItemLabelDanger]}>
          {label}
        </Text>
        {value && <Text style={styles.menuItemValue}>{value}</Text>}
      </View>
      {rightElement || (showArrow && onPress && (
        <Text style={styles.menuArrow}>&#x203A;</Text>
      ))}
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation<ProfileNav>();
  const customer = useSelector((s: RootState) => s.auth.customer);
  const { theme, language } = useSelector((s: RootState) => s.app);

  const firstName = customer?.first_name || 'Guest';
  const lastName = customer?.last_name || '';
  const fullName = customer?.full_name || `${firstName} ${lastName}`;
  const email = customer?.email || '';
  const mobile = customer?.mobile || '';

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => dispatch(logout()),
        },
      ],
    );
  };

  const handleAbout = () => {
    Alert.alert(
      'About Us',
      'Suvarnadurga Shipping & Marine Services Pvt. Ltd.\n\nProviding safe and reliable ferry services connecting coastal communities.\n\nVersion 1.0.0',
      [{ text: 'OK' }],
    );
  };

  const handleTerms = () => {
    Alert.alert(
      'Terms & Conditions',
      'Bookings are subject to weather conditions and ferry availability. Cancellation policy applies as per company guidelines. Passengers must carry valid ID proof while boarding.\n\nFor full terms, visit our website.',
      [{ text: 'OK' }],
    );
  };

  const handlePrivacy = () => {
    Alert.alert(
      'Privacy Policy',
      'We collect minimal personal information required for booking ferry tickets. Your data is stored securely and never shared with third parties without consent.\n\nFor the complete privacy policy, visit our website.',
      [{ text: 'OK' }],
    );
  };

  const toggleTheme = () => {
    dispatch(setTheme(theme === 'light' ? 'dark' : 'light'));
  };

  const toggleLanguage = () => {
    dispatch(setLanguage(language === 'en' ? 'mr' : 'en'));
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      <NetworkBanner />

      {/* Header */}
      <View style={styles.headerBg}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Card */}
        <Card style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            <Text style={styles.avatarLargeText}>
              {getInitials(firstName, lastName)}
            </Text>
          </View>
          <Text style={styles.profileName}>{fullName}</Text>
          {email ? <Text style={styles.profileEmail}>{email}</Text> : null}
          {mobile ? <Text style={styles.profileMobile}>{mobile}</Text> : null}
          {customer?.is_verified && (
            <View style={styles.verifiedBadge}>
              <Text style={styles.verifiedText}>Verified Account</Text>
            </View>
          )}
        </Card>

        {/* Account Settings */}
        <Text style={styles.sectionLabel}>Account</Text>
        <Card style={styles.menuCard}>
          <MenuItem
            label="Edit Profile"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <View style={styles.menuSeparator} />
          <MenuItem
            label="Change Password"
            onPress={() => navigation.navigate('ChangePassword')}
          />
        </Card>

        {/* Preferences */}
        <Text style={styles.sectionLabel}>Preferences</Text>
        <Card style={styles.menuCard}>
          <MenuItem
            label="Language"
            value={language === 'en' ? 'English' : 'Marathi'}
            showArrow={false}
            rightElement={
              <View style={styles.toggleRow}>
                <Text style={[styles.toggleLabel, language === 'en' && styles.toggleLabelActive]}>EN</Text>
                <Switch
                  value={language === 'mr'}
                  onValueChange={toggleLanguage}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={language === 'mr' ? colors.primary : colors.textLight}
                />
                <Text style={[styles.toggleLabel, language === 'mr' && styles.toggleLabelActive]}>MR</Text>
              </View>
            }
          />
          <View style={styles.menuSeparator} />
          <MenuItem
            label="Theme"
            value={theme === 'light' ? 'Light' : 'Dark'}
            showArrow={false}
            rightElement={
              <View style={styles.toggleRow}>
                <Text style={[styles.toggleLabel, theme === 'light' && styles.toggleLabelActive]}>
                  Light
                </Text>
                <Switch
                  value={theme === 'dark'}
                  onValueChange={toggleTheme}
                  trackColor={{ false: colors.border, true: colors.primaryLight }}
                  thumbColor={theme === 'dark' ? colors.primary : colors.textLight}
                />
                <Text style={[styles.toggleLabel, theme === 'dark' && styles.toggleLabelActive]}>
                  Dark
                </Text>
              </View>
            }
          />
        </Card>

        {/* Information */}
        <Text style={styles.sectionLabel}>Information</Text>
        <Card style={styles.menuCard}>
          <MenuItem label="About Us" onPress={handleAbout} />
          <View style={styles.menuSeparator} />
          <MenuItem label="Terms & Conditions" onPress={handleTerms} />
          <View style={styles.menuSeparator} />
          <MenuItem label="Privacy Policy" onPress={handlePrivacy} />
        </Card>

        {/* Logout */}
        <Card style={styles.menuCard}>
          <MenuItem
            label="Logout"
            onPress={handleLogout}
            danger
            showArrow={false}
          />
        </Card>

        <Text style={styles.versionText}>Version 1.0.0</Text>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerBg: {
    backgroundColor: colors.primary,
    paddingTop: spacing.xxl + spacing.sm,
    paddingBottom: spacing.md,
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textOnPrimary,
  } as TextStyle,

  scrollContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },

  // Profile Card
  profileCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    marginBottom: spacing.lg,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  avatarLargeText: {
    ...typography.h1,
    color: colors.textOnPrimary,
    fontWeight: '700',
  } as TextStyle,
  profileName: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.xs,
  } as TextStyle,
  profileEmail: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: 2,
  } as TextStyle,
  profileMobile: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  } as TextStyle,
  verifiedBadge: {
    marginTop: spacing.sm,
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  verifiedText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.success,
  } as TextStyle,

  // Section
  sectionLabel: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
    marginTop: spacing.sm,
  } as TextStyle,

  // Menu
  menuCard: {
    paddingVertical: spacing.xs,
    paddingHorizontal: 0,
    marginBottom: spacing.md,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  menuItemLeft: {
    flex: 1,
  },
  menuItemLabel: {
    ...typography.body,
    color: colors.text,
  } as TextStyle,
  menuItemLabelDanger: {
    color: colors.error,
    fontWeight: '600',
  } as TextStyle,
  menuItemValue: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  } as TextStyle,
  menuArrow: {
    fontSize: 24,
    color: colors.textLight,
    fontWeight: '300',
  } as TextStyle,
  menuSeparator: {
    height: 1,
    backgroundColor: colors.divider,
    marginHorizontal: spacing.md,
  },

  // Toggle
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  toggleLabel: {
    ...typography.caption,
    color: colors.textLight,
    fontWeight: '600',
  } as TextStyle,
  toggleLabelActive: {
    color: colors.primary,
  } as TextStyle,

  versionText: {
    ...typography.caption,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.md,
  } as TextStyle,

  bottomSpacer: {
    height: spacing.xl,
  },
});
