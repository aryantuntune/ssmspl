import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  TextStyle,
  StatusBar,
  Share,
  RefreshControl,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format, parseISO } from 'date-fns';
import { RootState, AppDispatch } from '../../store';
import { fetchBookingDetail, cancelBookingThunk } from '../../store/slices/bookingSlice';
import { BookingsStackParamList } from '../../types';
import { colors, spacing, borderRadius, typography } from '../../theme';
import Loading from '../../components/common/Loading';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import QRTicket from '../../components/booking/QRTicket';

type DetailNav = NativeStackNavigationProp<BookingsStackParamList, 'BookingDetail'>;
type DetailRoute = RouteProp<BookingsStackParamList, 'BookingDetail'>;

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  CONFIRMED: { bg: colors.successLight, text: colors.success },
  PENDING: { bg: colors.warningLight, text: colors.warning },
  CANCELLED: { bg: colors.errorLight, text: colors.error },
  VERIFIED: { bg: colors.infoLight, text: colors.info },
};

function formatDate(dateStr: string): string {
  try {
    return format(parseISO(dateStr), 'EEEE, dd MMM yyyy');
  } catch {
    return dateStr;
  }
}

function formatTime(departure: string | null): string {
  if (!departure) return '--:--';
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

export default function BookingDetailScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation<DetailNav>();
  const route = useRoute<DetailRoute>();
  const { bookingId } = route.params;

  const { currentBooking, isLoadingBookings } = useSelector((s: RootState) => s.booking);

  const loadDetail = useCallback(() => {
    dispatch(fetchBookingDetail(bookingId));
  }, [dispatch, bookingId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleCancel = () => {
    Alert.alert(
      'Cancel Booking',
      'Are you sure you want to cancel this booking? This action cannot be undone.',
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes, Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await dispatch(cancelBookingThunk(bookingId)).unwrap();
              Alert.alert('Cancelled', 'Your booking has been cancelled.');
            } catch (err: any) {
              const message = typeof err === 'string' ? err : 'Failed to cancel booking.';
              Alert.alert('Error', message);
            }
          },
        },
      ],
    );
  };

  const handleShare = async () => {
    if (!currentBooking) return;
    try {
      await Share.share({
        message: `SSMSPL Ferry Booking #${currentBooking.booking_no}\nRoute: ${currentBooking.route_name}\nDate: ${formatDate(currentBooking.travel_date)}\nTime: ${formatTime(currentBooking.departure)}\nAmount: Rs. ${currentBooking.net_amount.toFixed(2)}\nStatus: ${currentBooking.status}`,
      });
    } catch {
      // User cancelled share
    }
  };

  if (isLoadingBookings && !currentBooking) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>&#x2190;</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Booking Details</Text>
          <View style={styles.backBtn} />
        </View>
        <Loading message="Loading booking details..." />
      </View>
    );
  }

  if (!currentBooking) {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>&#x2190;</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Booking Details</Text>
          <View style={styles.backBtn} />
        </View>
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Booking not found.</Text>
          <Button title="Go Back" onPress={() => navigation.goBack()} variant="outline" />
        </View>
      </View>
    );
  }

  const booking = currentBooking;
  const statusStyle = STATUS_COLORS[booking.status] || {
    bg: colors.divider,
    text: colors.textSecondary,
  };
  const canCancel = booking.status === 'CONFIRMED' || booking.status === 'PENDING';
  const routeParts = booking.route_name ? booking.route_name.split(' - ') : [];
  const fromName = routeParts[0] || booking.branch_name || 'Departure';
  const toName = routeParts[1] || 'Destination';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>&#x2190;</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Booking Details</Text>
        <TouchableOpacity onPress={handleShare} style={styles.backBtn}>
          <Text style={styles.shareIcon}>&#x21EA;</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingBookings}
            onRefresh={loadDetail}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        {/* Ticket Header Card */}
        <Card style={styles.ticketCard}>
          <View style={styles.ticketHeader}>
            <View>
              <Text style={styles.bookingLabel}>Booking No.</Text>
              <Text style={styles.bookingNo}>#{booking.booking_no}</Text>
            </View>
            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.text }]}>
                {booking.status}
              </Text>
            </View>
          </View>

          <View style={styles.ticketDivider}>
            <View style={styles.ticketDividerCircleLeft} />
            <View style={styles.ticketDividerLine} />
            <View style={styles.ticketDividerCircleRight} />
          </View>

          {/* Route Display */}
          <View style={styles.routeDisplay}>
            <View style={styles.routeEnd}>
              <View style={styles.routeDot} />
              <Text style={styles.routeEndLabel}>FROM</Text>
              <Text style={styles.routeEndName}>{fromName}</Text>
            </View>

            <View style={styles.routeArrowContainer}>
              <View style={styles.routeLineDashed} />
              <Text style={styles.routeArrow}>&#x26F4;</Text>
              <View style={styles.routeLineDashed} />
            </View>

            <View style={[styles.routeEnd, styles.routeEndRight]}>
              <View style={[styles.routeDot, styles.routeDotTo]} />
              <Text style={styles.routeEndLabel}>TO</Text>
              <Text style={styles.routeEndName}>{toName}</Text>
            </View>
          </View>

          {/* Date & Time */}
          <View style={styles.dateTimeRow}>
            <View style={styles.dateTimeItem}>
              <Text style={styles.dateTimeLabel}>Travel Date</Text>
              <Text style={styles.dateTimeValue}>{formatDate(booking.travel_date)}</Text>
            </View>
            <View style={styles.dateTimeSep} />
            <View style={styles.dateTimeItem}>
              <Text style={styles.dateTimeLabel}>Departure</Text>
              <Text style={styles.dateTimeValue}>{formatTime(booking.departure)}</Text>
            </View>
          </View>
        </Card>

        {/* Items Table */}
        {booking.items && booking.items.length > 0 && (
          <Card style={styles.itemsCard}>
            <Text style={styles.sectionTitle}>Booking Items</Text>

            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, styles.tableItemCol]}>Item</Text>
              <Text style={[styles.tableHeaderCell, styles.tableQtyCol]}>Qty</Text>
              <Text style={[styles.tableHeaderCell, styles.tableAmtCol]}>Amount</Text>
            </View>

            {booking.items
              .filter((item) => !item.is_cancelled)
              .map((item) => (
                <View key={item.id} style={styles.tableRow}>
                  <View style={styles.tableItemCol}>
                    <Text style={styles.tableItemName}>{item.item_name || 'Item'}</Text>
                    {item.vehicle_no && (
                      <Text style={styles.tableItemVehicle}>{item.vehicle_no}</Text>
                    )}
                  </View>
                  <Text style={[styles.tableCell, styles.tableQtyCol]}>{item.quantity}</Text>
                  <Text style={[styles.tableCell, styles.tableAmtCol]}>
                    Rs. {item.amount.toFixed(2)}
                  </Text>
                </View>
              ))}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total Amount</Text>
              <Text style={styles.totalValue}>Rs. {booking.net_amount.toFixed(2)}</Text>
            </View>

            {booking.discount > 0 && (
              <View style={styles.discountRow}>
                <Text style={styles.discountLabel}>Discount</Text>
                <Text style={styles.discountValue}>- Rs. {booking.discount.toFixed(2)}</Text>
              </View>
            )}
          </Card>
        )}

        {/* QR Code */}
        {booking.verification_code && booking.status !== 'CANCELLED' && (
          <View style={styles.qrSection}>
            <QRTicket verificationCode={booking.verification_code} />
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionsSection}>
          {canCancel && (
            <Button
              title="Cancel Booking"
              onPress={handleCancel}
              variant="danger"
              style={styles.cancelBtn}
              accessibilityHint="Cancels this booking permanently"
            />
          )}
          <Button
            title="Share Booking"
            onPress={handleShare}
            variant="outline"
            style={styles.shareBtn}
          />
        </View>

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
  shareIcon: {
    fontSize: 20,
    color: colors.textOnPrimary,
  },

  scrollContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
  },

  // Error
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
  } as TextStyle,

  // Ticket Card
  ticketCard: {
    paddingVertical: spacing.lg,
    marginBottom: spacing.md,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  bookingLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  } as TextStyle,
  bookingNo: {
    ...typography.h2,
    color: colors.text,
  } as TextStyle,
  statusBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
  },
  statusText: {
    ...typography.bodySmall,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as TextStyle,

  // Ticket Divider (torn edge effect)
  ticketDivider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: spacing.lg,
    marginHorizontal: -spacing.md,
  },
  ticketDividerCircleLeft: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.background,
    marginLeft: -10,
  },
  ticketDividerLine: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.border,
  },
  ticketDividerCircleRight: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.background,
    marginRight: -10,
  },

  // Route Display
  routeDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.lg,
  },
  routeEnd: {
    flex: 1,
    alignItems: 'flex-start',
  },
  routeEndRight: {
    alignItems: 'flex-end',
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
    marginBottom: spacing.xs,
  },
  routeDotTo: {
    backgroundColor: colors.success,
  },
  routeEndLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: 2,
  } as TextStyle,
  routeEndName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  } as TextStyle,
  routeArrowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    flex: 0.6,
  },
  routeLineDashed: {
    flex: 1,
    height: 1,
    borderStyle: 'dashed',
    borderWidth: 1,
    borderColor: colors.primaryLight,
  },
  routeArrow: {
    fontSize: 20,
    marginHorizontal: spacing.xs,
  },

  // Date & Time
  dateTimeRow: {
    flexDirection: 'row',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.sm,
  },
  dateTimeItem: {
    flex: 1,
    alignItems: 'center',
  },
  dateTimeLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  } as TextStyle,
  dateTimeValue: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.text,
  } as TextStyle,
  dateTimeSep: {
    width: 1,
    backgroundColor: colors.border,
    marginVertical: -spacing.xs,
  },

  // Items Card
  itemsCard: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  } as TextStyle,
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
    marginBottom: spacing.sm,
  },
  tableHeaderCell: {
    ...typography.caption,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  } as TextStyle,
  tableItemCol: {
    flex: 2,
  },
  tableQtyCol: {
    flex: 0.5,
    textAlign: 'center',
  },
  tableAmtCol: {
    flex: 1,
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  tableItemName: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  } as TextStyle,
  tableItemVehicle: {
    ...typography.caption,
    color: colors.primaryLight,
    marginTop: 2,
  } as TextStyle,
  tableCell: {
    ...typography.bodySmall,
    color: colors.text,
  } as TextStyle,
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.md,
    marginTop: spacing.xs,
  },
  totalLabel: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  } as TextStyle,
  totalValue: {
    ...typography.h3,
    color: colors.primary,
  } as TextStyle,
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  discountLabel: {
    ...typography.bodySmall,
    color: colors.success,
  } as TextStyle,
  discountValue: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.success,
  } as TextStyle,

  // QR Section
  qrSection: {
    marginBottom: spacing.md,
  },

  // Actions
  actionsSection: {
    gap: spacing.md,
  },
  cancelBtn: {},
  shareBtn: {},

  bottomSpacer: {
    height: spacing.xl,
  },
});
