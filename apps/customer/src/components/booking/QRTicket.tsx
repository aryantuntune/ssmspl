import React from 'react';
import { View, Text, StyleSheet, TextStyle } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface QRTicketProps {
  verificationCode: string;
}

export default function QRTicket({ verificationCode }: QRTicketProps) {
  return (
    <View style={styles.container} accessibilityLabel="QR code for ferry gate verification">
      <View style={styles.qrWrapper}>
        <QRCode
          value={verificationCode}
          size={180}
          color={colors.primaryDark}
          backgroundColor={colors.surface}
        />
      </View>
      <Text style={styles.codeLabel}>Verification Code</Text>
      <Text style={styles.codeValue}>{verificationCode}</Text>
      <Text style={styles.instruction}>Show this QR at the ferry gate</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.divider,
    borderStyle: 'dashed',
  },
  qrWrapper: {
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  codeLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  } as TextStyle,
  codeValue: {
    ...typography.h3,
    color: colors.primaryDark,
    letterSpacing: 2,
    marginBottom: spacing.md,
  } as TextStyle,
  instruction: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    fontStyle: 'italic',
  } as TextStyle,
});
