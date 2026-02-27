import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
  TextStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { useDispatch, useSelector } from 'react-redux';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../theme';
import { RootState, AppDispatch } from '../store';
import { logout } from '../store/slices/authSlice';
import { loadTodayCount, lookupManual, clearResult, checkIn, loadHistory } from '../store/slices/verificationSlice';
import { RootStackParamList, VerificationRecord } from '../types';
import Button from '../components/common/Button';
import StatCard from '../components/common/StatCard';
import OfflineQueueBadge from '../components/common/OfflineQueueBadge';
import { flushOfflineQueue } from '../utils/offlineQueue';
import { syncPendingCount } from '../store/slices/uiSlice';
import Card from '../components/common/Card';
import TicketDetailsModal from '../components/ticket/TicketDetailsModal';
import NetworkBanner from '../components/common/NetworkBanner';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export default function HomeScreen({ navigation }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { checker } = useSelector((s: RootState) => s.auth);
  const isOnline = useSelector((s: RootState) => s.ui.isOnline);
  const {
    verifiedToday,
    lastResult,
    lastCheckIn,
    isCheckingIn,
    isScanning,
    recentVerifications,
    error,
  } = useSelector((s: RootState) => s.verification);

  const [refreshing, setRefreshing] = useState(false);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [manualType, setManualType] = useState<'booking' | 'ticket'>('booking');
  const [manualNumber, setManualNumber] = useState('');
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    dispatch(loadTodayCount());
    dispatch(syncPendingCount());
    dispatch(loadHistory());
  }, [dispatch]);

  useEffect(() => {
    if (lastCheckIn) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [lastCheckIn]);

  useEffect(() => {
    if (error && showDetails) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [error, showDetails]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await dispatch(loadTodayCount());
    setRefreshing(false);
  }, [dispatch]);

  const handleRetryQueue = useCallback(async () => {
    await flushOfflineQueue();
    dispatch(syncPendingCount());
    dispatch(loadTodayCount());
  }, [dispatch]);

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => dispatch(logout()),
      },
    ]);
  };

  const handleManualLookup = () => {
    const num = parseInt(manualNumber, 10);
    if (!num || num <= 0) {
      Alert.alert('Invalid', 'Please enter a valid number.');
      return;
    }
    setManualModalVisible(false);
    dispatch(lookupManual({ type: manualType, number: num, branchId: undefined }));
    setShowDetails(true);
  };

  const handleVerify = () => {
    if (lastResult?.verification_code) {
      dispatch(checkIn(lastResult.verification_code));
    }
  };

  const handleScanNext = () => {
    setShowDetails(false);
    dispatch(clearResult());
  };

  const today = new Date().toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Image source={require('../../assets/logo-white.png')} style={styles.headerLogo} resizeMode="contain" />
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>SSMSPL Checker</Text>
            {checker && (
              <Text style={styles.headerSub}>
                {checker.full_name} • {checker.route_name || 'No route'}
              </Text>
            )}
          </View>
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.avatar}>
          <Text style={styles.avatarText}>
            {checker?.full_name?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </TouchableOpacity>
      </View>

      <NetworkBanner />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Date */}
        <Text style={styles.date}>{today}</Text>

        {/* Stat */}
        <StatCard label="Verified Today" value={verifiedToday} badge="Live" />

        <OfflineQueueBadge onRetry={handleRetryQueue} />

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title="Scan QR Code"
            icon="📷"
            onPress={() => navigation.navigate('QRScanner')}
            disabled={!isOnline}
          />
          <Button
            title="Manual Entry"
            icon="⌨️"
            variant="outline"
            onPress={() => {
              setManualNumber('');
              setManualModalVisible(true);
            }}
            disabled={!isOnline}
          />
        </View>

        {/* Recent */}
        <Text style={styles.sectionTitle}>Recent Verifications</Text>
        {recentVerifications.length === 0 ? (
          <Card>
            <Text style={styles.emptyText}>No verifications yet today. Start scanning!</Text>
          </Card>
        ) : (
          recentVerifications.slice(0, 5).map((rec, i) => (
            <RecentItem key={i} record={rec} />
          ))
        )}
      </ScrollView>

      {/* Manual Entry Modal */}
      <Modal visible={manualModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <Card style={styles.manualCard}>
            <Text style={styles.manualTitle}>Manual Lookup</Text>

            <View style={styles.tabRow}>
              <TouchableOpacity
                style={[styles.tab, manualType === 'booking' && styles.tabActive]}
                onPress={() => setManualType('booking')}
              >
                <Text style={[styles.tabText, manualType === 'booking' && styles.tabTextActive]}>
                  Booking
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tab, manualType === 'ticket' && styles.tabActive]}
                onPress={() => setManualType('ticket')}
              >
                <Text style={[styles.tabText, manualType === 'ticket' && styles.tabTextActive]}>
                  Ticket
                </Text>
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.manualInput}
              placeholder={`Enter ${manualType} number`}
              keyboardType="numeric"
              value={manualNumber}
              onChangeText={setManualNumber}
              placeholderTextColor={colors.textLight}
            />

            <View style={styles.manualActions}>
              <Button
                title="Cancel"
                variant="outline"
                onPress={() => setManualModalVisible(false)}
                style={{ flex: 1 }}
              />
              <Button
                title="Lookup"
                onPress={handleManualLookup}
                loading={isScanning}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        </View>
      </Modal>

      {/* Ticket Details Modal */}
      <TicketDetailsModal
        visible={showDetails && !!lastResult}
        result={lastResult}
        checkInResult={lastCheckIn}
        isCheckingIn={isCheckingIn}
        error={error}
        onVerify={handleVerify}
        onScanNext={handleScanNext}
        onClose={handleScanNext}
      />
    </SafeAreaView>
  );
}

function RecentItem({ record }: { record: VerificationRecord }) {
  const dotColor =
    record.outcome === 'success'
      ? colors.success
      : record.outcome === 'already_verified'
      ? colors.info
      : colors.error;

  const ref = record.result;
  const time = new Date(record.timestamp).toLocaleTimeString('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Card style={styles.recentCard}>
      <View style={styles.recentRow}>
        <View style={[styles.dot, { backgroundColor: dotColor }]} />
        <View style={styles.recentInfo}>
          <Text style={styles.recentRef}>
            {ref ? `#${ref.reference_no}` : 'Error'}{' '}
            {ref?.route_name && `• ${ref.route_name}`}
          </Text>
          <Text style={styles.recentMeta}>
            {ref ? `Rs. ${ref.net_amount.toFixed(2)}` : record.error || 'Failed'} • {time}
          </Text>
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.primaryDark,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  headerLogo: { width: 36, height: 30 },
  headerTitle: { ...typography.h3, color: colors.textOnPrimary },
  headerSub: { ...typography.caption, color: 'rgba(255,255,255,0.8)', marginTop: 2 },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...typography.body, fontWeight: '700' as TextStyle['fontWeight'], color: colors.textOnPrimary },
  content: { padding: spacing.lg, gap: spacing.md },
  date: { ...typography.bodySmall, color: colors.textSecondary },
  actions: { gap: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.text, marginTop: spacing.sm },
  emptyText: { ...typography.bodySmall, color: colors.textLight, textAlign: 'center' },
  recentCard: { marginBottom: spacing.xs },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  recentInfo: { flex: 1 },
  recentRef: { ...typography.bodySmall, fontWeight: '600' as TextStyle['fontWeight'], color: colors.text },
  recentMeta: { ...typography.caption, color: colors.textSecondary },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  manualCard: { padding: spacing.lg },
  manualTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.md },
  tabRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  tab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: colors.primary },
  tabText: { ...typography.bodySmall, fontWeight: '600' as TextStyle['fontWeight'], color: colors.textSecondary },
  tabTextActive: { color: colors.textOnPrimary },
  manualInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md - 4,
    paddingHorizontal: spacing.md,
    ...typography.body,
    color: colors.text,
    marginBottom: spacing.md,
  },
  manualActions: { flexDirection: 'row', gap: spacing.sm },
});
