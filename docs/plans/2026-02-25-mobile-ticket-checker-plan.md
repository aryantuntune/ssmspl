# Mobile Ticket Checker App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an Expo/React Native mobile app for TICKET_CHECKER users to scan QR codes and verify ferry tickets, plus add backend mobile auth endpoints.

**Architecture:** New Expo app at `apps/checker/` communicating with the existing FastAPI backend via REST. Two new backend endpoints (`mobile-login`, `mobile-refresh`) return JWTs in JSON body. All verification uses existing `/api/verification/*` endpoints unchanged. Redux Toolkit for state, expo-camera for QR, expo-secure-store for tokens.

**Tech Stack:** Expo ~54, React Native 0.81+, React 19, TypeScript, Redux Toolkit, Axios, expo-camera, expo-secure-store, expo-haptics, React Navigation

**Design doc:** `docs/plans/2026-02-25-mobile-ticket-checker-design.md`

---

## Task 1: Backend — Mobile Login Endpoint

**Files:**
- Modify: `backend/app/schemas/auth.py` (add `MobileLoginResponse` and `MobileUserInfo` schemas)
- Modify: `backend/app/routers/auth.py` (add `mobile_login` endpoint)
- Modify: `backend/app/services/user_service.py` (reuse `_resolve_route_name`)

**Step 1: Add response schemas to `backend/app/schemas/auth.py`**

Add after `ResetPasswordRequest` class (line 59):

```python
class MobileUserInfo(BaseModel):
    id: str = Field(..., description="User UUID")
    full_name: str
    email: str
    role: str
    route_id: int | None = None
    route_name: str | None = None


class MobileLoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: MobileUserInfo
```

**Step 2: Add `mobile_login` endpoint to `backend/app/routers/auth.py`**

Add after the existing `login` endpoint (after line 52). Import `MobileLoginResponse, MobileUserInfo` from schemas, and `UserRole` from rbac:

```python
@router.post(
    "/mobile-login",
    response_model=MobileLoginResponse,
    summary="Mobile app login (TICKET_CHECKER only)",
    description="Authenticate a ticket checker for the mobile app. Returns tokens in JSON body (no cookies). Rejects non-TICKET_CHECKER roles.",
    responses={
        200: {"description": "Successfully authenticated"},
        401: {"description": "Invalid email or password"},
        403: {"description": "Not a ticket checker account"},
    },
)
@limiter.limit("10/minute")
async def mobile_login(
    request: Request,
    body: LoginRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    tokens = await auth_service.login(db, body.email, body.password)
    # Load user to check role
    from sqlalchemy import select
    result = await db.execute(
        select(User).where(User.email == body.email, User.is_active == True)
    )
    user = result.scalar_one_or_none()
    if user.role != UserRole.TICKET_CHECKER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This app is for ticket checkers only. Please use the web dashboard.",
        )
    # Probabilistic cleanup
    if random.random() < 0.05:
        background_tasks.add_task(_cleanup_expired_tokens)
    route_name = await _resolve_route_name(db, user.route_id)
    return MobileLoginResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user=MobileUserInfo(
            id=str(user.id),
            full_name=user.full_name,
            email=user.email,
            role=user.role.value,
            route_id=user.route_id,
            route_name=route_name,
        ),
    )
```

**Step 3: Add `mobile_refresh` endpoint to `backend/app/routers/auth.py`**

Add after `mobile_login`:

```python
@router.post(
    "/mobile-refresh",
    summary="Refresh tokens for mobile app",
    description="Exchange a valid refresh token for a new token pair. Returns tokens in JSON body.",
    responses={
        200: {"description": "New token pair issued"},
        401: {"description": "Invalid or expired refresh token"},
    },
)
@limiter.limit("20/minute")
async def mobile_refresh(request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    tokens = await auth_service.refresh_access_token(db, body.refresh_token)
    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "token_type": "bearer",
    }
```

**Step 4: Test manually**

Run backend: `cd backend && uvicorn app.main:app --reload`

Test with curl/httpie:
```bash
# Should succeed for ticket_checker user
curl -X POST http://localhost:8000/api/auth/mobile-login \
  -H "Content-Type: application/json" \
  -d '{"email":"ticket_checker@ssmspl.com","password":"Password@123"}'
# Expected: 200 with access_token, refresh_token, user object

# Should fail for admin user
curl -X POST http://localhost:8000/api/auth/mobile-login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ssmspl.com","password":"Password@123"}'
# Expected: 403 "This app is for ticket checkers only"
```

**Step 5: Commit**

```bash
git add backend/app/schemas/auth.py backend/app/routers/auth.py
git commit -m "feat: add mobile-login and mobile-refresh endpoints for checker app"
```

---

## Task 2: Expo Project Scaffold

**Files:**
- Create: `apps/checker/package.json`
- Create: `apps/checker/tsconfig.json`
- Create: `apps/checker/app.json`
- Create: `apps/checker/index.ts`
- Create: `apps/checker/App.tsx`
- Create: `apps/checker/babel.config.js`

**Step 1: Create `apps/checker/` directory and initialize Expo project**

```bash
mkdir -p apps/checker
cd apps/checker
npx create-expo-app@latest . --template blank-typescript
```

This scaffolds the Expo project. If interactive prompts appear, accept defaults.

**Step 2: Install dependencies**

```bash
cd apps/checker
npx expo install expo-camera expo-secure-store expo-haptics @react-native-async-storage/async-storage
npm install @react-navigation/native @react-navigation/native-stack react-native-screens react-native-safe-area-context @reduxjs/toolkit react-redux axios
```

**Step 3: Update `apps/checker/app.json`**

Replace the generated config with:

```json
{
  "expo": {
    "name": "SSMSPL Checker",
    "slug": "ssmspl-checker",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "newArchEnabled": true,
    "splash": {
      "backgroundColor": "#4338CA"
    },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.ssmspl.checker",
      "infoPlist": {
        "NSCameraUsageDescription": "This app needs camera access to scan QR codes on ferry tickets."
      }
    },
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#4338CA"
      },
      "package": "com.ssmspl.checker",
      "permissions": ["CAMERA"]
    },
    "plugins": [
      [
        "expo-camera",
        {
          "cameraPermission": "This app needs camera access to scan QR codes on ferry tickets."
        }
      ]
    ]
  }
}
```

**Step 4: Create directory structure**

```bash
cd apps/checker
mkdir -p src/screens src/components/common src/components/ticket src/services src/store/slices src/theme src/types src/utils
```

**Step 5: Verify it runs**

```bash
cd apps/checker
npx expo start
```

Press `a` for Android or `i` for iOS. Should show default Expo screen. Ctrl+C to stop.

**Step 6: Commit**

```bash
git add apps/checker/
git commit -m "feat: scaffold Expo project for ticket checker mobile app"
```

---

## Task 3: Theme, Types & Utility Layer

**Files:**
- Create: `apps/checker/src/theme/colors.ts`
- Create: `apps/checker/src/theme/spacing.ts`
- Create: `apps/checker/src/theme/typography.ts`
- Create: `apps/checker/src/theme/index.ts`
- Create: `apps/checker/src/types/models.ts`
- Create: `apps/checker/src/types/api.ts`
- Create: `apps/checker/src/types/navigation.ts`
- Create: `apps/checker/src/types/index.ts`
- Create: `apps/checker/src/utils/logger.ts`

**Step 1: Create theme files**

`apps/checker/src/theme/colors.ts`:
```typescript
export const colors = {
  primary: '#4F46E5',
  primaryDark: '#4338CA',
  primaryLight: '#818CF8',

  success: '#10B981',
  successLight: '#D1FAE5',
  warning: '#F59E0B',
  warningLight: '#FEF3C7',
  error: '#EF4444',
  errorLight: '#FEE2E2',
  info: '#8B5CF6',
  infoLight: '#EDE9FE',

  background: '#F8FAFC',
  surface: '#FFFFFF',
  border: '#E2E8F0',

  text: '#1F2937',
  textSecondary: '#6B7280',
  textLight: '#9CA3AF',
  textOnPrimary: '#FFFFFF',
};
```

`apps/checker/src/theme/spacing.ts`:
```typescript
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const borderRadius = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 24,
  full: 9999,
};
```

`apps/checker/src/theme/typography.ts`:
```typescript
import { TextStyle } from 'react-native';

export const typography: Record<string, TextStyle> = {
  h1: { fontSize: 28, fontWeight: '700', lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 22 },
  bodySmall: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
  button: { fontSize: 16, fontWeight: '600', lineHeight: 22 },
};
```

`apps/checker/src/theme/index.ts`:
```typescript
export { colors } from './colors';
export { spacing, borderRadius } from './spacing';
export { typography } from './typography';
```

**Step 2: Create type definitions**

`apps/checker/src/types/models.ts`:
```typescript
export interface CheckerUser {
  id: string;
  full_name: string;
  email: string;
  role: string;
  route_id: number | null;
  route_name: string | null;
}

export interface VerificationItemDetail {
  item_name: string;
  quantity: number;
  is_vehicle: boolean;
  vehicle_no: string | null;
}

export interface VerificationResult {
  source: 'booking' | 'ticket';
  id: number;
  reference_no: number;
  status: string;
  route_name: string | null;
  branch_name: string | null;
  travel_date: string;
  departure: string | null;
  net_amount: number;
  passenger_count: number;
  items: VerificationItemDetail[];
  checked_in_at: string | null;
  verification_code: string | null;
}

export interface CheckInResult {
  message: string;
  source: string;
  id: number;
  reference_no: number;
  checked_in_at: string;
}

export type VerificationOutcome = 'success' | 'already_verified' | 'error';

export interface VerificationRecord {
  outcome: VerificationOutcome;
  result: VerificationResult | null;
  checkIn: CheckInResult | null;
  error: string | null;
  timestamp: string;
}
```

`apps/checker/src/types/api.ts`:
```typescript
import { CheckerUser } from './models';

export interface MobileLoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: CheckerUser;
}

export interface MobileRefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface ApiError {
  detail: string;
}
```

`apps/checker/src/types/navigation.ts`:
```typescript
export type RootStackParamList = {
  Splash: undefined;
  Login: undefined;
  Home: undefined;
  QRScanner: undefined;
};
```

`apps/checker/src/types/index.ts`:
```typescript
export * from './models';
export * from './api';
export * from './navigation';
```

**Step 3: Create logger utility**

`apps/checker/src/utils/logger.ts`:
```typescript
const isDev = __DEV__;

export const logger = {
  info: (...args: unknown[]) => {
    if (isDev) console.log('[INFO]', ...args);
  },
  warn: (...args: unknown[]) => {
    if (isDev) console.warn('[WARN]', ...args);
  },
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
  },
};
```

**Step 4: Commit**

```bash
git add apps/checker/src/theme/ apps/checker/src/types/ apps/checker/src/utils/
git commit -m "feat: add theme, types, and utility layer for checker app"
```

---

## Task 4: Storage & API Service Layer

**Files:**
- Create: `apps/checker/src/services/storageService.ts`
- Create: `apps/checker/src/services/api.ts`
- Create: `apps/checker/src/services/authService.ts`
- Create: `apps/checker/src/services/verificationService.ts`

**Step 1: Create storage service**

`apps/checker/src/services/storageService.ts`:
```typescript
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CheckerUser } from '../types';
import { logger } from '../utils/logger';

const KEYS = {
  ACCESS_TOKEN: 'ssmspl_access_token',
  REFRESH_TOKEN: 'ssmspl_refresh_token',
  CHECKER_DATA: 'ssmspl_checker_data',
  VERIFICATION_COUNT: 'ssmspl_verification_count',
};

// --- Secure token storage ---

export async function getAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.ACCESS_TOKEN);
  } catch {
    logger.warn('SecureStore read failed, trying AsyncStorage fallback');
    return AsyncStorage.getItem(KEYS.ACCESS_TOKEN);
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(KEYS.REFRESH_TOKEN);
  } catch {
    return AsyncStorage.getItem(KEYS.REFRESH_TOKEN);
  }
}

export async function setTokens(access: string, refresh: string): Promise<void> {
  try {
    await SecureStore.setItemAsync(KEYS.ACCESS_TOKEN, access);
    await SecureStore.setItemAsync(KEYS.REFRESH_TOKEN, refresh);
  } catch {
    logger.warn('SecureStore write failed, using AsyncStorage fallback');
    await AsyncStorage.setItem(KEYS.ACCESS_TOKEN, access);
    await AsyncStorage.setItem(KEYS.REFRESH_TOKEN, refresh);
  }
}

export async function clearTokens(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEYS.ACCESS_TOKEN);
    await SecureStore.deleteItemAsync(KEYS.REFRESH_TOKEN);
  } catch {
    // ignore
  }
  await AsyncStorage.removeItem(KEYS.ACCESS_TOKEN);
  await AsyncStorage.removeItem(KEYS.REFRESH_TOKEN);
}

// --- Checker profile ---

export async function getCheckerData(): Promise<CheckerUser | null> {
  const raw = await AsyncStorage.getItem(KEYS.CHECKER_DATA);
  return raw ? JSON.parse(raw) : null;
}

export async function setCheckerData(checker: CheckerUser): Promise<void> {
  await AsyncStorage.setItem(KEYS.CHECKER_DATA, JSON.stringify(checker));
}

export async function clearCheckerData(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.CHECKER_DATA);
}

// --- Daily verification count ---

interface DailyCount {
  count: number;
  date: string; // YYYY-MM-DD
}

function todayString(): string {
  return new Date().toISOString().split('T')[0];
}

export async function getTodayCount(): Promise<number> {
  const raw = await AsyncStorage.getItem(KEYS.VERIFICATION_COUNT);
  if (!raw) return 0;
  const data: DailyCount = JSON.parse(raw);
  if (data.date !== todayString()) return 0;
  return data.count;
}

export async function incrementTodayCount(): Promise<number> {
  const today = todayString();
  const raw = await AsyncStorage.getItem(KEYS.VERIFICATION_COUNT);
  let data: DailyCount = raw ? JSON.parse(raw) : { count: 0, date: today };
  if (data.date !== today) {
    data = { count: 0, date: today };
  }
  data.count += 1;
  await AsyncStorage.setItem(KEYS.VERIFICATION_COUNT, JSON.stringify(data));
  return data.count;
}

// --- Clear all ---

export async function clearAll(): Promise<void> {
  await clearTokens();
  await clearCheckerData();
}
```

**Step 2: Create Axios API instance with interceptor**

`apps/checker/src/services/api.ts`:
```typescript
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getAccessToken, getRefreshToken, setTokens, clearAll } from './storageService';
import { MobileRefreshResponse } from '../types';
import { logger } from '../utils/logger';

// TODO: Update this to your actual backend URL before building
const BASE_URL = __DEV__
  ? 'http://10.0.2.2:8000'  // Android emulator -> host machine
  : 'https://api.ssmspl.com';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

// --- Request interceptor: attach Bearer token ---
api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// --- Response interceptor: handle 401 with token refresh ---
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token);
    else reject(error);
  });
  failedQueue = [];
}

// Navigation callback — set by App.tsx to redirect to Login on auth failure
let onAuthFailure: (() => void) | null = null;
export function setAuthFailureHandler(handler: () => void) {
  onAuthFailure = handler;
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      }).then((token) => {
        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      });
    }

    originalRequest._retry = true;
    isRefreshing = true;

    try {
      const refreshToken = await getRefreshToken();
      if (!refreshToken) throw new Error('No refresh token');

      const { data } = await axios.post<MobileRefreshResponse>(
        `${BASE_URL}/api/auth/mobile-refresh`,
        { refresh_token: refreshToken },
      );

      await setTokens(data.access_token, data.refresh_token);
      processQueue(null, data.access_token);

      originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
      return api(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      logger.error('Token refresh failed, logging out');
      await clearAll();
      onAuthFailure?.();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default api;
```

**Step 3: Create auth service**

`apps/checker/src/services/authService.ts`:
```typescript
import api from './api';
import { MobileLoginResponse } from '../types';
import { setTokens, setCheckerData, clearAll } from './storageService';

export async function login(email: string, password: string): Promise<MobileLoginResponse> {
  const { data } = await api.post<MobileLoginResponse>('/api/auth/mobile-login', {
    email,
    password,
  });
  await setTokens(data.access_token, data.refresh_token);
  await setCheckerData(data.user);
  return data;
}

export async function logout(): Promise<void> {
  try {
    // Best-effort server logout
    await api.post('/api/auth/logout');
  } catch {
    // Ignore — clear local state regardless
  }
  await clearAll();
}

export async function getProfile(): Promise<MobileLoginResponse['user']> {
  const { data } = await api.get('/api/auth/me');
  return {
    id: data.id,
    full_name: data.full_name,
    email: data.email,
    role: data.role,
    route_id: data.route_id,
    route_name: data.route_name,
  };
}
```

**Step 4: Create verification service**

`apps/checker/src/services/verificationService.ts`:
```typescript
import api from './api';
import { VerificationResult, CheckInResult } from '../types';

export async function scanQR(payload: string): Promise<VerificationResult> {
  const { data } = await api.get<VerificationResult>('/api/verification/scan', {
    params: { payload },
  });
  return data;
}

export async function checkIn(verificationCode: string): Promise<CheckInResult> {
  const { data } = await api.post<CheckInResult>('/api/verification/check-in', {
    verification_code: verificationCode,
  });
  return data;
}

export async function lookupBooking(
  bookingNo: number,
  branchId?: number,
): Promise<VerificationResult> {
  const { data } = await api.get<VerificationResult>('/api/verification/booking-number', {
    params: { booking_no: bookingNo, branch_id: branchId },
  });
  return data;
}

export async function lookupTicket(
  ticketNo: number,
  branchId: number,
): Promise<VerificationResult> {
  const { data } = await api.get<VerificationResult>('/api/verification/ticket', {
    params: { ticket_no: ticketNo, branch_id: branchId },
  });
  return data;
}
```

**Step 5: Commit**

```bash
git add apps/checker/src/services/
git commit -m "feat: add storage, API, auth, and verification service layers"
```

---

## Task 5: Redux Store

**Files:**
- Create: `apps/checker/src/store/slices/authSlice.ts`
- Create: `apps/checker/src/store/slices/verificationSlice.ts`
- Create: `apps/checker/src/store/index.ts`

**Step 1: Create auth slice**

`apps/checker/src/store/slices/authSlice.ts`:
```typescript
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { CheckerUser } from '../../types';
import * as authService from '../../services/authService';
import { getAccessToken, getCheckerData, clearAll } from '../../services/storageService';

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
  // Validate token is still good
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
      const message =
        err.response?.data?.detail || err.message || 'Login failed';
      return rejectWithValue(message);
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
      // checkAuthStatus
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
      // login
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
      // logout
      .addCase(logout.fulfilled, (state) => {
        state.isAuthenticated = false;
        state.checker = null;
      });
  },
});

export const { clearError, resetAuth } = authSlice.actions;
export default authSlice.reducer;
```

**Step 2: Create verification slice**

`apps/checker/src/store/slices/verificationSlice.ts`:
```typescript
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { VerificationResult, CheckInResult, VerificationRecord } from '../../types';
import * as verificationService from '../../services/verificationService';
import { getTodayCount, incrementTodayCount } from '../../services/storageService';

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

export const scanQR = createAsyncThunk(
  'verification/scanQR',
  async (payload: string, { rejectWithValue }) => {
    try {
      return await verificationService.scanQR(payload);
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || 'Scan failed');
    }
  },
);

export const checkIn = createAsyncThunk(
  'verification/checkIn',
  async (verificationCode: string, { rejectWithValue }) => {
    try {
      const result = await verificationService.checkIn(verificationCode);
      await incrementTodayCount();
      return result;
    } catch (err: any) {
      const detail = err.response?.data?.detail || 'Check-in failed';
      // 409 = already verified
      if (err.response?.status === 409) {
        return rejectWithValue('ALREADY_VERIFIED');
      }
      return rejectWithValue(detail);
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
      if (params.type === 'booking') {
        return await verificationService.lookupBooking(params.number, params.branchId);
      } else {
        if (!params.branchId) throw new Error('Branch ID required for ticket lookup');
        return await verificationService.lookupTicket(params.number, params.branchId);
      }
    } catch (err: any) {
      return rejectWithValue(err.response?.data?.detail || err.message || 'Lookup failed');
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
      // scanQR
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
            outcome: 'error',
            result: null,
            checkIn: null,
            error: action.payload as string,
            timestamp: new Date().toISOString(),
          },
          ...state.recentVerifications,
        ].slice(0, MAX_RECENT);
      })
      // checkIn
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
            outcome: 'success',
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
        if (msg === 'ALREADY_VERIFIED') {
          state.recentVerifications = [
            {
              outcome: 'already_verified',
              result: state.lastResult,
              checkIn: null,
              error: null,
              timestamp: new Date().toISOString(),
            },
            ...state.recentVerifications,
          ].slice(0, MAX_RECENT);
        }
      })
      // lookupManual — reuse scanQR result shape
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
```

**Step 3: Create store**

`apps/checker/src/store/index.ts`:
```typescript
import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import verificationReducer from './slices/verificationSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    verification: verificationReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

**Step 4: Commit**

```bash
git add apps/checker/src/store/
git commit -m "feat: add Redux store with auth and verification slices"
```

---

## Task 6: Common UI Components

**Files:**
- Create: `apps/checker/src/components/common/Button.tsx`
- Create: `apps/checker/src/components/common/Input.tsx`
- Create: `apps/checker/src/components/common/Card.tsx`
- Create: `apps/checker/src/components/common/Loading.tsx`
- Create: `apps/checker/src/components/common/StatCard.tsx`

**Step 1: Create Button component**

`apps/checker/src/components/common/Button.tsx`:
```typescript
import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  icon?: string;
  style?: ViewStyle;
}

export default function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const buttonStyles: ViewStyle[] = [styles.base];
  const textStyles: TextStyle[] = [styles.text];

  if (variant === 'primary') {
    buttonStyles.push(styles.primary);
    textStyles.push(styles.textPrimary);
  } else if (variant === 'secondary') {
    buttonStyles.push(styles.secondary);
    textStyles.push(styles.textSecondary);
  } else if (variant === 'outline') {
    buttonStyles.push(styles.outline);
    textStyles.push(styles.textOutline);
  } else if (variant === 'danger') {
    buttonStyles.push(styles.danger);
    textStyles.push(styles.textPrimary);
  }

  if (isDisabled) buttonStyles.push(styles.disabled);
  if (style) buttonStyles.push(style);

  return (
    <TouchableOpacity
      style={buttonStyles}
      onPress={onPress}
      disabled={isDisabled}
      activeOpacity={0.7}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'outline' ? colors.primary : colors.textOnPrimary} />
      ) : (
        <Text style={textStyles}>
          {icon ? `${icon}  ${title}` : title}
        </Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.primaryLight },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  danger: { backgroundColor: colors.error },
  disabled: { opacity: 0.5 },
  text: { ...typography.button },
  textPrimary: { color: colors.textOnPrimary },
  textSecondary: { color: colors.textOnPrimary },
  textOutline: { color: colors.primary },
});
```

**Step 2: Create Input component**

`apps/checker/src/components/common/Input.tsx`:
```typescript
import React, { useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInputProps,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  isPassword?: boolean;
}

export default function Input({ label, error, isPassword, style, ...rest }: InputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.inputContainer, error && styles.inputError]}>
        <TextInput
          style={[styles.input, style]}
          placeholderTextColor={colors.textLight}
          secureTextEntry={isPassword && !showPassword}
          autoCapitalize="none"
          {...rest}
        />
        {isPassword && (
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
            <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { ...typography.bodySmall, fontWeight: '600', color: colors.text, marginBottom: spacing.xs },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surface,
  },
  inputError: { borderColor: colors.error },
  input: {
    flex: 1,
    paddingVertical: spacing.md - 4,
    paddingHorizontal: spacing.md,
    ...typography.body,
    color: colors.text,
  },
  eyeBtn: { paddingHorizontal: spacing.md },
  eyeText: { ...typography.bodySmall, color: colors.primary, fontWeight: '600' },
  error: { ...typography.caption, color: colors.error, marginTop: spacing.xs },
});
```

**Step 3: Create Card component**

`apps/checker/src/components/common/Card.tsx`:
```typescript
import React, { ReactNode } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, spacing, borderRadius } from '../../theme';

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
}

export default function Card({ children, style }: CardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
});
```

**Step 4: Create Loading component**

`apps/checker/src/components/common/Loading.tsx`:
```typescript
import React from 'react';
import { View, ActivityIndicator, Text, StyleSheet } from 'react-native';
import { colors, typography } from '../../theme';

interface LoadingProps {
  message?: string;
}

export default function Loading({ message }: LoadingProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  message: { ...typography.body, color: colors.textSecondary, marginTop: 12 },
});
```

**Step 5: Create StatCard component**

`apps/checker/src/components/common/StatCard.tsx`:
```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface StatCardProps {
  label: string;
  value: number | string;
  badge?: string;
}

export default function StatCard({ label, value, badge }: StatCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        {badge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { ...typography.bodySmall, color: colors.textSecondary },
  badge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  badgeText: { ...typography.caption, color: colors.success, fontWeight: '600' },
  value: { ...typography.h1, color: colors.text, marginTop: spacing.sm },
});
```

**Step 6: Commit**

```bash
git add apps/checker/src/components/common/
git commit -m "feat: add common UI components (Button, Input, Card, Loading, StatCard)"
```

---

## Task 7: Ticket Components (VerificationBadge + TicketDetailsModal)

**Files:**
- Create: `apps/checker/src/components/ticket/VerificationBadge.tsx`
- Create: `apps/checker/src/components/ticket/TicketDetailsModal.tsx`

**Step 1: Create VerificationBadge**

`apps/checker/src/components/ticket/VerificationBadge.tsx`:
```typescript
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';

interface VerificationBadgeProps {
  status: string;
}

const STATUS_CONFIG: Record<string, { bg: string; text: string; label: string; icon: string }> = {
  CONFIRMED: { bg: colors.successLight, text: colors.success, label: 'Ready to Verify', icon: '' },
  VERIFIED: { bg: colors.infoLight, text: colors.info, label: 'Already Verified', icon: '' },
  CANCELLED: { bg: colors.errorLight, text: colors.error, label: 'Cancelled', icon: '' },
  PENDING: { bg: colors.warningLight, text: colors.warning, label: 'Payment Pending', icon: '' },
};

export default function VerificationBadge({ status }: VerificationBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.CONFIRMED;

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.icon]}>{config.icon}</Text>
      <Text style={[styles.text, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.full,
    gap: spacing.sm,
  },
  icon: { fontSize: 18 },
  text: { ...typography.bodySmall, fontWeight: '700' },
});
```

**Step 2: Create TicketDetailsModal**

`apps/checker/src/components/ticket/TicketDetailsModal.tsx`:
```typescript
import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';
import { VerificationResult, CheckInResult } from '../../types';
import VerificationBadge from './VerificationBadge';
import Button from '../common/Button';

interface TicketDetailsModalProps {
  visible: boolean;
  result: VerificationResult | null;
  checkInResult: CheckInResult | null;
  isCheckingIn: boolean;
  error: string | null;
  onVerify: () => void;
  onScanNext: () => void;
  onClose: () => void;
}

function DetailRow({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === undefined) return null;
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{String(value)}</Text>
    </View>
  );
}

export default function TicketDetailsModal({
  visible,
  result,
  checkInResult,
  isCheckingIn,
  error,
  onVerify,
  onScanNext,
  onClose,
}: TicketDetailsModalProps) {
  if (!result) return null;

  const isVerified = result.status === 'VERIFIED' || !!checkInResult;
  const isCancelled = result.status === 'CANCELLED';
  const isPending = result.status === 'PENDING';
  const canVerify = result.status === 'CONFIRMED' && !checkInResult;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>
              {checkInResult
                ? 'Verification Successful'
                : result.status === 'VERIFIED'
                ? 'Already Verified'
                : 'Ticket Details'}
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>X</Text>
            </TouchableOpacity>
          </View>

          {/* Badge */}
          <VerificationBadge status={checkInResult ? 'VERIFIED' : result.status} />

          {/* Error */}
          {error && error !== 'ALREADY_VERIFIED' && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Details */}
          <ScrollView style={styles.details} showsVerticalScrollIndicator={false}>
            <DetailRow
              label={result.source === 'booking' ? 'Booking No' : 'Ticket No'}
              value={`#${result.reference_no}`}
            />
            <DetailRow label="Source" value={result.source === 'booking' ? 'Customer Portal' : 'Billing Counter'} />
            <DetailRow label="Route" value={result.route_name} />
            <DetailRow label="Branch" value={result.branch_name} />
            <DetailRow label="Travel Date" value={result.travel_date} />
            <DetailRow label="Departure" value={result.departure} />
            <DetailRow label="Passengers" value={result.passenger_count} />
            <DetailRow label="Amount" value={`Rs. ${result.net_amount.toFixed(2)}`} />

            {result.checked_in_at && (
              <DetailRow
                label="Checked In At"
                value={new Date(result.checked_in_at).toLocaleString()}
              />
            )}
            {checkInResult?.checked_in_at && (
              <DetailRow
                label="Checked In At"
                value={new Date(checkInResult.checked_in_at).toLocaleString()}
              />
            )}

            {/* Items */}
            {result.items.length > 0 && (
              <View style={styles.itemsSection}>
                <Text style={styles.itemsTitle}>Items</Text>
                {result.items.map((item, i) => (
                  <View key={i} style={styles.itemRow}>
                    <Text style={styles.itemName}>
                      {item.item_name} x{item.quantity}
                    </Text>
                    {item.vehicle_no && (
                      <Text style={styles.vehicleNo}>{item.vehicle_no}</Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={styles.actions}>
            {canVerify && (
              <Button
                title="Verify Passenger"
                onPress={onVerify}
                loading={isCheckingIn}
                icon="✓"
              />
            )}
            {(isVerified || isCancelled || isPending) && (
              <Button title="Scan Next Ticket" onPress={onScanNext} icon="📷" />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius.xl,
    borderTopRightRadius: borderRadius.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    paddingHorizontal: spacing.lg,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: { ...typography.h3, color: colors.text },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { ...typography.body, fontWeight: '700', color: colors.textSecondary },
  errorBox: {
    backgroundColor: colors.errorLight,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
  },
  errorText: { ...typography.bodySmall, color: colors.error },
  details: { marginTop: spacing.md },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  detailLabel: { ...typography.bodySmall, color: colors.textSecondary },
  detailValue: { ...typography.bodySmall, fontWeight: '600', color: colors.text, maxWidth: '60%', textAlign: 'right' },
  itemsSection: { marginTop: spacing.md },
  itemsTitle: { ...typography.body, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.xs,
  },
  itemName: { ...typography.bodySmall, color: colors.text },
  vehicleNo: { ...typography.caption, color: colors.textSecondary },
  actions: { marginTop: spacing.lg, gap: spacing.sm },
});
```

**Step 3: Commit**

```bash
git add apps/checker/src/components/ticket/
git commit -m "feat: add VerificationBadge and TicketDetailsModal components"
```

---

## Task 8: SplashScreen & LoginScreen

**Files:**
- Create: `apps/checker/src/screens/SplashScreen.tsx`
- Create: `apps/checker/src/screens/LoginScreen.tsx`

**Step 1: Create SplashScreen**

`apps/checker/src/screens/SplashScreen.tsx`:
```typescript
import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, typography } from '../theme';
import { RootState, AppDispatch } from '../store';
import { checkAuthStatus } from '../store/slices/authSlice';
import { RootStackParamList } from '../types';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Splash'>;
};

export default function SplashScreen({ navigation }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { isCheckingAuth, isAuthenticated } = useSelector((s: RootState) => s.auth);

  useEffect(() => {
    dispatch(checkAuthStatus());
  }, [dispatch]);

  useEffect(() => {
    if (!isCheckingAuth) {
      navigation.reset({
        index: 0,
        routes: [{ name: isAuthenticated ? 'Home' : 'Login' }],
      });
    }
  }, [isCheckingAuth, isAuthenticated, navigation]);

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🎫</Text>
      <Text style={styles.title}>SSMSPL Checker</Text>
      <ActivityIndicator size="large" color={colors.textOnPrimary} style={styles.loader} />
      <Text style={styles.sub}>Loading...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  icon: { fontSize: 64, marginBottom: 16 },
  title: { ...typography.h1, color: colors.textOnPrimary },
  loader: { marginTop: 32 },
  sub: { ...typography.body, color: 'rgba(255,255,255,0.7)', marginTop: 12 },
});
```

**Step 2: Create LoginScreen**

`apps/checker/src/screens/LoginScreen.tsx`:
```typescript
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../theme';
import { RootState, AppDispatch } from '../store';
import { login, clearError } from '../store/slices/authSlice';
import { RootStackParamList } from '../types';
import Input from '../components/common/Input';
import Button from '../components/common/Button';
import Card from '../components/common/Card';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Login'>;
};

export default function LoginScreen({ navigation }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { isLoading, error, isAuthenticated } = useSelector((s: RootState) => s.auth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    }
  }, [isAuthenticated, navigation]);

  useEffect(() => {
    return () => { dispatch(clearError()); };
  }, [dispatch]);

  const isValid = email.includes('@') && password.length >= 6;

  const handleLogin = () => {
    if (!isValid) return;
    dispatch(login({ email: email.trim(), password }));
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.icon}>🎫</Text>
          <Text style={styles.title}>Checker Login</Text>
          <Text style={styles.subtitle}>SSMSPL Ferry Verification</Text>
        </View>

        <Card style={styles.card}>
          {error && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <Input
            label="Email"
            placeholder="Enter your email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            autoComplete="email"
          />

          <Input
            label="Password"
            placeholder="Enter your password"
            isPassword
            value={password}
            onChangeText={setPassword}
          />

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={isLoading}
            disabled={!isValid}
            style={styles.loginBtn}
          />
        </Card>

        <Text style={styles.footer}>Only authorized ticket checkers can access this app.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  header: { alignItems: 'center', marginBottom: spacing.xl },
  icon: { fontSize: 56 },
  title: { ...typography.h1, color: colors.text, marginTop: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary, marginTop: spacing.xs },
  card: { padding: spacing.lg },
  errorBox: {
    backgroundColor: colors.errorLight,
    padding: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  errorText: { ...typography.bodySmall, color: colors.error, textAlign: 'center' },
  loginBtn: { marginTop: spacing.sm },
  footer: {
    ...typography.caption,
    color: colors.textLight,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
});
```

**Step 3: Commit**

```bash
git add apps/checker/src/screens/SplashScreen.tsx apps/checker/src/screens/LoginScreen.tsx
git commit -m "feat: add SplashScreen and LoginScreen"
```

---

## Task 9: HomeScreen

**Files:**
- Create: `apps/checker/src/screens/HomeScreen.tsx`

**Step 1: Create HomeScreen**

`apps/checker/src/screens/HomeScreen.tsx`:
```typescript
import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Modal,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { colors, spacing, borderRadius, typography } from '../theme';
import { RootState, AppDispatch } from '../store';
import { logout } from '../store/slices/authSlice';
import { loadTodayCount, lookupManual, clearResult } from '../store/slices/verificationSlice';
import { RootStackParamList, VerificationRecord } from '../types';
import Button from '../components/common/Button';
import StatCard from '../components/common/StatCard';
import Card from '../components/common/Card';
import TicketDetailsModal from '../components/ticket/TicketDetailsModal';
import { checkIn } from '../store/slices/verificationSlice';

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'Home'>;
};

export default function HomeScreen({ navigation }: Props) {
  const dispatch = useDispatch<AppDispatch>();
  const { checker } = useSelector((s: RootState) => s.auth);
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
  }, [dispatch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await dispatch(loadTodayCount());
    setRefreshing(false);
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

  // Show details modal when scan result arrives (from manual lookup)
  useEffect(() => {
    if (lastResult && showDetails) {
      // modal will show via showDetails + lastResult
    }
  }, [lastResult, showDetails]);

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
        <View>
          <Text style={styles.headerTitle}>🚢 SSMSPL Checker</Text>
          {checker && (
            <Text style={styles.headerSub}>
              {checker.full_name} • {checker.route_name || 'No route'}
            </Text>
          )}
        </View>
        <TouchableOpacity onPress={handleLogout} style={styles.avatar}>
          <Text style={styles.avatarText}>
            {checker?.full_name?.charAt(0)?.toUpperCase() || '?'}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      >
        {/* Date */}
        <Text style={styles.date}>{today}</Text>

        {/* Stat */}
        <StatCard label="Verified Today" value={verifiedToday} badge="Live" />

        {/* Actions */}
        <View style={styles.actions}>
          <Button
            title="Scan QR Code"
            icon="📷"
            onPress={() => navigation.navigate('QRScanner')}
          />
          <Button
            title="Manual Entry"
            icon="⌨️"
            variant="outline"
            onPress={() => {
              setManualNumber('');
              setManualModalVisible(true);
            }}
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
  avatarText: { ...typography.body, fontWeight: '700', color: colors.textOnPrimary },
  content: { padding: spacing.lg, gap: spacing.md },
  date: { ...typography.bodySmall, color: colors.textSecondary },
  actions: { gap: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.text, marginTop: spacing.sm },
  emptyText: { ...typography.bodySmall, color: colors.textLight, textAlign: 'center' },
  recentCard: { marginBottom: spacing.xs },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 10, height: 10, borderRadius: 5 },
  recentInfo: { flex: 1 },
  recentRef: { ...typography.bodySmall, fontWeight: '600', color: colors.text },
  recentMeta: { ...typography.caption, color: colors.textSecondary },
  // Manual modal
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
  tabText: { ...typography.bodySmall, fontWeight: '600', color: colors.textSecondary },
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
```

**Step 2: Commit**

```bash
git add apps/checker/src/screens/HomeScreen.tsx
git commit -m "feat: add HomeScreen with stats, manual entry, and recent verifications"
```

---

## Task 10: QRScannerScreen

**Files:**
- Create: `apps/checker/src/screens/QRScannerScreen.tsx`

**Step 1: Create QRScannerScreen**

`apps/checker/src/screens/QRScannerScreen.tsx`:
```typescript
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
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

type Props = {
  navigation: NativeStackNavigationProp<RootStackParamList, 'QRScanner'>;
};

const SCAN_SIZE = 250;
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

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

  // Reset state when entering scanner
  useEffect(() => {
    dispatch(clearResult());
  }, [dispatch]);

  const handleBarCodeScanned = async (result: BarcodeScanningResult) => {
    const { data } = result;
    const now = Date.now();

    // Debounce: same code within 3 seconds
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

  return (
    <View style={styles.container}>
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
          <View style={styles.overlaySide} />
          <View style={styles.scanFrame}>
            {/* Corner markers */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <View style={styles.overlaySide} />
        </View>
        <View style={styles.overlayBottom}>
          <Text style={styles.instruction}>Position the QR code within the frame</Text>
        </View>
      </View>

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity onPress={handleClose} style={styles.controlBtn}>
          <Text style={styles.controlIcon}>✕</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setFlashOn(!flashOn)} style={styles.controlBtn}>
          <Text style={styles.controlIcon}>{flashOn ? '🔦' : '💡'}</Text>
        </TouchableOpacity>
      </View>

      {/* Scanning overlay */}
      {isScanning && (
        <View style={styles.scanningOverlay}>
          <Loading message="Verifying ticket..." />
        </View>
      )}

      {/* Error display (for scan failures without modal) */}
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
const sideWidth = (SCREEN_WIDTH - SCAN_SIZE) / 2;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: overlayColor },
  overlayMiddle: { flexDirection: 'row', height: SCAN_SIZE },
  overlaySide: { width: sideWidth, backgroundColor: overlayColor },
  overlayBottom: { flex: 1, backgroundColor: overlayColor, alignItems: 'center', paddingTop: spacing.lg },
  scanFrame: {
    width: SCAN_SIZE,
    height: SCAN_SIZE,
    borderWidth: 0,
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
  errorDismiss: { ...typography.bodySmall, fontWeight: '700', color: colors.error, marginLeft: spacing.sm },
  // Permission screen
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
```

**Step 2: Commit**

```bash
git add apps/checker/src/screens/QRScannerScreen.tsx
git commit -m "feat: add QRScannerScreen with camera, overlay, and verification flow"
```

---

## Task 11: Navigation & App Entry Point

**Files:**
- Create: `apps/checker/src/navigation/RootNavigator.tsx`
- Create: `apps/checker/src/navigation/index.ts`
- Modify: `apps/checker/App.tsx`

**Step 1: Create RootNavigator**

`apps/checker/src/navigation/RootNavigator.tsx`:
```typescript
import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { RootStackParamList } from '../types';
import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import HomeScreen from '../screens/HomeScreen';
import QRScannerScreen from '../screens/QRScannerScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Splash"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="Splash" component={SplashScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen
        name="QRScanner"
        component={QRScannerScreen}
        options={{ presentation: 'fullScreenModal', animation: 'slide_from_bottom' }}
      />
    </Stack.Navigator>
  );
}
```

`apps/checker/src/navigation/index.ts`:
```typescript
export { default as RootNavigator } from './RootNavigator';
```

**Step 2: Update App.tsx**

Replace `apps/checker/App.tsx` with:

```typescript
import React, { useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import { Provider } from 'react-redux';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { store } from './src/store';
import { RootNavigator } from './src/navigation';
import { setAuthFailureHandler } from './src/services/api';
import { resetAuth } from './src/store/slices/authSlice';
import { RootStackParamList } from './src/types';

export default function App() {
  const navRef = useRef<NavigationContainerRef<RootStackParamList>>(null);

  React.useEffect(() => {
    setAuthFailureHandler(() => {
      store.dispatch(resetAuth());
      navRef.current?.reset({ index: 0, routes: [{ name: 'Login' }] });
    });
  }, []);

  return (
    <Provider store={store}>
      <SafeAreaProvider>
        <NavigationContainer ref={navRef}>
          <RootNavigator />
          <StatusBar style="auto" />
        </NavigationContainer>
      </SafeAreaProvider>
    </Provider>
  );
}
```

**Step 3: Verify the app builds**

```bash
cd apps/checker
npx expo start
```

Should show SplashScreen → LoginScreen on launch.

**Step 4: Commit**

```bash
git add apps/checker/src/navigation/ apps/checker/App.tsx
git commit -m "feat: wire up navigation and App entry point with Redux provider"
```

---

## Task 12: Backend — Fix mobile-login to check role before generating tokens

**Files:**
- Modify: `backend/app/routers/auth.py` (fix mobile_login to check role *before* calling auth_service.login)

This is a correctness fix. In Task 1, `auth_service.login()` generates tokens before we check the role, which wastes a token pair. Reorder to check role first:

**Step 1: Update mobile_login endpoint**

Replace the mobile_login function body in `backend/app/routers/auth.py` with:

```python
@router.post(
    "/mobile-login",
    response_model=MobileLoginResponse,
    summary="Mobile app login (TICKET_CHECKER only)",
    description="Authenticate a ticket checker for the mobile app. Returns tokens in JSON body (no cookies). Rejects non-TICKET_CHECKER roles.",
    responses={
        200: {"description": "Successfully authenticated"},
        401: {"description": "Invalid email or password"},
        403: {"description": "Not a ticket checker account"},
    },
)
@limiter.limit("10/minute")
async def mobile_login(
    request: Request,
    body: LoginRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
):
    from sqlalchemy import select
    # Authenticate first
    user = await auth_service.authenticate_user(db, body.email, body.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
        )
    # Check role BEFORE generating tokens
    if user.role != UserRole.TICKET_CHECKER:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This app is for ticket checkers only. Please use the web dashboard.",
        )
    # Now generate tokens (same logic as auth_service.login minus the authenticate call)
    from datetime import datetime, timezone
    user.last_login = datetime.now(timezone.utc)
    from app.core.security import create_access_token, create_refresh_token
    from app.services import token_service
    from datetime import timedelta
    extra = {"role": user.role.value}
    access_token = create_access_token(subject=str(user.id), extra_claims=extra)
    refresh_token = create_refresh_token(subject=str(user.id))
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await token_service.store_refresh_token(db, refresh_token, expires_at, user_id=user.id)
    await db.commit()

    if random.random() < 0.05:
        background_tasks.add_task(_cleanup_expired_tokens)

    route_name = await _resolve_route_name(db, user.route_id)
    return MobileLoginResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=MobileUserInfo(
            id=str(user.id),
            full_name=user.full_name,
            email=user.email,
            role=user.role.value,
            route_id=user.route_id,
            route_name=route_name,
        ),
    )
```

**Step 2: Commit**

```bash
git add backend/app/routers/auth.py
git commit -m "fix: check TICKET_CHECKER role before generating tokens in mobile-login"
```

---

## Task 13: Update CORS & API Base URL Configuration

**Files:**
- Modify: `backend/app/config.py` (document that mobile app IP must be in ALLOWED_ORIGINS)
- Modify: `apps/checker/src/services/api.ts` (make BASE_URL configurable)

**Step 1: Update API base URL config**

In `apps/checker/src/services/api.ts`, update the BASE_URL section:

```typescript
import Constants from 'expo-constants';

// Configure via app.json extra or environment
const BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ||
  (__DEV__ ? 'http://10.0.2.2:8000' : 'https://api.ssmspl.com');
```

Add to `apps/checker/app.json` inside the `"expo"` object:

```json
"extra": {
  "apiUrl": "http://10.0.2.2:8000"
}
```

**Step 2: Add mobile origin to backend CORS**

In `.env.development`, ensure `ALLOWED_ORIGINS` includes the mobile dev server. The mobile app sends requests directly to the backend (not through a browser proxy), so CORS headers aren't strictly needed for native apps. However, for Expo web testing, add it:

No code change needed — native HTTP clients ignore CORS. Document this in the design doc.

**Step 3: Install expo-constants**

```bash
cd apps/checker
npx expo install expo-constants
```

**Step 4: Commit**

```bash
git add apps/checker/src/services/api.ts apps/checker/app.json apps/checker/package.json
git commit -m "feat: make API base URL configurable via app.json extra"
```

---

## Task 14: End-to-End Testing

**No new files** — manual verification checklist.

**Step 1: Start backend**

```bash
cd backend
uvicorn app.main:app --reload
```

**Step 2: Start mobile app**

```bash
cd apps/checker
npx expo start
```

**Step 3: Test flow on emulator/device**

1. App opens → SplashScreen → LoginScreen (no stored token)
2. Login with admin credentials → should see "This app is for ticket checkers only"
3. Login with ticket_checker credentials → should see HomeScreen
4. Tap "Scan QR Code" → Camera permission prompt → QR scanner
5. Scan a valid QR → Ticket details modal → Tap "Verify Passenger" → Success
6. Scan same QR again → "Already Verified" state
7. Tap avatar → Logout → back to LoginScreen
8. Close and reopen app → should auto-login (stored token)
9. Manual Entry → type a booking number → lookup → verify

**Step 4: Commit final state**

```bash
git add -A
git commit -m "feat: complete mobile ticket checker app (Expo/React Native)"
```

---

## Summary

| Task | Description | Est. |
|------|-------------|------|
| 1 | Backend mobile-login + mobile-refresh endpoints | 10 min |
| 2 | Expo project scaffold + dependencies | 5 min |
| 3 | Theme, types, utilities | 5 min |
| 4 | Storage, API, auth, verification services | 10 min |
| 5 | Redux store (auth + verification slices) | 10 min |
| 6 | Common UI components | 10 min |
| 7 | Ticket components (badge + details modal) | 10 min |
| 8 | SplashScreen + LoginScreen | 10 min |
| 9 | HomeScreen | 15 min |
| 10 | QRScannerScreen | 15 min |
| 11 | Navigation + App entry point | 5 min |
| 12 | Fix mobile-login role check ordering | 5 min |
| 13 | API URL configuration | 5 min |
| 14 | End-to-end testing | 15 min |
