import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { Customer } from '../../types';
import * as authService from '../../services/authService';
import { getAccessToken, clearAll, setCustomerData } from '../../services/storageService';
import { friendlyError } from '../../utils/errorMessages';

interface AuthState {
  customer: Customer | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isCheckingAuth: boolean;
  error: string | null;
}

const initialState: AuthState = {
  customer: null,
  isAuthenticated: false,
  isLoading: false,
  isCheckingAuth: true,
  error: null,
};

export const checkAuthStatus = createAsyncThunk('auth/checkStatus', async () => {
  const token = await getAccessToken();
  if (!token) return null;
  try {
    const profile = await authService.getProfile();
    await setCustomerData(profile);
    return profile;
  } catch {
    await clearAll();
    return null;
  }
});

export const login = createAsyncThunk(
  'auth/login',
  async (creds: { email: string; password: string }, { rejectWithValue }) => {
    try {
      const response = await authService.login(creds.email, creds.password);
      return response.user;
    } catch (err: any) {
      return rejectWithValue(friendlyError(err));
    }
  },
);

export const register = createAsyncThunk(
  'auth/register',
  async (
    data: { first_name: string; last_name: string; email: string; password: string; mobile: string },
    { rejectWithValue },
  ) => {
    try {
      return await authService.register(data.first_name, data.last_name, data.email, data.password, data.mobile);
    } catch (err: any) {
      return rejectWithValue(friendlyError(err));
    }
  },
);

export const verifyOtp = createAsyncThunk(
  'auth/verifyOtp',
  async (data: { email: string; otp: string }, { rejectWithValue }) => {
    try {
      await authService.verifyOtp(data.email, data.otp);
    } catch (err: any) {
      return rejectWithValue(friendlyError(err));
    }
  },
);

export const googleSignIn = createAsyncThunk(
  'auth/googleSignIn',
  async (
    data: { google_id: string; email: string; first_name: string; last_name: string },
    { rejectWithValue },
  ) => {
    try {
      const response = await authService.googleSignIn(data.google_id, data.email, data.first_name, data.last_name);
      return response.user;
    } catch (err: any) {
      return rejectWithValue(friendlyError(err));
    }
  },
);

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (data: { first_name?: string; last_name?: string; mobile?: string }, { rejectWithValue }) => {
    try {
      return await authService.updateProfile(data.first_name, data.last_name, data.mobile);
    } catch (err: any) {
      return rejectWithValue(friendlyError(err));
    }
  },
);

export const logout = createAsyncThunk('auth/logout', async () => {
  await authService.logout();
});

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError(state) {
      state.error = null;
    },
    resetAuth(state) {
      Object.assign(state, { ...initialState, isCheckingAuth: false });
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(checkAuthStatus.pending, (state) => { state.isCheckingAuth = true; })
      .addCase(checkAuthStatus.fulfilled, (state, action) => {
        state.isCheckingAuth = false;
        if (action.payload) {
          state.customer = action.payload;
          state.isAuthenticated = true;
        }
      })
      .addCase(checkAuthStatus.rejected, (state) => {
        state.isCheckingAuth = false;
        state.isAuthenticated = false;
        state.customer = null;
      })
      .addCase(login.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.customer = action.payload;
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(register.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(register.fulfilled, (state) => { state.isLoading = false; })
      .addCase(register.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(verifyOtp.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(verifyOtp.fulfilled, (state) => { state.isLoading = false; })
      .addCase(verifyOtp.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(googleSignIn.pending, (state) => { state.isLoading = true; state.error = null; })
      .addCase(googleSignIn.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.customer = action.payload;
      })
      .addCase(googleSignIn.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.customer = action.payload;
      })
      .addCase(logout.fulfilled, (state) => {
        state.isAuthenticated = false;
        state.customer = null;
      });
  },
});

export const { clearError, resetAuth } = authSlice.actions;
export default authSlice.reducer;
