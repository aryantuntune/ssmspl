import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { CheckerUser } from '../../types';
import * as authService from '../../services/authService';
import { getAccessToken, clearAll } from '../../services/storageService';
import { friendlyError } from '../../utils/errorMessages';

interface AuthState {
  checker: CheckerUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isCheckingAuth: boolean;
  error: string | null;
}

const initialState: AuthState = {
  checker: null,
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
      .addCase(checkAuthStatus.pending, (state) => {
        state.isCheckingAuth = true;
      })
      .addCase(checkAuthStatus.fulfilled, (state, action) => {
        state.isCheckingAuth = false;
        if (action.payload) {
          state.checker = action.payload;
          state.isAuthenticated = true;
        }
      })
      .addCase(checkAuthStatus.rejected, (state) => {
        state.isCheckingAuth = false;
        state.isAuthenticated = false;
        state.checker = null;
      })
      .addCase(login.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(login.fulfilled, (state, action) => {
        state.isLoading = false;
        state.isAuthenticated = true;
        state.checker = action.payload;
      })
      .addCase(login.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })
      .addCase(logout.fulfilled, (state) => {
        state.isAuthenticated = false;
        state.checker = null;
      });
  },
});

export const { clearError, resetAuth } = authSlice.actions;
export default authSlice.reducer;
