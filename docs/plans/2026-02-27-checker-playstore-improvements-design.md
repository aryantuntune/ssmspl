# Checker App Play Store Improvements — Design

**Date:** 2026-02-27
**Status:** Approved
**Scope:** UX polish, security hardening, offline resilience for Play Store release

## Context

The SSMSPL Checker app is a functional MVP for ferry ticket verification (QR scanning + manual entry). It has clean architecture (screens/components/services/Redux) and works end-to-end. However, it needs production hardening before Play Store publication.

Checkers operate primarily at terminals/ports with decent connectivity, but brief drops can occur.

## Phase 1: UX Polish & Reliability

### Network Status Indicator
- Thin banner at top of HomeScreen/QRScanner when device is offline
- Uses `@react-native-community/netinfo` for connectivity detection
- Warning-colored bar: "No internet connection"
- Auto-dismisses when connectivity returns
- QR scanner disables scanning with message when offline

### Retry Logic & Timeout
- Increase Axios timeout: 15s → 30s
- Automatic retry with exponential backoff (1s, 2s, 4s — max 3 attempts) for 5xx and network errors
- No retry on 4xx (intentional rejections)
- Implemented in Axios response interceptor

### User-Friendly Error Messages
- Map raw API errors to human-readable messages:
  - "Network Error" → "Unable to connect. Please check your internet."
  - Timeout → "Request timed out. Please try again."
  - 500 → "Something went wrong. Please try again later."
- Display in dismissible banner, not alerts

### Loading & Empty States
- StatCard skeleton/shimmer while loading count
- Themed pull-to-refresh indicator
- Better empty state text for recent verifications

### Accessibility
- `accessibilityLabel` and `accessibilityRole` on all buttons, inputs, interactive elements
- Minimum 44x44pt touch targets
- `accessibilityHint` on key actions ("Opens camera to scan QR code")

### QR Scanner UX
- Instructional text below scan frame: "Align QR code within the frame"
- Replace emoji flash icons with text-based icons
- Subtle pulse animation on scan frame corners

### Versioning
- Set `versionCode: 1` in app.json for Android build tracking

## Phase 2: Security & Stability

### Sentry Crash Reporting
- Install `@sentry/react-native`
- Initialize in App.tsx with DSN from app.json extra config
- Wrap navigator in Sentry error boundary
- Auto crash/ANR reporting with navigation breadcrumbs
- Tag events with user role + route

### Proper Backend Logout
- On mobile logout, POST to `/api/auth/logout` with refresh token in body
- Currently only clears local storage — tokens remain valid server-side

### Session Expiry Handling
- When 401 interceptor fails to refresh (refresh token expired), dispatch `resetAuth()`
- Show banner: "Session expired. Please log in again." before redirecting to Login

### Certificate Pinning
- SSL pinning for `api.carferry.online` via `expo-cert-pinner` or native config
- Pin leaf certificate SHA-256
- Skip in dev builds, enforce in production only

### Haptic Feedback
- Success haptic on successful verification
- Error haptic on failed verification
- Light haptic on main action button presses (Scan, Verify)

## Phase 3: Offline Resilience

### Connection-Aware UI
- Track connectivity in Redux (`network` slice or `ui` slice field)
- When offline: disable Scan/Manual buttons with "Requires internet" tooltip
- Persistent offline banner until reconnected

### Offline Check-In Queue
- On network failure during `checkIn`, store pending check-in in AsyncStorage:
  - `{ verificationCode, timestamp, retryCount }`
- On connectivity restore (NetInfo event), auto-retry queued check-ins
- HomeScreen badge: "N pending check-ins" with manual retry option
- Max 3 auto-retries per item, then surface to user

### Persistent Verification History
- Store last 50 verifications in AsyncStorage
- Load on app start, merge with new verifications
- Survives app restart for cross-session history review
- Prune entries older than 7 days on launch

### Background Sync
- On app foreground (AppState listener) + online: flush offline queue
- Sync daily count with offline-processed check-ins

## New Dependencies

| Package | Purpose | Phase |
|---------|---------|-------|
| `@react-native-community/netinfo` | Connectivity detection | 1 |
| `@sentry/react-native` | Crash reporting | 2 |
| `expo-cert-pinner` (or native config) | SSL pinning | 2 |

## Files Affected

### New Files
- `src/hooks/useNetInfo.ts` — connectivity hook
- `src/store/slices/uiSlice.ts` — network state, offline queue
- `src/utils/errorMessages.ts` — error message mapping
- `src/utils/offlineQueue.ts` — offline check-in queue logic
- `src/components/common/NetworkBanner.tsx` — offline indicator
- `src/components/common/OfflineQueueBadge.tsx` — pending check-ins badge

### Modified Files
- `App.tsx` — Sentry init, AppState listener, NetInfo setup
- `src/services/api.ts` — retry logic, timeout, cert pinning, session expiry
- `src/store/slices/authSlice.ts` — proper logout API call, session expiry
- `src/store/slices/verificationSlice.ts` — persistent history, offline queue integration
- `src/screens/HomeScreen.tsx` — network banner, offline badge, accessibility, loading states
- `src/screens/QRScannerScreen.tsx` — network-aware scanning, accessibility, UX improvements
- `src/screens/LoginScreen.tsx` — accessibility labels
- `src/screens/SplashScreen.tsx` — accessibility labels
- `src/components/common/Button.tsx` — haptic feedback, accessibility
- `src/components/common/StatCard.tsx` — loading skeleton
- `src/components/ticket/TicketDetailsModal.tsx` — haptic on verify, better error display
- `src/services/storageService.ts` — persistent history storage, offline queue storage
- `app.json` — versionCode, Sentry DSN config
- `package.json` — new dependencies
