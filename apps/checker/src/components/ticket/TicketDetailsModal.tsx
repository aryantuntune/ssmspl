import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { VerificationResult, CheckInResult } from '../../types';
import VerificationBadge from './VerificationBadge';
import Button from '../common/Button';

interface TicketDetailsModalProps {
  visible: boolean;
  result: VerificationResult | null;
  checkInResult: CheckInResult | null;
  isCheckingIn: boolean;
  error: string | null;
  onVerify: () => void;
  onScanNext: () => void;
  onClose: () => void;
}

function DetailRow({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === undefined) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{String(value)}</Text>
    </View>
  );
}

export default function TicketDetailsModal({
  visible,
  result,
  checkInResult,
  isCheckingIn,
  error,
  onVerify,
  onScanNext,
  onClose,
}: TicketDetailsModalProps) {
  if (!result) return null;

  const isVerified = result.status === 'VERIFIED' || !!checkInResult;
  const isCancelled = result.status === 'CANCELLED';
  const isPending = result.status === 'PENDING';
  const canVerify = result.status === 'CONFIRMED' && !checkInResult;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {checkInResult
                ? 'Verification Successful'
                : result.status === 'VERIFIED'
                ? 'Already Verified'
                : 'Ticket Details'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>X</Text>
            </TouchableOpacity>
          </View>

          {/* Badge */}
          <VerificationBadge status={checkInResult ? 'VERIFIED' : result.status} />

          {/* Error */}
          {error && error !== 'ALREADY_VERIFIED' && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Details */}
          <ScrollView style={styles.details} showsVerticalScrollIndicator={false}>
            <DetailRow
              label={result.source === 'booking' ? 'Booking No' : 'Ticket No'}
              value={`#${result.reference_no}`}
            />
            <DetailRow label="Source" value={result.source === 'booking' ? 'Customer Portal' : 'Billing Counter'} />
            <DetailRow label="Route" value={result.route_name} />
            <DetailRow label="Branch" value={result.branch_name} />
            <DetailRow label="Travel Date" value={result.travel_date} />
            <DetailRow label="Departure" value={result.departure} />
            <DetailRow label="Passengers" value={result.passenger_count} />
            <DetailRow label="Amount" value={`Rs. ${result.net_amount.toFixed(2)}`} />

            {result.checked_in_at && (
              <DetailRow
                label="Checked In At"
                value={new Date(result.checked_in_at).toLocaleString()}
              />
            )}
            {checkInResult?.checked_in_at && (
              <DetailRow
                label="Checked In At"
                value={new Date(checkInResult.checked_in_at).toLocaleString()}
              />
            )}

            {/* Items */}
            {result.items.length > 0 && (
              <View style={styles.itemsSection}>
                <Text style={styles.itemsTitle}>Items</Text>
                {result.items.map((item, i) => (
                  <View key={i} style={styles.itemRow}>
                    <Text style={styles.itemName}>
                      {item.item_name} x{item.quantity}
                    </Text>
                    {item.vehicle_no && (
                      <Text style={styles.vehicleNo}>{item.vehicle_no}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            {canVerify && (
              <Button
                title="Verify Passenger"
                onPress={onVerify}
                loading={isCheckingIn}
                icon="✓"
              />
            )}
            {(isVerified || isCancelled || isPending) && (
              <Button title="Scan Next Ticket" onPress={onScanNext} icon="📷" />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.h3, color: colors.text },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { ...typography.body, fontWeight: '700', color: colors.textSecondary },
  errorBox: {
    backgroundColor: colors.errorLight,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
  },
  errorText: { ...typography.bodySmall, color: colors.error },
  details: { marginTop: spacing.md },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: { ...typography.bodySmall, color: colors.textSecondary },
  detailValue: { ...typography.bodySmall, fontWeight: '600', color: colors.text, maxWidth: '60%', textAlign: 'right' },
  itemsSection: { marginTop: spacing.md },
  itemsTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  itemName: { ...typography.bodySmall, color: colors.text },
  vehicleNo: { ...typography.caption, color: colors.textSecondary },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
});
