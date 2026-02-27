import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, TextStyle } from 'react-native';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useDispatch, useSelector } from 'react-redux';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../theme';
import { RootState, AppDispatch } from '../store';
import { scanQR, checkIn, clearResult } from '../store/slices/verificationSlice';
import { RootStackParamList } from '../types';
import Loading from '../components/common/Loading';
import TicketDetailsModal from '../components/ticket/TicketDetailsModal';
import NetworkBanner from '../components/common/NetworkBanner';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'QRScanner'>;
};

const SCAN_SIZE = 250;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function QRScannerScreen({ navigation }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { lastResult, lastCheckIn, isScanning, isCheckingIn, error } = useSelector(
    (s: RootState) => s.verification,
  );

  const [permission, requestPermission] = useCameraPermissions();
  const [flashOn, setFlashOn] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const lastScannedRef = useRef<string>('');
  const lastScannedTimeRef = useRef<number>(0);

  useEffect(() => {
    dispatch(clearResult());
  }, [dispatch]);

  const handleBarCodeScanned = async (result: BarcodeScanningResult) => {
    const { data } = result;
    const now = Date.now();

    if (data === lastScannedRef.current && now - lastScannedTimeRef.current < 3000) {
      return;
    }

    lastScannedRef.current = data;
    lastScannedTimeRef.current = now;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const action = await dispatch(scanQR(data));
    if (scanQR.fulfilled.match(action)) {
      setShowModal(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const handleVerify = async () => {
    if (!lastResult?.verification_code) return;
    const action = await dispatch(checkIn(lastResult.verification_code));
    if (checkIn.fulfilled.match(action)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
  };

  const handleScanNext = () => {
    setShowModal(false);
    dispatch(clearResult());
    lastScannedRef.current = '';
  };

  const handleClose = () => {
    dispatch(clearResult());
    navigation.goBack();
  };

  if (!permission) return <Loading message="Checking camera permission..." />;

  if (!permission.granted) {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionTitle}>Camera Access Required</Text>
        <Text style={styles.permissionText}>
          This app needs camera access to scan QR codes on ferry tickets.
        </Text>
        <TouchableOpacity style={styles.grantBtn} onPress={requestPermission}>
          <Text style={styles.grantBtnText}>Grant Permission</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleClose} style={styles.backBtn}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const sideWidth = (SCREEN_WIDTH - SCAN_SIZE) / 2;

  return (
    <View style={styles.container}>
      <NetworkBanner />
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        enableTorch={flashOn}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={showModal || isScanning ? undefined : handleBarCodeScanned}
      />

      {/* Dark overlay with cutout */}
      <View style={styles.overlay}>
        <View style={styles.overlayTop} />
        <View style={styles.overlayMiddle}>
          <View style={[styles.overlaySide, { width: sideWidth }]} />
          <View style={styles.scanFrame}>
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <View style={[styles.overlaySide, { width: sideWidth }]} />
        </View>
        <View style={styles.overlayBottom}>
          <Text style={styles.instruction}>Position the QR code within the frame</Text>
        </View>
      </View>

      <Text style={styles.hintText}>Align QR code within the frame</Text>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity onPress={handleClose} style={styles.controlBtn} accessibilityLabel="Close scanner" accessibilityRole="button">
          <Text style={styles.controlIcon}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFlashOn(!flashOn)} style={styles.controlBtn} accessibilityLabel={flashOn ? 'Turn flash off' : 'Turn flash on'} accessibilityRole="button">
          <Text style={styles.controlIcon}>{flashOn ? 'Flash ON' : 'Flash OFF'}</Text>
        </TouchableOpacity>
      </View>

      {/* Scanning overlay */}
      {isScanning && (
        <View style={styles.scanningOverlay}>
          <Loading message="Verifying ticket..." />
        </View>
      )}

      {/* Error display */}
      {error && !showModal && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => dispatch(clearResult())}>
            <Text style={styles.errorDismiss}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Ticket Details Modal */}
      <TicketDetailsModal
        visible={showModal}
        result={lastResult}
        checkInResult={lastCheckIn}
        isCheckingIn={isCheckingIn}
        error={error}
        onVerify={handleVerify}
        onScanNext={handleScanNext}
        onClose={handleScanNext}
      />
    </View>
  );
}

const overlayColor = 'rgba(0,0,0,0.6)';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: overlayColor },
  overlayMiddle: { flexDirection: 'row', height: SCAN_SIZE },
  overlaySide: { backgroundColor: overlayColor },
  overlayBottom: { flex: 1, backgroundColor: overlayColor, alignItems: 'center', paddingTop: spacing.lg },
  scanFrame: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
  },
  corner: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderColor: colors.textOnPrimary,
  },
  cornerTL: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3 },
  instruction: { ...typography.body, color: 'rgba(255,255,255,0.8)' },
  hintText: { color: 'rgba(255,255,255,0.8)', textAlign: 'center', marginTop: spacing.md, ...typography.bodySmall },
  controls: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
  },
  controlBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  controlIcon: { fontSize: 20, color: colors.textOnPrimary },
  scanningOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorBanner: {
    position: 'absolute',
    bottom: 100,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.errorLight,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: { ...typography.bodySmall, color: colors.error, flex: 1 },
  errorDismiss: { ...typography.bodySmall, fontWeight: '700' as TextStyle['fontWeight'], color: colors.error, marginLeft: spacing.sm },
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  permissionTitle: { ...typography.h2, color: colors.text, marginBottom: spacing.md },
  permissionText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.xl },
  grantBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: borderRadius.md,
  },
  grantBtnText: { ...typography.button, color: colors.textOnPrimary },
  backBtn: { marginTop: spacing.md },
  backBtnText: { ...typography.body, color: colors.primary },
});
