import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: ViewStyle;
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const buttonStyles: ViewStyle[] = [styles.base];
  const textStyles: TextStyle[] = [styles.text];

  if (variant === 'primary') {
    buttonStyles.push(styles.primary);
    textStyles.push(styles.textPrimary);
  } else if (variant === 'secondary') {
    buttonStyles.push(styles.secondary);
    textStyles.push(styles.textSecondary);
  } else if (variant === 'outline') {
    buttonStyles.push(styles.outline);
    textStyles.push(styles.textOutline);
  } else if (variant === 'danger') {
    buttonStyles.push(styles.danger);
    textStyles.push(styles.textPrimary);
  }

  if (isDisabled) buttonStyles.push(styles.disabled);
  if (style) buttonStyles.push(style);

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? colors.primary : colors.textOnPrimary} />
      ) : (
        <Text style={textStyles}>
          {icon ? `${icon}  ${title}` : title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primaryLight },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  danger: { backgroundColor: colors.error },
  disabled: { opacity: 0.5 },
  text: { ...typography.button },
  textPrimary: { color: colors.textOnPrimary },
  textSecondary: { color: colors.textOnPrimary },
  textOutline: { color: colors.primary },
});
