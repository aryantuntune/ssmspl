import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { VerificationResult, CheckInResult, VerificationRecord, VerificationOutcome } from '../../types';
import * as verificationService from '../../services/verificationService';
import { getTodayCount, incrementTodayCount, addToOfflineQueue, getVerificationHistory, saveVerificationHistory } from '../../services/storageService';
import { friendlyError } from '../../utils/errorMessages';

interface VerificationState {
  verifiedToday: number;
  lastResult: VerificationResult | null;
  lastCheckIn: CheckInResult | null;
  recentVerifications: VerificationRecord[];
  isScanning: boolean;
  isCheckingIn: boolean;
  error: string | null;
}

const initialState: VerificationState = {
  verifiedToday: 0,
  lastResult: null,
  lastCheckIn: null,
  recentVerifications: [],
  isScanning: false,
  isCheckingIn: false,
  error: null,
};

export const loadTodayCount = createAsyncThunk('verification/loadCount', async () => {
  return getTodayCount();
});

export const loadHistory = createAsyncThunk('verification/loadHistory', async () => {
  return getVerificationHistory();
});

export const scanQR = createAsyncThunk(
  'verification/scanQR',
  async (payload: string, { rejectWithValue }) => {
    try {
      const data = await verificationService.scanQR(payload);
      const record = {
        outcome: 'success' as const,
        result: data,
        checkIn: null,
        error: null,
        timestamp: new Date().toISOString(),
      };
      const history = await getVerificationHistory();
      history.unshift(record);
      await saveVerificationHistory(history);
      return data;
    } catch (err: any) {
      return rejectWithValue(friendlyError(err));
    }
  },
);

export const checkIn = createAsyncThunk(
  'verification/checkIn',
  async (verificationCode: string, { rejectWithValue }) => {
    try {
      const result = await verificationService.checkIn(verificationCode);
      await incrementTodayCount();
      // Persist history update
      const history = await getVerificationHistory();
      await saveVerificationHistory(history);
      return result;
    } catch (err: any) {
      if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
        await addToOfflineQueue(verificationCode);
        return rejectWithValue('Check-in saved offline. Will retry when connected.');
      }
      return rejectWithValue(friendlyError(err));
    }
  },
);

export const lookupManual = createAsyncThunk(
  'verification/lookupManual',
  async (
    params: { type: 'booking' | 'ticket'; number: number; branchId?: number },
    { rejectWithValue },
  ) => {
    try {
      let data;
      if (params.type === 'booking') {
        data = await verificationService.lookupBooking(params.number, params.branchId);
      } else {
        if (!params.branchId) throw new Error('Branch ID required for ticket lookup');
        data = await verificationService.lookupTicket(params.number, params.branchId);
      }
      const record = {
        outcome: 'success' as const,
        result: data,
        checkIn: null,
        error: null,
        timestamp: new Date().toISOString(),
      };
      const history = await getVerificationHistory();
      history.unshift(record);
      await saveVerificationHistory(history);
      return data;
    } catch (err: any) {
      return rejectWithValue(friendlyError(err));
    }
  },
);

const MAX_RECENT = 10;

const verificationSlice = createSlice({
  name: 'verification',
  initialState,
  reducers: {
    clearResult(state) {
      state.lastResult = null;
      state.lastCheckIn = null;
      state.error = null;
    },
    clearError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(loadTodayCount.fulfilled, (state, action) => {
        state.verifiedToday = action.payload;
      })
      .addCase(loadHistory.fulfilled, (state, action) => {
        if (state.recentVerifications.length === 0 && action.payload.length > 0) {
          state.recentVerifications = action.payload.slice(0, MAX_RECENT);
        }
      })
      .addCase(scanQR.pending, (state) => {
        state.isScanning = true;
        state.error = null;
        state.lastResult = null;
        state.lastCheckIn = null;
      })
      .addCase(scanQR.fulfilled, (state, action) => {
        state.isScanning = false;
        state.lastResult = action.payload;
      })
      .addCase(scanQR.rejected, (state, action) => {
        state.isScanning = false;
        state.error = action.payload as string;
        state.recentVerifications = [
          {
            outcome: 'error' as VerificationOutcome,
            result: null,
            checkIn: null,
            error: action.payload as string,
            timestamp: new Date().toISOString(),
          },
          ...state.recentVerifications,
        ].slice(0, MAX_RECENT);
      })
      .addCase(checkIn.pending, (state) => {
        state.isCheckingIn = true;
        state.error = null;
      })
      .addCase(checkIn.fulfilled, (state, action) => {
        state.isCheckingIn = false;
        state.lastCheckIn = action.payload;
        state.verifiedToday += 1;
        state.recentVerifications = [
          {
            outcome: 'success' as VerificationOutcome,
            result: state.lastResult,
            checkIn: action.payload,
            error: null,
            timestamp: new Date().toISOString(),
          },
          ...state.recentVerifications,
        ].slice(0, MAX_RECENT);
      })
      .addCase(checkIn.rejected, (state, action) => {
        state.isCheckingIn = false;
        const msg = action.payload as string;
        state.error = msg;
        if (msg.includes('ALREADY_VERIFIED')) {
          state.recentVerifications = [
            {
              outcome: 'already_verified' as VerificationOutcome,
              result: state.lastResult,
              checkIn: null,
              error: null,
              timestamp: new Date().toISOString(),
            },
            ...state.recentVerifications,
          ].slice(0, MAX_RECENT);
        }
      })
      .addCase(lookupManual.pending, (state) => {
        state.isScanning = true;
        state.error = null;
        state.lastResult = null;
        state.lastCheckIn = null;
      })
      .addCase(lookupManual.fulfilled, (state, action) => {
        state.isScanning = false;
        state.lastResult = action.payload;
      })
      .addCase(lookupManual.rejected, (state, action) => {
        state.isScanning = false;
        state.error = action.payload as string;
      });
  },
});

export const { clearResult, clearError } = verificationSlice.actions;
export default verificationSlice.reducer;
