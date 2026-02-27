import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  TextStyle,
  StatusBar,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootState, AppDispatch } from '../../store';
import { fetchBookings } from '../../store/slices/bookingSlice';
import { BookingsStackParamList, BookingListItem } from '../../types';
import { colors, spacing, borderRadius, typography } from '../../theme';
import NetworkBanner from '../../components/common/NetworkBanner';
import Loading from '../../components/common/Loading';
import TicketCard from '../../components/booking/TicketCard';

type BookingsNav = NativeStackNavigationProp<BookingsStackParamList, 'BookingsList'>;

type FilterTab = 'ALL' | 'UPCOMING' | 'COMPLETED' | 'CANCELLED';

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: 'ALL', label: 'All' },
  { key: 'UPCOMING', label: 'Upcoming' },
  { key: 'COMPLETED', label: 'Completed' },
  { key: 'CANCELLED', label: 'Cancelled' },
];

function filterBookings(bookings: BookingListItem[], filter: FilterTab): BookingListItem[] {
  switch (filter) {
    case 'UPCOMING':
      return bookings.filter(
        (b) => b.status === 'CONFIRMED' || b.status === 'PENDING',
      );
    case 'COMPLETED':
      return bookings.filter((b) => b.status === 'VERIFIED');
    case 'CANCELLED':
      return bookings.filter((b) => b.status === 'CANCELLED');
    default:
      return bookings;
  }
}

export default function BookingsListScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation<BookingsNav>();
  const { bookings, isLoadingBookings, page, totalPages } = useSelector(
    (s: RootState) => s.booking,
  );
  const [activeFilter, setActiveFilter] = useState<FilterTab>('ALL');
  const [refreshing, setRefreshing] = useState(false);

  const loadInitial = useCallback(() => {
    dispatch(fetchBookings({ page: 1 }));
  }, [dispatch]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await dispatch(fetchBookings({ page: 1 }));
    setRefreshing(false);
  }, [dispatch]);

  const handleLoadMore = useCallback(() => {
    if (isLoadingBookings || page >= totalPages) return;
    dispatch(fetchBookings({ page: page + 1 }));
  }, [dispatch, isLoadingBookings, page, totalPages]);

  const filteredBookings = filterBookings(bookings, activeFilter);

  const renderItem = useCallback(
    ({ item }: { item: BookingListItem }) => (
      <TicketCard
        booking={item}
        onPress={() => navigation.navigate('BookingDetail', { bookingId: item.id })}
      />
    ),
    [navigation],
  );

  const keyExtractor = useCallback(
    (item: BookingListItem) => item.id.toString(),
    [],
  );

  const renderEmpty = () => {
    if (isLoadingBookings && !refreshing) {
      return <Loading message="Loading bookings..." />;
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>&#x1F3AB;</Text>
        <Text style={styles.emptyTitle}>No bookings found</Text>
        <Text style={styles.emptyText}>
          {activeFilter === 'ALL'
            ? 'You have not made any bookings yet.'
            : `No ${activeFilter.toLowerCase()} bookings.`}
        </Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (!isLoadingBookings || page <= 1) return null;
    return (
      <View style={styles.footerLoader}>
        <Loading message="Loading more..." />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      <NetworkBanner />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>My Bookings</Text>
      </View>

      {/* Filter Tabs */}
      <View style={styles.filterRow}>
        {FILTER_TABS.map((tab) => {
          const isActive = activeFilter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.filterTab, isActive && styles.filterTabActive]}
              onPress={() => setActiveFilter(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`Filter by ${tab.label}`}
            >
              <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Bookings List */}
      <FlatList
        data={filteredBookings}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        showsVerticalScrollIndicator={false}
      />
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
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textOnPrimary,
  } as TextStyle,

  // Filter Tabs
  filterRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  filterTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.full,
    marginHorizontal: 3,
  },
  filterTabActive: {
    backgroundColor: colors.primary,
  },
  filterText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  } as TextStyle,
  filterTextActive: {
    color: colors.textOnPrimary,
  } as TextStyle,

  // List
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },

  // Empty
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl * 2,
  },
  emptyIcon: {
    fontSize: 48,
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
    paddingHorizontal: spacing.xl,
  } as TextStyle,

  // Footer
  footerLoader: {
    paddingVertical: spacing.lg,
  },
});
