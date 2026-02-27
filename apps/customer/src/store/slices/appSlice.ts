import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import api from '../../services/api';

interface DynamicColors {
  primary?: string;
  primaryDark?: string;
  primaryLight?: string;
  accent?: string;
}

interface AppState {
  isOnline: boolean;
  theme: 'light' | 'dark';
  language: 'en' | 'mr';
  sessionExpired: boolean;
  dynamicColors: DynamicColors | null;
}

export const fetchAppTheme = createAsyncThunk(
  'app/fetchAppTheme',
  async () => {
    const res = await api.get('/api/portal/theme');
    return res.data;
  }
);

const initialState: AppState = {
  isOnline: true,
  theme: 'light',
  language: 'en',
  sessionExpired: false,
  dynamicColors: null,
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setOnline(state, action: PayloadAction<boolean>) {
      state.isOnline = action.payload;
    },
    setTheme(state, action: PayloadAction<'light' | 'dark'>) {
      state.theme = action.payload;
    },
    setLanguage(state, action: PayloadAction<'en' | 'mr'>) {
      state.language = action.payload;
    },
    setSessionExpired(state, action: PayloadAction<boolean>) {
      state.sessionExpired = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder.addCase(fetchAppTheme.fulfilled, (state, action) => {
      const data = action.payload;
      if (data?.colors) {
        state.dynamicColors = {
          primary: data.colors.primary,
          primaryDark: data.colors.primaryDark,
          primaryLight: data.colors.primaryLight,
          accent: data.colors.accent,
        };
      }
    });
  },
});

export const { setOnline, setTheme, setLanguage, setSessionExpired } = appSlice.actions;
export default appSlice.reducer;
