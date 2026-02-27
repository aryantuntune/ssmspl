import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Modal,
  FlatList,
  TouchableOpacity,
  Alert,
  TextStyle,
  KeyboardAvoidingView,
  Platform,
  StatusBar,
  ActivityIndicator,
} from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format, addDays } from 'date-fns';
import { RootState, AppDispatch } from '../../store';
import {
  fetchBranches,
  fetchToBranches,
  fetchSchedules,
  fetchItems,
  setFromBranch,
  setToBranch,
  setTravelDate,
  setDeparture,
  updateItemQty,
  clearBookingForm,
  createBooking,
} from '../../store/slices/bookingSlice';
import { simulatePayment } from '../../services/paymentService';
import { HomeStackParamList, Branch, ScheduleItem, BookableItem } from '../../types';
import { colors, spacing, borderRadius, typography } from '../../theme';
import Button from '../../components/common/Button';
import Card from '../../components/common/Card';
import NetworkBanner from '../../components/common/NetworkBanner';
import Input from '../../components/common/Input';

type BookingNav = NativeStackNavigationProp<HomeStackParamList, 'Booking'>;

function formatTimeDisplay(departure: string): string {
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

// Generate date chips for next 30 days
function generateDateChips(): { date: Date; label: string; dateStr: string }[] {
  const chips: { date: Date; label: string; dateStr: string }[] = [];
  const today = new Date();
  for (let i = 0; i < 30; i++) {
    const d = addDays(today, i);
    chips.push({
      date: d,
      label: i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : format(d, 'dd MMM'),
      dateStr: format(d, 'yyyy-MM-dd'),
    });
  }
  return chips;
}

const DATE_CHIPS = generateDateChips();

export default function BookingScreen() {
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation<BookingNav>();
  const {
    branches,
    toBranches,
    schedules,
    items,
    fromBranch,
    toBranch,
    travelDate,
    departure,
    formItems,
    totalAmount,
    isLoadingForm,
    isCreating,
    error,
  } = useSelector((s: RootState) => s.booking);

  const [step, setStep] = useState(1);
  const [showFromModal, setShowFromModal] = useState(false);
  const [showToModal, setShowToModal] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [vehicleInputs, setVehicleInputs] = useState<Record<number, string>>({});
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);

  useEffect(() => {
    dispatch(fetchBranches());
    return () => {
      dispatch(clearBookingForm());
    };
  }, [dispatch]);

  const handleSelectFrom = useCallback(
    (branch: Branch) => {
      dispatch(setFromBranch(branch));
      dispatch(fetchToBranches(branch.id));
      dispatch(fetchSchedules(branch.id));
      setShowFromModal(false);
    },
    [dispatch],
  );

  const handleSelectTo = useCallback(
    (branch: Branch) => {
      dispatch(setToBranch(branch));
      if (fromBranch) {
        dispatch(fetchItems({ from: fromBranch.id, to: branch.id }));
      }
      setShowToModal(false);
    },
    [dispatch, fromBranch],
  );

  const handleSelectSchedule = useCallback(
    (schedule: ScheduleItem) => {
      dispatch(setDeparture(schedule.departure));
      setShowScheduleModal(false);
    },
    [dispatch],
  );

  const handleSelectDate = useCallback(
    (dateStr: string) => {
      dispatch(setTravelDate(dateStr));
    },
    [dispatch],
  );

  const handleQtyChange = useCallback(
    (itemId: number, quantity: number) => {
      const vNo = vehicleInputs[itemId];
      dispatch(updateItemQty({ itemId, quantity, vehicleNo: vNo || undefined }));
    },
    [dispatch, vehicleInputs],
  );

  const handleVehicleNoChange = useCallback(
    (itemId: number, text: string) => {
      setVehicleInputs((prev) => ({ ...prev, [itemId]: text }));
      const existing = formItems.find((fi) => fi.id === itemId);
      if (existing) {
        dispatch(updateItemQty({ itemId, quantity: existing.quantity, vehicleNo: text }));
      }
    },
    [dispatch, formItems],
  );

  const getItemQty = (itemId: number): number => {
    const item = formItems.find((fi) => fi.id === itemId);
    return item ? item.quantity : 0;
  };

  const canGoNext = (): boolean => {
    if (step === 1) return !!fromBranch && !!toBranch;
    if (step === 2) return !!travelDate && !!departure;
    return false;
  };

  const canPay = (): boolean => {
    return formItems.length > 0 && totalAmount > 0;
  };

  const handlePay = async () => {
    if (!fromBranch || !toBranch || !travelDate || !departure) return;
    if (formItems.length === 0) {
      Alert.alert('No Items', 'Please add at least one passenger or vehicle.');
      return;
    }

    // Validate vehicle numbers for vehicle items
    for (const fi of formItems) {
      if (fi.is_vehicle && !fi.vehicle_no?.trim()) {
        Alert.alert('Vehicle Number Required', `Please enter vehicle number for ${fi.name}.`);
        return;
      }
    }

    setIsProcessingPayment(true);
    try {
      const bookingItems = formItems.map((fi) => ({
        item_id: fi.id,
        quantity: fi.quantity,
        vehicle_no: fi.is_vehicle ? fi.vehicle_no : null,
      }));

      const result = await dispatch(
        createBooking({
          from_branch_id: fromBranch.id,
          to_branch_id: toBranch.id,
          travel_date: travelDate,
          departure,
          items: bookingItems,
        }),
      ).unwrap();

      // Simulate payment since SabPaisa is not configured
      await simulatePayment(result.id);

      setIsProcessingPayment(false);
      Alert.alert(
        'Booking Confirmed!',
        `Your booking #${result.booking_no} has been confirmed. You can view your ticket in My Bookings.`,
        [
          {
            text: 'OK',
            onPress: () => {
              dispatch(clearBookingForm());
              navigation.goBack();
            },
          },
        ],
      );
    } catch (err: any) {
      setIsProcessingPayment(false);
      const message = typeof err === 'string' ? err : err?.message || 'Booking failed. Please try again.';
      Alert.alert('Booking Failed', message);
    }
  };

  const passengers = items.filter((i) => !i.is_vehicle);
  const vehicles = items.filter((i) => i.is_vehicle);

  // --- Modal Renderer ---
  const renderPickerModal = (
    visible: boolean,
    onClose: () => void,
    title: string,
    data: Branch[] | ScheduleItem[],
    renderItem: (item: any) => React.ReactElement,
    keyExtractor: (item: any) => string,
  ) => (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn}>
              <Text style={styles.modalCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
          {data.length === 0 ? (
            <View style={styles.modalEmpty}>
              {isLoadingForm ? (
                <ActivityIndicator size="large" color={colors.primary} />
              ) : (
                <Text style={styles.modalEmptyText}>No options available</Text>
              )}
            </View>
          ) : (
            <FlatList
              data={data}
              keyExtractor={keyExtractor}
              renderItem={({ item }) => renderItem(item)}
              style={styles.modalList}
              ItemSeparatorComponent={() => <View style={styles.modalSeparator} />}
            />
          )}
        </View>
      </View>
    </Modal>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.primaryDark} />
      <NetworkBanner />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          accessibilityLabel="Go back"
        >
          <Text style={styles.backText}>&#x2190;</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book Ticket</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Step Indicator */}
      <View style={styles.stepIndicator}>
        {[1, 2, 3].map((s) => (
          <View key={s} style={styles.stepItem}>
            <View style={[styles.stepCircle, step >= s && styles.stepCircleActive]}>
              <Text style={[styles.stepNum, step >= s && styles.stepNumActive]}>
                {s}
              </Text>
            </View>
            <Text style={[styles.stepLabel, step >= s && styles.stepLabelActive]}>
              {s === 1 ? 'Route' : s === 2 ? 'Schedule' : 'Items'}
            </Text>
            {s < 3 && (
              <View style={[styles.stepLine, step > s && styles.stepLineActive]} />
            )}
          </View>
        ))}
      </View>

      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* STEP 1: Route Selection */}
          {step === 1 && (
            <View>
              <Text style={styles.stepTitle}>Select Route</Text>
              <Text style={styles.stepDesc}>Choose your departure and arrival points</Text>

              <Card style={styles.pickerCard}>
                <Text style={styles.pickerLabel}>From</Text>
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={() => setShowFromModal(true)}
                  accessibilityLabel="Select departure branch"
                >
                  <Text style={fromBranch ? styles.pickerValue : styles.pickerPlaceholder}>
                    {fromBranch ? fromBranch.name : 'Select departure'}
                  </Text>
                  <Text style={styles.pickerArrow}>&#x25BC;</Text>
                </TouchableOpacity>
              </Card>

              <Card style={styles.pickerCard}>
                <Text style={styles.pickerLabel}>To</Text>
                <TouchableOpacity
                  style={[styles.pickerButton, !fromBranch && styles.pickerDisabled]}
                  onPress={() => fromBranch && setShowToModal(true)}
                  disabled={!fromBranch}
                  accessibilityLabel="Select arrival branch"
                >
                  <Text style={toBranch ? styles.pickerValue : styles.pickerPlaceholder}>
                    {toBranch ? toBranch.name : fromBranch ? 'Select destination' : 'Select departure first'}
                  </Text>
                  <Text style={styles.pickerArrow}>&#x25BC;</Text>
                </TouchableOpacity>
              </Card>

              {fromBranch && toBranch && (
                <View style={styles.routeSummary}>
                  <Text style={styles.routeSummaryText}>
                    {fromBranch.name} &#x2192; {toBranch.name}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* STEP 2: Date & Time */}
          {step === 2 && (
            <View>
              <Text style={styles.stepTitle}>Select Date & Time</Text>
              <Text style={styles.stepDesc}>Pick your travel date and departure time</Text>

              <Text style={styles.fieldLabel}>Travel Date</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.dateScroll}
                contentContainerStyle={styles.dateScrollContent}
              >
                {DATE_CHIPS.map((chip) => {
                  const isSelected = travelDate === chip.dateStr;
                  return (
                    <TouchableOpacity
                      key={chip.dateStr}
                      style={[styles.dateChip, isSelected && styles.dateChipSelected]}
                      onPress={() => handleSelectDate(chip.dateStr)}
                      accessibilityLabel={`Select date ${chip.label}`}
                      accessibilityState={{ selected: isSelected }}
                    >
                      <Text style={[styles.dateChipDay, isSelected && styles.dateChipDaySelected]}>
                        {format(chip.date, 'EEE')}
                      </Text>
                      <Text style={[styles.dateChipDate, isSelected && styles.dateChipDateSelected]}>
                        {format(chip.date, 'dd')}
                      </Text>
                      <Text style={[styles.dateChipMonth, isSelected && styles.dateChipMonthSelected]}>
                        {chip.label === 'Today' || chip.label === 'Tomorrow'
                          ? chip.label
                          : format(chip.date, 'MMM')}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <Text style={styles.fieldLabel}>Departure Time</Text>
              <Card style={styles.pickerCard}>
                <TouchableOpacity
                  style={styles.pickerButton}
                  onPress={() => setShowScheduleModal(true)}
                  accessibilityLabel="Select departure time"
                >
                  <Text style={departure ? styles.pickerValue : styles.pickerPlaceholder}>
                    {departure ? formatTimeDisplay(departure) : 'Select departure time'}
                  </Text>
                  <Text style={styles.pickerArrow}>&#x25BC;</Text>
                </TouchableOpacity>
              </Card>

              {travelDate && departure && (
                <View style={styles.routeSummary}>
                  <Text style={styles.routeSummaryText}>
                    {fromBranch?.name} &#x2192; {toBranch?.name}
                  </Text>
                  <Text style={styles.routeSummarySub}>
                    {format(new Date(travelDate), 'dd MMM yyyy')} at {formatTimeDisplay(departure)}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* STEP 3: Items & Summary */}
          {step === 3 && (
            <View>
              <Text style={styles.stepTitle}>Select Passengers & Vehicles</Text>
              <Text style={styles.stepDesc}>Add passengers and vehicles for your trip</Text>

              {/* Passengers */}
              {passengers.length > 0 && (
                <View style={styles.itemSection}>
                  <Text style={styles.itemSectionTitle}>Passengers</Text>
                  {passengers.map((item) => (
                    <ItemRow
                      key={item.id}
                      item={item}
                      quantity={getItemQty(item.id)}
                      onQtyChange={(qty) => handleQtyChange(item.id, qty)}
                    />
                  ))}
                </View>
              )}

              {/* Vehicles */}
              {vehicles.length > 0 && (
                <View style={styles.itemSection}>
                  <Text style={styles.itemSectionTitle}>Vehicles</Text>
                  {vehicles.map((item) => {
                    const qty = getItemQty(item.id);
                    return (
                      <View key={item.id}>
                        <ItemRow
                          item={item}
                          quantity={qty}
                          onQtyChange={(q) => handleQtyChange(item.id, q)}
                        />
                        {qty > 0 && (
                          <View style={styles.vehicleNoContainer}>
                            <Input
                              label="Vehicle Number"
                              placeholder="e.g. MH-01-AB-1234"
                              value={vehicleInputs[item.id] || ''}
                              onChangeText={(text) => handleVehicleNoChange(item.id, text)}
                              autoCapitalize="characters"
                            />
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {items.length === 0 && (
                <Card style={styles.emptyItems}>
                  <Text style={styles.emptyItemsText}>
                    No items available for this route. Please go back and select a different route.
                  </Text>
                </Card>
              )}

              {/* Summary */}
              {formItems.length > 0 && (
                <Card style={styles.summaryCard}>
                  <Text style={styles.summaryTitle}>Booking Summary</Text>
                  <View style={styles.summaryDivider} />

                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Route</Text>
                    <Text style={styles.summaryValue}>
                      {fromBranch?.name} &#x2192; {toBranch?.name}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Date</Text>
                    <Text style={styles.summaryValue}>
                      {travelDate ? format(new Date(travelDate), 'dd MMM yyyy') : ''}
                    </Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Time</Text>
                    <Text style={styles.summaryValue}>
                      {departure ? formatTimeDisplay(departure) : ''}
                    </Text>
                  </View>

                  <View style={styles.summaryDivider} />
                  <Text style={styles.summaryItemsHeader}>Items</Text>
                  {formItems.map((fi) => (
                    <View key={fi.id} style={styles.summaryItemRow}>
                      <Text style={styles.summaryItemName}>
                        {fi.quantity}x {fi.name}
                      </Text>
                      <Text style={styles.summaryItemAmount}>
                        Rs. {(fi.quantity * (fi.rate + fi.levy)).toFixed(2)}
                      </Text>
                    </View>
                  ))}

                  <View style={styles.summaryTotalDivider} />
                  <View style={styles.summaryRow}>
                    <Text style={styles.totalLabel}>Total Amount</Text>
                    <Text style={styles.totalValue}>Rs. {totalAmount.toFixed(2)}</Text>
                  </View>
                </Card>
              )}
            </View>
          )}
        </ScrollView>

        {/* Bottom Actions */}
        <View style={styles.bottomActions}>
          {step > 1 && (
            <Button
              title="Back"
              onPress={() => setStep(step - 1)}
              variant="outline"
              style={styles.actionBtn}
            />
          )}
          {step < 3 ? (
            <Button
              title="Next"
              onPress={() => setStep(step + 1)}
              disabled={!canGoNext()}
              style={styles.actionBtn}
            />
          ) : (
            <Button
              title={isProcessingPayment ? 'Processing...' : `Pay Rs. ${totalAmount.toFixed(2)}`}
              onPress={handlePay}
              disabled={!canPay() || isProcessingPayment || isCreating}
              loading={isProcessingPayment || isCreating}
              style={styles.actionBtn}
            />
          )}
        </View>
      </KeyboardAvoidingView>

      {/* From Branch Modal */}
      {renderPickerModal(
        showFromModal,
        () => setShowFromModal(false),
        'Select Departure',
        branches,
        (item: Branch) => (
          <TouchableOpacity
            style={[styles.modalItem, fromBranch?.id === item.id && styles.modalItemSelected]}
            onPress={() => handleSelectFrom(item)}
          >
            <Text style={[styles.modalItemText, fromBranch?.id === item.id && styles.modalItemTextSelected]}>
              {item.name}
            </Text>
            {item.address && <Text style={styles.modalItemSub}>{item.address}</Text>}
          </TouchableOpacity>
        ),
        (item: Branch) => item.id.toString(),
      )}

      {/* To Branch Modal */}
      {renderPickerModal(
        showToModal,
        () => setShowToModal(false),
        'Select Destination',
        toBranches,
        (item: Branch) => (
          <TouchableOpacity
            style={[styles.modalItem, toBranch?.id === item.id && styles.modalItemSelected]}
            onPress={() => handleSelectTo(item)}
          >
            <Text style={[styles.modalItemText, toBranch?.id === item.id && styles.modalItemTextSelected]}>
              {item.name}
            </Text>
            {item.address && <Text style={styles.modalItemSub}>{item.address}</Text>}
          </TouchableOpacity>
        ),
        (item: Branch) => item.id.toString(),
      )}

      {/* Schedule Modal */}
      {renderPickerModal(
        showScheduleModal,
        () => setShowScheduleModal(false),
        'Select Departure Time',
        schedules,
        (item: ScheduleItem) => (
          <TouchableOpacity
            style={[styles.modalItem, departure === item.departure && styles.modalItemSelected]}
            onPress={() => handleSelectSchedule(item)}
          >
            <Text
              style={[
                styles.modalItemText,
                departure === item.departure && styles.modalItemTextSelected,
              ]}
            >
              {formatTimeDisplay(item.departure)}
            </Text>
          </TouchableOpacity>
        ),
        (item: ScheduleItem) => item.id.toString(),
      )}
    </View>
  );
}

// --- Item Row Sub-Component ---
function ItemRow({
  item,
  quantity,
  onQtyChange,
}: {
  item: BookableItem;
  quantity: number;
  onQtyChange: (qty: number) => void;
}) {
  const unitPrice = item.rate + item.levy;

  return (
    <View style={itemStyles.row}>
      <View style={itemStyles.info}>
        <Text style={itemStyles.name}>{item.name}</Text>
        <Text style={itemStyles.price}>Rs. {unitPrice.toFixed(2)} per unit</Text>
      </View>
      <View style={itemStyles.stepper}>
        <TouchableOpacity
          style={[itemStyles.stepperBtn, quantity === 0 && itemStyles.stepperBtnDisabled]}
          onPress={() => onQtyChange(Math.max(0, quantity - 1))}
          disabled={quantity === 0}
          accessibilityLabel={`Decrease ${item.name} quantity`}
        >
          <Text style={[itemStyles.stepperText, quantity === 0 && itemStyles.stepperTextDisabled]}>
            -
          </Text>
        </TouchableOpacity>
        <Text style={itemStyles.qtyText}>{quantity}</Text>
        <TouchableOpacity
          style={itemStyles.stepperBtn}
          onPress={() => onQtyChange(quantity + 1)}
          accessibilityLabel={`Increase ${item.name} quantity`}
        >
          <Text style={itemStyles.stepperText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const itemStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  info: {
    flex: 1,
    marginRight: spacing.md,
  },
  name: {
    ...typography.body,
    fontWeight: '600',
    color: colors.text,
  } as TextStyle,
  price: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  } as TextStyle,
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  stepperBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
  },
  stepperBtnDisabled: {
    backgroundColor: colors.border,
  },
  stepperText: {
    ...typography.h3,
    color: colors.textOnPrimary,
    fontWeight: '700',
  } as TextStyle,
  stepperTextDisabled: {
    color: colors.textLight,
  } as TextStyle,
  qtyText: {
    width: 40,
    textAlign: 'center',
    ...typography.body,
    fontWeight: '700',
    color: colors.text,
  } as TextStyle,
});

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

  // Step Indicator
  stepIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepCircle: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: {
    backgroundColor: colors.primary,
  },
  stepNum: {
    ...typography.bodySmall,
    fontWeight: '700',
    color: colors.textSecondary,
  } as TextStyle,
  stepNumActive: {
    color: colors.textOnPrimary,
  } as TextStyle,
  stepLabel: {
    ...typography.caption,
    color: colors.textSecondary,
    marginLeft: spacing.xs,
    marginRight: spacing.xs,
  } as TextStyle,
  stepLabelActive: {
    color: colors.primary,
    fontWeight: '600',
  } as TextStyle,
  stepLine: {
    width: 24,
    height: 2,
    backgroundColor: colors.border,
    marginHorizontal: spacing.xs,
  },
  stepLineActive: {
    backgroundColor: colors.primary,
  },

  body: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },

  stepTitle: {
    ...typography.h2,
    color: colors.text,
    marginBottom: spacing.xs,
  } as TextStyle,
  stepDesc: {
    ...typography.bodySmall,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  } as TextStyle,

  // Picker
  pickerCard: {
    marginBottom: spacing.md,
  },
  pickerLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  } as TextStyle,
  pickerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    backgroundColor: colors.background,
  },
  pickerDisabled: {
    opacity: 0.5,
  },
  pickerValue: {
    ...typography.body,
    color: colors.text,
    flex: 1,
  } as TextStyle,
  pickerPlaceholder: {
    ...typography.body,
    color: colors.textLight,
    flex: 1,
  } as TextStyle,
  pickerArrow: {
    fontSize: 12,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
  },

  routeSummary: {
    backgroundColor: colors.infoLight,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  routeSummaryText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.info,
  } as TextStyle,
  routeSummarySub: {
    ...typography.bodySmall,
    color: colors.info,
    marginTop: spacing.xs,
  } as TextStyle,

  // Date chips
  fieldLabel: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  } as TextStyle,
  dateScroll: {
    marginBottom: spacing.lg,
  },
  dateScrollContent: {
    paddingRight: spacing.md,
  },
  dateChip: {
    width: 68,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
    alignItems: 'center',
    marginRight: spacing.sm,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  dateChipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  dateChipDay: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
    marginBottom: 2,
  } as TextStyle,
  dateChipDaySelected: {
    color: 'rgba(255,255,255,0.8)',
  } as TextStyle,
  dateChipDate: {
    ...typography.h3,
    color: colors.text,
  } as TextStyle,
  dateChipDateSelected: {
    color: colors.textOnPrimary,
  } as TextStyle,
  dateChipMonth: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  } as TextStyle,
  dateChipMonthSelected: {
    color: 'rgba(255,255,255,0.8)',
  } as TextStyle,

  // Items
  itemSection: {
    marginBottom: spacing.lg,
  },
  itemSectionTitle: {
    ...typography.h3,
    color: colors.primaryDark,
    marginBottom: spacing.md,
  } as TextStyle,
  vehicleNoContainer: {
    marginTop: -spacing.sm,
    marginBottom: spacing.sm,
    marginLeft: spacing.md,
    marginRight: spacing.md,
  },
  emptyItems: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyItemsText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: 'center',
  } as TextStyle,

  // Summary
  summaryCard: {
    marginTop: spacing.sm,
    borderWidth: 1,
    borderColor: colors.primary,
    borderStyle: 'solid',
  },
  summaryTitle: {
    ...typography.h3,
    color: colors.primaryDark,
    marginBottom: spacing.sm,
  } as TextStyle,
  summaryDivider: {
    height: 1,
    backgroundColor: colors.divider,
    marginVertical: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  summaryLabel: {
    ...typography.bodySmall,
    color: colors.textSecondary,
  } as TextStyle,
  summaryValue: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    textAlign: 'right',
  } as TextStyle,
  summaryItemsHeader: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
  } as TextStyle,
  summaryItemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
  },
  summaryItemName: {
    ...typography.bodySmall,
    color: colors.text,
  } as TextStyle,
  summaryItemAmount: {
    ...typography.bodySmall,
    fontWeight: '600',
    color: colors.text,
  } as TextStyle,
  summaryTotalDivider: {
    height: 1,
    backgroundColor: colors.primaryLight,
    marginVertical: spacing.sm,
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

  // Bottom Actions
  bottomActions: {
    flexDirection: 'row',
    padding: spacing.md,
    paddingBottom: spacing.lg,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    gap: spacing.md,
  },
  actionBtn: {
    flex: 1,
  },
  actionBtnFull: {
    flex: 1,
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    maxHeight: '70%',
    paddingBottom: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  modalTitle: {
    ...typography.h3,
    color: colors.text,
  } as TextStyle,
  modalCloseBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  modalCloseText: {
    ...typography.body,
    color: colors.primary,
    fontWeight: '600',
  } as TextStyle,
  modalList: {
    paddingHorizontal: spacing.lg,
  },
  modalItem: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  modalItemSelected: {
    backgroundColor: colors.infoLight,
  },
  modalItemText: {
    ...typography.body,
    color: colors.text,
  } as TextStyle,
  modalItemTextSelected: {
    color: colors.primary,
    fontWeight: '600',
  } as TextStyle,
  modalItemSub: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  } as TextStyle,
  modalSeparator: {
    height: 1,
    backgroundColor: colors.divider,
  },
  modalEmpty: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  modalEmptyText: {
    ...typography.body,
    color: colors.textSecondary,
  } as TextStyle,
});
