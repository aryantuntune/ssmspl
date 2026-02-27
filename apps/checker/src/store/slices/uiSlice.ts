import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { getOfflineQueue } from '../../services/storageService';

interface UiState {
  isOnline: boolean;
  pendingCheckIns: number;
  sessionExpired: boolean;
}

const initialState: UiState = {
  isOnline: true,
  pendingCheckIns: 0,
  sessionExpired: false,
};

export const syncPendingCount = createAsyncThunk('ui/syncPendingCount', async () => {
  const queue = await getOfflineQueue();
  return queue.length;
});

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setOnline(state, action: PayloadAction<boolean>) {
      state.isOnline = action.payload;
    },
    setPendingCheckIns(state, action: PayloadAction<number>) {
      state.pendingCheckIns = action.payload;
    },
    setSessionExpired(state, action: PayloadAction<boolean>) {
      state.sessionExpired = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(syncPendingCount.fulfilled, (state, action) => {
      state.pendingCheckIns = action.payload;
    });
  },
});

export const { setOnline, setPendingCheckIns, setSessionExpired } = uiSlice.actions;
export default uiSlice.reducer;
