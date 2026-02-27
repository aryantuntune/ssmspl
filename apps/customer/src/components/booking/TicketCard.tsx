import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextStyle } from 'react-native';
import { format, parseISO } from 'date-fns';
import { BookingListItem } from '../../types';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface TicketCardProps {
  booking: BookingListItem;
  onPress: () => void;
}

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  CONFIRMED: { bg: colors.successLight, text: colors.success },
  PENDING: { bg: colors.warningLight, text: colors.warning },
  CANCELLED: { bg: colors.errorLight, text: colors.error },
  VERIFIED: { bg: colors.infoLight, text: colors.info },
};

function getStatusStyle(status: string) {
  return STATUS_COLORS[status] || { bg: colors.divider, text: colors.textSecondary };
}

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy');
  } catch {
    return dateStr;
  }
}

function formatTime(departure: string | null): string {
  if (!departure) return '--:--';
  // Handle HH:mm:ss or HH:mm format
  const parts = departure.split(':');
  if (parts.length >= 2) {
    const hours = parseInt(parts[0], 10);
    const minutes = parts[1];
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHour = hours % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  }
  return departure;
}

export default function TicketCard({ booking, onPress }: TicketCardProps) {
  const statusStyle = getStatusStyle(booking.status);

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`Booking ${booking.booking_no}, ${booking.route_name}, ${booking.status}`}
    >
      <View style={styles.header}>
        <View style={styles.bookingNoContainer}>
          <Text style={styles.bookingNoLabel}>Booking No.</Text>
          <Text style={styles.bookingNo}>#{booking.booking_no}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
          <Text style={[styles.statusText, { color: statusStyle.text }]}>
            {booking.status}
          </Text>
        </View>
      </View>

      <View style={styles.divider} />

      <View style={styles.routeRow}>
        <Text style={styles.routeIcon}>&#x26F4;</Text>
        <Text style={styles.routeName} numberOfLines={1}>
          {booking.route_name || 'Route unavailable'}
        </Text>
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Date</Text>
          <Text style={styles.detailValue}>{formatDate(booking.travel_date)}</Text>
        </View>
        <View style={styles.detailItem}>
          <Text style={styles.detailLabel}>Time</Text>
          <Text style={styles.detailValue}>{formatTime(booking.departure)}</Text>
        </View>
        <View style={styles.detailItemRight}>
          <Text style={styles.detailLabel}>Amount</Text>
          <Text style={styles.amountValue}>Rs. {booking.net_amount.toFixed(2)}</Text>
        </View>
      </View>

      {booking.items && booking.items.length > 0 && (
        <View style={styles.itemsSummary}>
          <Text style={styles.itemsText} numberOfLines={1}>
            {booking.items.map((i) => `${i.quantity}x ${i.item_name}`).join(', ')}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bookingNoContainer: {
    flexDirection: 'column',
  },
  bookingNoLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  } as TextStyle,
  bookingNo: {
    ...typography.h3,
    color: colors.text,
  } as TextStyle,
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  statusText: {
    ...typography.caption,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as TextStyle,
  divider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.md,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  routeIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  routeName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.primaryDark,
    flex: 1,
  } as TextStyle,
  detailsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  detailItem: {
    flex: 1,
  },
  detailItemRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  detailLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: 2,
  } as TextStyle,
  detailValue: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  } as TextStyle,
  amountValue: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
  } as TextStyle,
  itemsSummary: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  itemsText: {
    ...typography.caption,
    color: colors.textSecondary,
  } as TextStyle,
});
