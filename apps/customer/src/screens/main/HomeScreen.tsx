import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  TextStyle,
  StatusBar,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { CompositeNavigationProp } from '@react-navigation/native';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { format, parseISO } from 'date-fns';
import { RootState, AppDispatch } from '../../store';
import { fetchBookings } from '../../store/slices/bookingSlice';
import { HomeStackParamList, MainTabParamList, BookingListItem } from '../../types';
import { colors, spacing, borderRadius, typography } from '../../theme';
import NetworkBanner from '../../components/common/NetworkBanner';
import Card from '../../components/common/Card';

type HomeNav = CompositeNavigationProp<
  NativeStackNavigationProp<HomeStackParamList, 'HomeMain'>,
  BottomTabNavigationProp<MainTabParamList>
>;

function getInitials(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
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

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  CONFIRMED: { bg: colors.successLight, text: colors.success },
  PENDING: { bg: colors.warningLight, text: colors.warning },
  CANCELLED: { bg: colors.errorLight, text: colors.error },
  VERIFIED: { bg: colors.infoLight, text: colors.info },
};

export default function HomeScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation<HomeNav>();
  const customer = useSelector((s: RootState) => s.auth.customer);
  const { bookings, isLoadingBookings } = useSelector((s: RootState) => s.booking);

  const loadBookings = useCallback(() => {
    dispatch(fetchBookings({ page: 1 }));
  }, [dispatch]);

  useEffect(() => {
    loadBookings();
  }, [loadBookings]);

  const upcomingTrips: BookingListItem[] = bookings
    .filter((b) => b.status !== 'CANCELLED')
    .slice(0, 3);

  const firstName = customer?.first_name || 'Guest';
  const lastName = customer?.last_name || '';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      <NetworkBanner />

      {/* Header */}
      <View style={styles.headerBg}>
        <View style={styles.headerContent}>
          <View style={styles.greetingRow}>
            <View style={styles.greetingText}>
              <Text style={styles.greetingLabel}>Hello,</Text>
              <Text style={styles.greetingName}>{firstName}!</Text>
            </View>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarText}>
                {getInitials(firstName, lastName)}
              </Text>
            </View>
          </View>
          <Text style={styles.greetingSub}>Where would you like to go today?</Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollBody}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={isLoadingBookings}
            onRefresh={loadBookings}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('Booking')}
            accessibilityRole="button"
            accessibilityLabel="Book a ticket"
          >
            <View style={[styles.actionIconBg, { backgroundColor: colors.primaryLight }]}>
              <Text style={styles.actionIcon}>&#x1F6A2;</Text>
            </View>
            <Text style={styles.actionTitle}>Book Ticket</Text>
            <Text style={styles.actionSub}>Reserve your ferry</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionCard}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('BookingsTab')}
            accessibilityRole="button"
            accessibilityLabel="View my bookings"
          >
            <View style={[styles.actionIconBg, { backgroundColor: colors.accent }]}>
              <Text style={styles.actionIcon}>&#x1F3AB;</Text>
            </View>
            <Text style={styles.actionTitle}>My Bookings</Text>
            <Text style={styles.actionSub}>View all trips</Text>
          </TouchableOpacity>
        </View>

        {/* Upcoming Trips */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Upcoming Trips</Text>
          {upcomingTrips.length > 0 && (
            <TouchableOpacity onPress={() => navigation.navigate('BookingsTab')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          )}
        </View>

        {upcomingTrips.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={styles.emptyIcon}>&#x26F5;</Text>
            <Text style={styles.emptyTitle}>No upcoming trips</Text>
            <Text style={styles.emptyText}>
              Book your first ferry ticket and start your journey!
            </Text>
          </Card>
        ) : (
          upcomingTrips.map((booking) => {
            const statusStyle = STATUS_COLORS[booking.status] || {
              bg: colors.divider,
              text: colors.textSecondary,
            };
            return (
              <TouchableOpacity
                key={booking.id}
                style={styles.tripCard}
                activeOpacity={0.7}
                onPress={() => navigation.navigate('BookingsTab')}
                accessibilityLabel={`Trip ${booking.route_name}, ${booking.travel_date}`}
              >
                <View style={styles.tripCardLeft}>
                  <View style={styles.tripRouteRow}>
                    <Text style={styles.tripRoute} numberOfLines={1}>
                      {booking.route_name || 'Route'}
                    </Text>
                  </View>
                  <Text style={styles.tripDate}>
                    {formatDate(booking.travel_date)} at {formatTime(booking.departure)}
                  </Text>
                </View>
                <View style={styles.tripCardRight}>
                  <View style={[styles.tripBadge, { backgroundColor: statusStyle.bg }]}>
                    <Text style={[styles.tripBadgeText, { color: statusStyle.text }]}>
                      {booking.status}
                    </Text>
                  </View>
                  <Text style={styles.tripAmount}>
                    Rs. {booking.net_amount.toFixed(2)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

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
    paddingTop: spacing.xxl + spacing.md,
    paddingBottom: spacing.xl,
    borderBottomLeftRadius: borderRadius.xl,
    borderBottomRightRadius: borderRadius.xl,
  },
  headerContent: {
    paddingHorizontal: spacing.lg,
  },
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingText: {
    flex: 1,
  },
  greetingLabel: {
    ...typography.body,
    color: 'rgba(255,255,255,0.8)',
  } as TextStyle,
  greetingName: {
    ...typography.h1,
    color: colors.textOnPrimary,
    marginTop: 2,
  } as TextStyle,
  greetingSub: {
    ...typography.bodySmall,
    color: 'rgba(255,255,255,0.7)',
    marginTop: spacing.sm,
  } as TextStyle,
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typography.h3,
    color: colors.textOnPrimary,
    fontWeight: '700',
  } as TextStyle,
  scrollBody: {
    flex: 1,
    marginTop: -spacing.md,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  sectionTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.md,
  } as TextStyle,
  seeAll: {
    ...typography.bodySmall,
    color: colors.primary,
    fontWeight: '600',
    marginBottom: spacing.md,
  } as TextStyle,
  actionsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  actionCard: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  actionIconBg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  actionIcon: {
    fontSize: 22,
  },
  actionTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  } as TextStyle,
  actionSub: {
    ...typography.caption,
    color: colors.textSecondary,
  } as TextStyle,
  tripCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.sm,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  tripCardLeft: {
    flex: 1,
    marginRight: spacing.md,
  },
  tripRouteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  tripRoute: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  } as TextStyle,
  tripDate: {
    ...typography.caption,
    color: colors.textSecondary,
  } as TextStyle,
  tripCardRight: {
    alignItems: 'flex-end',
  },
  tripBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
    marginBottom: spacing.xs,
  },
  tripBadgeText: {
    ...typography.caption,
    fontWeight: '700',
    fontSize: 10,
    textTransform: 'uppercase',
  } as TextStyle,
  tripAmount: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.primary,
  } as TextStyle,
  emptyCard: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.text,
    marginBottom: spacing.xs,
  } as TextStyle,
  emptyText: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    textAlign: 'center',
  } as TextStyle,
  bottomSpacer: {
    height: spacing.xl,
  },
});
