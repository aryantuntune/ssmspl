# Checker App Play Store Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Harden the SSMSPL Checker React Native app for Play Store release with UX polish, security, and offline resilience.

**Architecture:** Three-phase approach — (1) UX polish & reliability (network detection, retry, errors, accessibility), (2) security & stability (Sentry, cert pinning, proper logout, haptics), (3) offline resilience (check-in queue, persistent history, background sync). Each phase builds on the prior.

**Tech Stack:** React Native 0.81 / Expo 54, Redux Toolkit, Axios, `@react-native-community/netinfo`, `@sentry/react-native`, AsyncStorage, SecureStore.

---

## Phase 1: UX Polish & Reliability

### Task 1: Install NetInfo and create network state management

**Files:**
- Modify: `apps/checker/package.json`
- Create: `apps/checker/src/store/slices/uiSlice.ts`
- Modify: `apps/checker/src/store/index.ts`

**Step 1: Install NetInfo**

Run:
```bash
cd apps/checker && npx expo install @react-native-community/netinfo
```

**Step 2: Create UI slice with network state**

Create `apps/checker/src/store/slices/uiSlice.ts`:

```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

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
});

export const { setOnline, setPendingCheckIns, setSessionExpired } = uiSlice.actions;
export default uiSlice.reducer;
```

**Step 3: Register UI slice in store**

Modify `apps/checker/src/store/index.ts` — add `ui: uiReducer` to the reducer map:

```typescript
import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import verificationReducer from './slices/verificationSlice';
import uiReducer from './slices/uiSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    verification: verificationReducer,
    ui: uiReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

**Step 4: Commit**

```bash
git add apps/checker/package.json apps/checker/src/store/slices/uiSlice.ts apps/checker/src/store/index.ts
git commit -m "feat(checker): add UI slice with network state management"
```

---

### Task 2: Create NetworkBanner component and wire NetInfo

**Files:**
- Create: `apps/checker/src/components/common/NetworkBanner.tsx`
- Modify: `apps/checker/App.tsx`

**Step 1: Create NetworkBanner component**

Create `apps/checker/src/components/common/NetworkBanner.tsx`:

```tsx
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { colors, spacing, typography } from '../../theme';

export default function NetworkBanner() {
  const isOnline = useSelector((s: RootState) => s.ui.isOnline);

  if (isOnline) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLabel="No internet connection">
      <Text style={styles.text}>No internet connection</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.warning,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  text: {
    ...typography.caption,
    color: '#000',
    fontWeight: '600',
  },
});
```

**Step 2: Wire NetInfo in App.tsx**

Modify `apps/checker/App.tsx` — add NetInfo subscription that dispatches `setOnline`:

```tsx
import React, { useEffect, useRef } from 'react';
import { StatusBar, AppState, AppStateStatus } from 'react-native';
import { Provider } from 'react-redux';
import { NavigationContainer, NavigationContainerRef } from '@react-navigation/native';
import NetInfo from '@react-native-community/netinfo';
import { store } from './src/store';
import { resetAuth } from './src/store/slices/authSlice';
import { setOnline } from './src/store/slices/uiSlice';
import RootNavigator from './src/navigation';
import { setAuthFailureHandler } from './src/services/api';

export default function App() {
  const navRef = useRef<NavigationContainerRef<any>>(null);

  useEffect(() => {
    setAuthFailureHandler(() => {
      store.dispatch(resetAuth());
      navRef.current?.resetRoot({ index: 0, routes: [{ name: 'Login' }] });
    });
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      store.dispatch(setOnline(state.isConnected ?? true));
    });
    return () => unsubscribe();
  }, []);

  return (
    <Provider store={store}>
      <NavigationContainer ref={navRef}>
        <StatusBar barStyle="light-content" backgroundColor="#4338CA" />
        <RootNavigator />
      </NavigationContainer>
    </Provider>
  );
}
```

**Step 3: Commit**

```bash
git add apps/checker/src/components/common/NetworkBanner.tsx apps/checker/App.tsx
git commit -m "feat(checker): add NetworkBanner component and NetInfo wiring"
```

---

### Task 3: Create error message mapper and add retry logic to Axios

**Files:**
- Create: `apps/checker/src/utils/errorMessages.ts`
- Modify: `apps/checker/src/services/api.ts`

**Step 1: Create error message mapper**

Create `apps/checker/src/utils/errorMessages.ts`:

```typescript
/**
 * Map raw API/network errors to user-friendly messages.
 */
export function friendlyError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Something went wrong. Please try again.';

  const err = error as any;

  // Axios-specific fields
  if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }
  if (err.message === 'Network Error' || err.code === 'ERR_NETWORK') {
    return 'Unable to connect. Please check your internet.';
  }

  // HTTP status codes
  const status = err.response?.status;
  if (status === 401) return 'Session expired. Please log in again.';
  if (status === 403) return 'You do not have permission for this action.';
  if (status === 404) return 'Not found. Please check and try again.';
  if (status === 409) {
    // Check for already-verified specifically
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string' && detail.includes('ALREADY_VERIFIED')) {
      return detail;
    }
    return detail || 'Conflict. This action was already performed.';
  }
  if (status === 422) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    return 'Invalid input. Please check your data.';
  }
  if (status && status >= 500) return 'Server error. Please try again later.';

  // Fallback to server message
  const detail = err.response?.data?.detail;
  if (typeof detail === 'string') return detail;

  return 'Something went wrong. Please try again.';
}
```

**Step 2: Add retry logic and increase timeout in api.ts**

Modify `apps/checker/src/services/api.ts`:

- Change timeout from `15000` to `30000`
- Add retry interceptor for 5xx and network errors (max 3 attempts, exponential backoff)

Add this retry logic **before** the existing response interceptor. The key changes to the file:

At the top, after the axios instance creation, add:

```typescript
// --- Retry logic for transient failures ---
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

api.interceptors.response.use(undefined, async (error) => {
  const config = error.config;
  if (!config) return Promise.reject(error);

  config.__retryCount = config.__retryCount || 0;

  const isRetryable =
    !error.response || // network error
    error.response.status >= 500; // server error

  if (isRetryable && config.__retryCount < MAX_RETRIES) {
    config.__retryCount += 1;
    const delay = RETRY_DELAY_MS * Math.pow(2, config.__retryCount - 1);
    await new Promise((r) => setTimeout(r, delay));
    return api(config);
  }

  return Promise.reject(error);
});
```

Also change the timeout line from `timeout: 15000` to `timeout: 30000`.

**Step 3: Commit**

```bash
git add apps/checker/src/utils/errorMessages.ts apps/checker/src/services/api.ts
git commit -m "feat(checker): add error message mapper and retry logic with 30s timeout"
```

---

### Task 4: Add NetworkBanner to HomeScreen and QRScannerScreen + accessibility labels

**Files:**
- Modify: `apps/checker/src/screens/HomeScreen.tsx`
- Modify: `apps/checker/src/screens/QRScannerScreen.tsx`

**Step 1: Update HomeScreen**

In `apps/checker/src/screens/HomeScreen.tsx`:

- Import `NetworkBanner` and `useSelector` for `isOnline`
- Add `<NetworkBanner />` right after the header `<View>`
- Add `accessibilityLabel` and `accessibilityRole` to action buttons
- Disable Scan/Manual buttons when offline with a tooltip-style message

Key changes:

After the header closing `</View>` (around line 119), add:
```tsx
<NetworkBanner />
```

On the Scan QR button, add:
```tsx
<Button
  title="Scan QR Code"
  icon="📷"
  onPress={() => navigation.navigate('QRScanner')}
  disabled={!isOnline}
  accessibilityLabel="Scan QR code to verify ticket"
  accessibilityHint="Opens camera to scan a QR code"
/>
```

On the Manual Entry button, add:
```tsx
<Button
  title="Manual Entry"
  icon="⌨️"
  variant="outline"
  onPress={() => { setManualNumber(''); setManualModalVisible(true); }}
  disabled={!isOnline}
  accessibilityLabel="Manual ticket lookup"
  accessibilityHint="Enter booking or ticket number manually"
/>
```

Add selector at top of component:
```typescript
const isOnline = useSelector((s: RootState) => s.ui.isOnline);
```

**Step 2: Update QRScannerScreen**

In `apps/checker/src/screens/QRScannerScreen.tsx`:

- Import `NetworkBanner`
- Add `<NetworkBanner />` at top of screen
- Add instructional text below scan frame: "Align QR code within the frame"
- Add accessibility labels to close and flash buttons
- Replace emoji flash icons with text labels

Add after the scan frame overlay section:
```tsx
<Text style={styles.hintText}>Align QR code within the frame</Text>
```

Update flash toggle button text from emoji to:
```tsx
<Text style={styles.controlText}>{flash ? 'Flash ON' : 'Flash OFF'}</Text>
```

Add close button accessibility:
```tsx
accessibilityLabel="Close scanner"
accessibilityRole="button"
```

Add flash button accessibility:
```tsx
accessibilityLabel={flash ? 'Turn flash off' : 'Turn flash on'}
accessibilityRole="button"
```

**Step 3: Commit**

```bash
git add apps/checker/src/screens/HomeScreen.tsx apps/checker/src/screens/QRScannerScreen.tsx
git commit -m "feat(checker): add network banner, accessibility labels, scanner UX improvements"
```

---

### Task 5: Add loading skeleton to StatCard and accessibility to Login/Splash

**Files:**
- Modify: `apps/checker/src/components/common/StatCard.tsx`
- Modify: `apps/checker/src/components/common/Button.tsx`
- Modify: `apps/checker/src/screens/LoginScreen.tsx`
- Modify: `apps/checker/src/screens/SplashScreen.tsx`

**Step 1: Add loading prop to StatCard**

Modify `apps/checker/src/components/common/StatCard.tsx` to accept a `loading` prop and show a pulsing placeholder when loading:

```tsx
import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { colors, spacing, borderRadius, typography } from '../../theme';

type Props = {
  label: string;
  value: number;
  badge?: string;
  loading?: boolean;
};

export default function StatCard({ label, value, badge, loading }: Props) {
  const pulse = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    if (!loading) return;
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [loading, pulse]);

  return (
    <View style={styles.card} accessibilityRole="summary" accessibilityLabel={`${label}: ${value}`}>
      <View>
        <Text style={styles.label}>{label}</Text>
        {loading ? (
          <Animated.View style={[styles.skeleton, { opacity: pulse }]} />
        ) : (
          <Text style={styles.value}>{value}</Text>
        )}
      </View>
      {badge && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  label: { ...typography.bodySmall, color: colors.textSecondary },
  value: { ...typography.h1, color: colors.text, marginTop: 4 },
  skeleton: {
    width: 48,
    height: 32,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.border,
    marginTop: 4,
  },
  badge: {
    backgroundColor: colors.successLight,
    paddingHorizontal: spacing.sm + 4,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
  },
  badgeText: { ...typography.caption, color: colors.success, fontWeight: '600' },
});
```

**Step 2: Add accessibility props to Button component**

Modify `apps/checker/src/components/common/Button.tsx` — add optional `accessibilityLabel` and `accessibilityHint` props that pass through to TouchableOpacity:

Add to the Props type:
```typescript
accessibilityLabel?: string;
accessibilityHint?: string;
```

Add to the TouchableOpacity:
```tsx
accessibilityRole="button"
accessibilityLabel={accessibilityLabel || title}
accessibilityHint={accessibilityHint}
accessibilityState={{ disabled: disabled || loading }}
```

**Step 3: Add accessibility labels to LoginScreen**

In `apps/checker/src/screens/LoginScreen.tsx`, add accessibility to the form:

- Email Input: `accessibilityLabel="Email address"`
- Password Input: `accessibilityLabel="Password"`
- Login Button: `accessibilityLabel="Log in" accessibilityHint="Submits your credentials"`
- Error box: `accessibilityRole="alert"`

**Step 4: Add accessibility labels to SplashScreen**

In `apps/checker/src/screens/SplashScreen.tsx`:
- Container: `accessibilityLabel="Loading SSMSPL Checker"`
- ActivityIndicator: `accessibilityLabel="Loading"`

**Step 5: Commit**

```bash
git add apps/checker/src/components/common/StatCard.tsx apps/checker/src/components/common/Button.tsx apps/checker/src/screens/LoginScreen.tsx apps/checker/src/screens/SplashScreen.tsx
git commit -m "feat(checker): add loading skeleton, accessibility labels across all screens"
```

---

### Task 6: Use friendlyError in all thunks

**Files:**
- Modify: `apps/checker/src/store/slices/authSlice.ts`
- Modify: `apps/checker/src/store/slices/verificationSlice.ts`

**Step 1: Update authSlice to use friendlyError**

In `apps/checker/src/store/slices/authSlice.ts`, import `friendlyError` and update the catch blocks in `login` and `checkAuthStatus`:

```typescript
import { friendlyError } from '../../utils/errorMessages';
```

In the `login` thunk's catch:
```typescript
} catch (err: any) {
  return rejectWithValue(friendlyError(err));
}
```

In the `checkAuthStatus` thunk's catch:
```typescript
} catch {
  return rejectWithValue(null);
}
```

**Step 2: Update verificationSlice to use friendlyError**

In `apps/checker/src/store/slices/verificationSlice.ts`, import `friendlyError` and update catch blocks in `scanQR`, `checkIn`, and `lookupManual`:

```typescript
import { friendlyError } from '../../utils/errorMessages';
```

Each thunk's catch block:
```typescript
} catch (err: any) {
  return rejectWithValue(friendlyError(err));
}
```

**Step 3: Commit**

```bash
git add apps/checker/src/store/slices/authSlice.ts apps/checker/src/store/slices/verificationSlice.ts
git commit -m "feat(checker): use friendly error messages in all Redux thunks"
```

---

### Task 7: Update app.json versioning for Android

**Files:**
- Modify: `apps/checker/app.json`

**Step 1: Add versionCode to Android config**

In `apps/checker/app.json`, inside the `android` object, add `versionCode`:

```json
"android": {
  "adaptiveIcon": {
    "foregroundImage": "./assets/adaptive-icon.png",
    "backgroundColor": "#4338CA"
  },
  "package": "com.ssmspl.checker",
  "permissions": [
    "CAMERA"
  ],
  "edgeToEdgeEnabled": true,
  "versionCode": 1
}
```

**Step 2: Commit**

```bash
git add apps/checker/app.json
git commit -m "feat(checker): add Android versionCode for Play Store tracking"
```

---

## Phase 2: Security & Stability

### Task 8: Install and configure Sentry

**Files:**
- Modify: `apps/checker/package.json`
- Modify: `apps/checker/app.json`
- Modify: `apps/checker/App.tsx`

**Step 1: Install Sentry**

Run:
```bash
cd apps/checker && npx expo install @sentry/react-native
```

**Step 2: Add Sentry DSN to app.json extra config**

In `apps/checker/app.json`, add `sentryDsn` to the `extra` object:

```json
"extra": {
  "apiUrl": "https://api.carferry.online",
  "sentryDsn": ""
}
```

Note: The DSN is left empty — the actual DSN will be set in a `.env` or in the EAS build config. Sentry gracefully no-ops when DSN is empty.

**Step 3: Add Sentry plugin to app.json plugins**

```json
"plugins": [
  "expo-secure-store",
  [
    "expo-camera",
    {
      "cameraPermission": "Allow SSMSPL Checker to access your camera for QR code scanning"
    }
  ],
  "@sentry/react-native/expo"
]
```

**Step 4: Initialize Sentry in App.tsx**

Add Sentry initialization at the top of App.tsx (after imports):

```typescript
import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

const sentryDsn = Constants.expoConfig?.extra?.sentryDsn;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    tracesSampleRate: 0.2,
    enableAutoSessionTracking: true,
  });
}
```

Wrap the export with Sentry:
```typescript
export default sentryDsn ? Sentry.wrap(App) : App;
```

(Rename the current `App` function and export conditionally wrapped.)

**Step 5: Commit**

```bash
git add apps/checker/package.json apps/checker/app.json apps/checker/App.tsx
git commit -m "feat(checker): integrate Sentry crash reporting"
```

---

### Task 9: Implement proper backend logout and session expiry

**Files:**
- Modify: `apps/checker/src/services/authService.ts`
- Modify: `apps/checker/src/store/slices/authSlice.ts`
- Modify: `apps/checker/src/services/api.ts`
- Modify: `apps/checker/App.tsx`

**Step 1: Update authService.logout to call the backend**

In `apps/checker/src/services/authService.ts`, update the `logout` function to POST the refresh token to the backend before clearing local storage:

```typescript
async logout(): Promise<void> {
  try {
    const refreshToken = await storageService.getRefreshToken();
    if (refreshToken) {
      await api.post('/api/auth/logout', { refresh_token: refreshToken });
    }
  } catch {
    // Best-effort — proceed with local cleanup even if backend call fails
  }
  await storageService.clearAll();
}
```

**Step 2: Add session expiry toast to auth failure handler**

In `apps/checker/App.tsx`, update the auth failure handler to dispatch `setSessionExpired(true)`:

```typescript
import { setSessionExpired } from './src/store/slices/uiSlice';

setAuthFailureHandler(() => {
  store.dispatch(setSessionExpired(true));
  store.dispatch(resetAuth());
});
```

**Step 3: Show session expired banner in LoginScreen**

In `apps/checker/src/screens/LoginScreen.tsx`, check `sessionExpired` from Redux and show a banner:

```tsx
const sessionExpired = useSelector((s: RootState) => s.ui.sessionExpired);

// In render, before the card:
{sessionExpired && (
  <View style={styles.sessionBanner} accessibilityRole="alert">
    <Text style={styles.sessionText}>Session expired. Please log in again.</Text>
  </View>
)}
```

Clear `sessionExpired` on successful login (in the login thunk's fulfilled handler or in LoginScreen's effect).

**Step 4: Commit**

```bash
git add apps/checker/src/services/authService.ts apps/checker/src/store/slices/authSlice.ts apps/checker/src/services/api.ts apps/checker/App.tsx apps/checker/src/screens/LoginScreen.tsx
git commit -m "feat(checker): proper backend logout and session expiry handling"
```

---

### Task 10: Add certificate pinning

**Files:**
- Modify: `apps/checker/src/services/api.ts`
- Modify: `apps/checker/app.json`

**Step 1: Configure SSL pinning via expo-certificate-transparency or native config**

Since Expo managed workflow has limited cert-pinning support, use the approach of adding network security config for Android.

Create `apps/checker/android-network-security.xml` concept — but since Expo manages the android directory, use the `expo-build-properties` plugin approach.

Actually, for Expo managed workflow, the simplest cert-pinning approach is to validate the certificate in the Axios interceptor using a request interceptor that checks the response headers. However, true native cert pinning requires ejecting or using a config plugin.

**Practical approach:** Add a custom Axios request interceptor that logs/warns on unexpected responses. For true pinning, document it as a post-eject step in the design doc. For now, add a `__DEV__` guard that skips the check in development.

In `apps/checker/src/services/api.ts`, add a comment block documenting the cert pinning approach for when native builds are configured:

```typescript
// SSL Certificate Pinning
// For production builds, configure android:networkSecurityConfig in app.json
// or use expo-build-properties plugin with a custom network_security_config.xml.
// See: https://docs.expo.dev/build-reference/android-builds/#network-security-configuration
```

Add to `app.json` Android config for production builds:
```json
"android": {
  ...
  "usesCleartextTraffic": false
}
```

This ensures no plaintext HTTP is allowed on Android in production.

**Step 2: Commit**

```bash
git add apps/checker/src/services/api.ts apps/checker/app.json
git commit -m "feat(checker): enforce HTTPS-only and document cert pinning strategy"
```

---

### Task 11: Add consistent haptic feedback

**Files:**
- Modify: `apps/checker/src/components/common/Button.tsx`
- Modify: `apps/checker/src/components/ticket/TicketDetailsModal.tsx`

**Step 1: Add haptic feedback to Button**

In `apps/checker/src/components/common/Button.tsx`, add a light haptic on press for primary and danger variants:

```typescript
import * as Haptics from 'expo-haptics';

const handlePress = () => {
  if (variant === 'primary' || variant === 'danger') {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }
  onPress();
};
```

Use `handlePress` instead of `onPress` in TouchableOpacity.

**Step 2: Add haptic to TicketDetailsModal verify action**

In `apps/checker/src/components/ticket/TicketDetailsModal.tsx`, the verify and check-in already uses haptics in the QR scanner flow. Add success/error haptic to the "Verify Passenger" button press result.

The `onVerify` callback is called from TicketDetailsModal — haptic feedback should be triggered in the verification slice's fulfilled/rejected handlers. In `verificationSlice.ts`, the `checkIn` thunk already triggers through the QR scanner which has haptics. For manual entry flow, add haptics in `HomeScreen.tsx`:

In `HomeScreen.tsx`, after `handleVerify`:
```typescript
import * as Haptics from 'expo-haptics';

// Watch for checkIn result changes
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
```

**Step 3: Commit**

```bash
git add apps/checker/src/components/common/Button.tsx apps/checker/src/components/ticket/TicketDetailsModal.tsx apps/checker/src/screens/HomeScreen.tsx
git commit -m "feat(checker): add consistent haptic feedback on buttons and verification"
```

---

## Phase 3: Offline Resilience

### Task 12: Create offline queue utility and storage

**Files:**
- Create: `apps/checker/src/utils/offlineQueue.ts`
- Modify: `apps/checker/src/services/storageService.ts`

**Step 1: Add storage keys and methods for offline queue and persistent history**

In `apps/checker/src/services/storageService.ts`, add new storage keys and methods:

```typescript
const OFFLINE_QUEUE_KEY = 'ssmspl_offline_queue';
const VERIFICATION_HISTORY_KEY = 'ssmspl_verification_history';
const MAX_HISTORY = 50;
const HISTORY_MAX_AGE_DAYS = 7;
```

Add methods:

```typescript
// --- Offline Check-In Queue ---

export interface PendingCheckIn {
  verificationCode: string;
  timestamp: string;
  retryCount: number;
}

async getOfflineQueue(): Promise<PendingCheckIn[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async setOfflineQueue(queue: PendingCheckIn[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

async addToOfflineQueue(verificationCode: string): Promise<void> {
  const queue = await this.getOfflineQueue();
  queue.push({ verificationCode, timestamp: new Date().toISOString(), retryCount: 0 });
  await this.setOfflineQueue(queue);
}

async removeFromOfflineQueue(verificationCode: string): Promise<void> {
  const queue = await this.getOfflineQueue();
  await this.setOfflineQueue(queue.filter(q => q.verificationCode !== verificationCode));
}

// --- Persistent Verification History ---

async getVerificationHistory(): Promise<VerificationRecord[]> {
  try {
    const raw = await AsyncStorage.getItem(VERIFICATION_HISTORY_KEY);
    if (!raw) return [];
    const history: VerificationRecord[] = JSON.parse(raw);
    // Prune entries older than 7 days
    const cutoff = Date.now() - HISTORY_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    return history.filter(h => new Date(h.timestamp).getTime() > cutoff);
  } catch {
    return [];
  }
}

async saveVerificationHistory(records: VerificationRecord[]): Promise<void> {
  const trimmed = records.slice(0, MAX_HISTORY);
  await AsyncStorage.setItem(VERIFICATION_HISTORY_KEY, JSON.stringify(trimmed));
}
```

Note: Import `VerificationRecord` from types.

**Step 2: Create offline queue utility**

Create `apps/checker/src/utils/offlineQueue.ts`:

```typescript
import { storageService } from '../services/storageService';
import { verificationService } from '../services/verificationService';

const MAX_RETRIES = 3;

export async function flushOfflineQueue(): Promise<{ succeeded: number; failed: number }> {
  const queue = await storageService.getOfflineQueue();
  if (queue.length === 0) return { succeeded: 0, failed: 0 };

  let succeeded = 0;
  let failed = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      await verificationService.checkIn(item.verificationCode);
      succeeded++;
      await storageService.incrementTodayCount();
    } catch {
      item.retryCount++;
      if (item.retryCount < MAX_RETRIES) {
        remaining.push(item);
      } else {
        failed++;
      }
    }
  }

  await storageService.setOfflineQueue(remaining);
  return { succeeded, failed };
}
```

**Step 3: Commit**

```bash
git add apps/checker/src/services/storageService.ts apps/checker/src/utils/offlineQueue.ts
git commit -m "feat(checker): add offline check-in queue and persistent history storage"
```

---

### Task 13: Integrate offline queue with verification slice and UI

**Files:**
- Modify: `apps/checker/src/store/slices/verificationSlice.ts`
- Modify: `apps/checker/src/store/slices/uiSlice.ts`
- Create: `apps/checker/src/components/common/OfflineQueueBadge.tsx`

**Step 1: Update verificationSlice to queue failed check-ins and persist history**

In `apps/checker/src/store/slices/verificationSlice.ts`:

- On `checkIn` rejected due to network error, add to offline queue
- On any successful verification, save to persistent history
- On `loadTodayCount`, also load persistent history

Add a new thunk `loadHistory`:
```typescript
export const loadHistory = createAsyncThunk('verification/loadHistory', async () => {
  return storageService.getVerificationHistory();
});
```

In the `checkIn` rejected handler, check if it's a network error:
```typescript
.addCase(checkIn.rejected, (state, action) => {
  state.isCheckingIn = false;
  const errMsg = action.payload as string;
  state.error = errMsg;
  // If network error, the thunk already queued it offline
})
```

In the `checkIn` thunk itself, catch network errors and queue:
```typescript
} catch (err: any) {
  if (err.code === 'ERR_NETWORK' || err.message === 'Network Error') {
    await storageService.addToOfflineQueue(verificationCode);
    // Update pending count
    const queue = await storageService.getOfflineQueue();
    // We'll dispatch setPendingCheckIns from the component
    return rejectWithValue('Check-in saved offline. Will retry when connected.');
  }
  return rejectWithValue(friendlyError(err));
}
```

After every successful scan/checkIn/lookup that adds to `recentVerifications`, persist:
```typescript
// In extraReducers after pushing to recentVerifications:
storageService.saveVerificationHistory(state.recentVerifications);
```

Note: Since reducers should be pure, move the persistence to the thunk's `.fulfilled` handler or use a listener middleware. Simplest approach: persist in the thunk itself after success.

**Step 2: Add offline queue count sync to uiSlice**

Add a thunk to `uiSlice.ts`:
```typescript
import { createAsyncThunk } from '@reduxjs/toolkit';
import { storageService } from '../../services/storageService';

export const syncPendingCount = createAsyncThunk('ui/syncPendingCount', async () => {
  const queue = await storageService.getOfflineQueue();
  return queue.length;
});
```

Handle in extraReducers:
```typescript
.addCase(syncPendingCount.fulfilled, (state, action) => {
  state.pendingCheckIns = action.payload;
})
```

**Step 3: Create OfflineQueueBadge component**

Create `apps/checker/src/components/common/OfflineQueueBadge.tsx`:

```tsx
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSelector } from 'react-redux';
import { RootState } from '../../store';
import { colors, spacing, borderRadius, typography } from '../../theme';

type Props = {
  onRetry: () => void;
};

export default function OfflineQueueBadge({ onRetry }: Props) {
  const { pendingCheckIns, isOnline } = useSelector((s: RootState) => s.ui);

  if (pendingCheckIns === 0) return null;

  return (
    <TouchableOpacity
      style={styles.container}
      onPress={onRetry}
      disabled={!isOnline}
      accessibilityRole="button"
      accessibilityLabel={`${pendingCheckIns} pending check-ins. Tap to retry.`}
    >
      <View style={styles.badge}>
        <Text style={styles.count}>{pendingCheckIns}</Text>
      </View>
      <Text style={styles.text}>
        pending check-in{pendingCheckIns > 1 ? 's' : ''}
      </Text>
      {isOnline && <Text style={styles.retry}>Tap to retry</Text>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    gap: spacing.sm,
  },
  badge: {
    backgroundColor: colors.warning,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { ...typography.caption, color: '#000', fontWeight: '700' },
  text: { ...typography.bodySmall, color: '#000', flex: 1 },
  retry: { ...typography.caption, color: colors.primary, fontWeight: '600' },
});
```

**Step 4: Commit**

```bash
git add apps/checker/src/store/slices/verificationSlice.ts apps/checker/src/store/slices/uiSlice.ts apps/checker/src/components/common/OfflineQueueBadge.tsx
git commit -m "feat(checker): integrate offline queue with verification slice and badge UI"
```

---

### Task 14: Add background sync and AppState listener

**Files:**
- Modify: `apps/checker/App.tsx`
- Modify: `apps/checker/src/screens/HomeScreen.tsx`

**Step 1: Add AppState + NetInfo foreground sync to App.tsx**

In `apps/checker/App.tsx`, add an AppState listener that flushes the offline queue when the app comes to foreground and is online:

```typescript
import { AppState, AppStateStatus } from 'react-native';
import { flushOfflineQueue } from './src/utils/offlineQueue';
import { syncPendingCount } from './src/store/slices/uiSlice';

// Inside App component:
const appState = useRef(AppState.currentState);

useEffect(() => {
  const sub = AppState.addEventListener('change', async (nextState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextState === 'active') {
      // App came to foreground — try flushing offline queue
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        await flushOfflineQueue();
        store.dispatch(syncPendingCount());
      }
    }
    appState.current = nextState;
  });
  return () => sub.remove();
}, []);
```

Also add a NetInfo listener that flushes the queue when connectivity is restored:

```typescript
useEffect(() => {
  let wasOffline = false;
  const unsubscribe = NetInfo.addEventListener(async (state) => {
    const online = state.isConnected ?? true;
    store.dispatch(setOnline(online));
    if (online && wasOffline) {
      // Just came back online — flush queue
      await flushOfflineQueue();
      store.dispatch(syncPendingCount());
    }
    wasOffline = !online;
  });
  return () => unsubscribe();
}, []);
```

This replaces the simpler NetInfo listener from Task 2.

**Step 2: Add OfflineQueueBadge to HomeScreen**

In `apps/checker/src/screens/HomeScreen.tsx`:

Import and render `OfflineQueueBadge` after the StatCard:

```tsx
import OfflineQueueBadge from '../components/common/OfflineQueueBadge';
import { flushOfflineQueue } from '../utils/offlineQueue';
import { syncPendingCount } from '../store/slices/uiSlice';

// In the component:
const handleRetryQueue = useCallback(async () => {
  await flushOfflineQueue();
  dispatch(syncPendingCount());
  dispatch(loadTodayCount());
}, [dispatch]);

// In render, after StatCard:
<OfflineQueueBadge onRetry={handleRetryQueue} />
```

Also dispatch `syncPendingCount()` on mount alongside `loadTodayCount()`:
```typescript
useEffect(() => {
  dispatch(loadTodayCount());
  dispatch(syncPendingCount());
}, [dispatch]);
```

**Step 3: Commit**

```bash
git add apps/checker/App.tsx apps/checker/src/screens/HomeScreen.tsx
git commit -m "feat(checker): add background sync and offline queue retry in HomeScreen"
```

---

### Task 15: Persistent verification history

**Files:**
- Modify: `apps/checker/src/store/slices/verificationSlice.ts`

**Step 1: Load history on app start and persist on changes**

In `apps/checker/src/store/slices/verificationSlice.ts`:

Add `loadHistory` thunk:
```typescript
export const loadHistory = createAsyncThunk('verification/loadHistory', async () => {
  return storageService.getVerificationHistory();
});
```

Handle in extraReducers:
```typescript
.addCase(loadHistory.fulfilled, (state, action) => {
  // Merge: keep existing in-memory records, fill with stored history
  if (state.recentVerifications.length === 0 && action.payload.length > 0) {
    state.recentVerifications = action.payload.slice(0, MAX_RECENT);
  }
})
```

In every thunk that adds to `recentVerifications` (scanQR.fulfilled, checkIn.fulfilled, lookupManual.fulfilled), add a persistence call. Since we can't call async functions in reducers, the best approach is to persist inside the thunk itself (after the API call succeeds) or use a Redux listener middleware.

Simplest approach — add persistence in the thunks themselves:

In `scanQR` fulfilled section of the thunk:
```typescript
// After getting the result:
const record: VerificationRecord = {
  outcome: 'success',
  result: data,
  checkIn: null,
  error: null,
  timestamp: new Date().toISOString(),
};
// Persist (fire-and-forget)
const history = await storageService.getVerificationHistory();
history.unshift(record);
await storageService.saveVerificationHistory(history);
return data;
```

Same pattern for `checkIn` and `lookupManual`.

**Step 2: Dispatch loadHistory on HomeScreen mount**

In `HomeScreen.tsx`, dispatch `loadHistory` alongside other loads:
```typescript
useEffect(() => {
  dispatch(loadTodayCount());
  dispatch(syncPendingCount());
  dispatch(loadHistory());
}, [dispatch]);
```

**Step 3: Commit**

```bash
git add apps/checker/src/store/slices/verificationSlice.ts apps/checker/src/screens/HomeScreen.tsx
git commit -m "feat(checker): persistent verification history across app restarts"
```

---

### Task 16: Final review and version bump

**Files:**
- Modify: `apps/checker/app.json`
- Modify: `apps/checker/package.json`

**Step 1: Verify all changes work together**

Run:
```bash
cd apps/checker && npx expo start
```

Test the following flows:
- [ ] App launches → splash → login
- [ ] Login with valid credentials
- [ ] HomeScreen shows network banner when offline
- [ ] Scan QR code → verify → haptic feedback
- [ ] Manual entry → lookup → verify
- [ ] Disable network → buttons disabled, offline banner shows
- [ ] Attempt check-in offline → queued, badge appears
- [ ] Re-enable network → queue flushes, badge disappears
- [ ] Kill and reopen app → history persists
- [ ] Session expiry → redirected to login with message
- [ ] Logout → backend token revoked

**Step 2: Final commit**

```bash
git add -A
git commit -m "feat(checker): Play Store readiness - UX polish, security, offline resilience"
```

---

## Summary

| Phase | Tasks | Focus |
|-------|-------|-------|
| 1 | 1-7 | UX polish: network banner, retry logic, error messages, accessibility, scanner UX, versioning |
| 2 | 8-11 | Security: Sentry, proper logout, session expiry, cert pinning, haptics |
| 3 | 12-16 | Offline: queue utility, verification slice integration, background sync, persistent history |

**New dependencies:** `@react-native-community/netinfo`, `@sentry/react-native`

**New files (6):**
- `src/store/slices/uiSlice.ts`
- `src/components/common/NetworkBanner.tsx`
- `src/components/common/OfflineQueueBadge.tsx`
- `src/utils/errorMessages.ts`
- `src/utils/offlineQueue.ts`

**Modified files (13):**
- `App.tsx`, `app.json`, `package.json`
- `src/store/index.ts`
- `src/store/slices/authSlice.ts`, `src/store/slices/verificationSlice.ts`
- `src/services/api.ts`, `src/services/authService.ts`, `src/services/storageService.ts`
- `src/screens/HomeScreen.tsx`, `src/screens/QRScannerScreen.tsx`, `src/screens/LoginScreen.tsx`, `src/screens/SplashScreen.tsx`
- `src/components/common/Button.tsx`, `src/components/common/StatCard.tsx`, `src/components/ticket/TicketDetailsModal.tsx`
