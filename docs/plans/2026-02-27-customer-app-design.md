# SSMSPL Customer App — Design Document

**Date:** 2026-02-27
**Status:** Approved

## Overview

Build a customer-facing React Native mobile app for SSMSPL's ferry boat ticketing system, enabling passengers to register, book ferry tickets, make payments, view bookings with QR codes, and manage their profiles. The app mirrors the legacy `jetty-customer-rn` app's features using the same architecture patterns as the existing `apps/checker` app, and connects to the existing SSMSPL FastAPI backend.

## Architecture

**Approach:** Mirror checker app architecture — independent Expo app at `apps/customer/` with identical tech stack (Expo 54, React 19, RN 0.81.5, Redux Toolkit, TypeScript, Axios).

**Why:** Same patterns across apps means consistent quality, shared team knowledge, and fastest build path. Apps have different distribution channels (Play Store for customers, internal for checkers), so a combined app would be bloated and hard to maintain.

## App Structure

```
apps/customer/
├── App.tsx                          # Root: Redux Provider, Navigation, Network listeners
├── app.json                         # Expo config (name, API URL, SabPaisa config)
├── package.json
├── tsconfig.json
├── index.ts
├── assets/                          # logo.png, logo-white.png
└── src/
    ├── screens/
    │   ├── auth/
    │   │   ├── SplashScreen.tsx          # 2-sec branding, auth check
    │   │   ├── LoginScreen.tsx           # Email/password + Google Sign-In
    │   │   ├── RegisterScreen.tsx        # Name, email, mobile, password
    │   │   ├── OTPScreen.tsx             # 6-digit OTP verification
    │   │   ├── ForgotPasswordScreen.tsx  # Enter email
    │   │   ├── ForgotPasswordOTPScreen.tsx # Verify OTP
    │   │   └── ResetPasswordScreen.tsx   # New password
    │   └── main/
    │       ├── HomeScreen.tsx            # Welcome, quick actions, upcoming trips
    │       ├── BookingScreen.tsx         # 3-step booking form
    │       ├── BookingsListScreen.tsx    # Filterable booking list
    │       ├── BookingDetailScreen.tsx   # Full ticket + QR code
    │       ├── ProfileScreen.tsx         # Info card + settings menu
    │       ├── EditProfileScreen.tsx     # Edit name, mobile, avatar
    │       └── ChangePasswordScreen.tsx  # Old + new password
    ├── navigation/
    │   ├── RootNavigator.tsx             # Auth check → Auth or Main
    │   ├── AuthNavigator.tsx             # Stack navigator for auth screens
    │   └── MainNavigator.tsx             # Bottom tabs with nested stacks
    ├── components/
    │   ├── common/
    │   │   ├── Button.tsx                # Multi-variant (primary, outline, danger, secondary)
    │   │   ├── Card.tsx                  # Container with shadow
    │   │   ├── Input.tsx                 # Text field with label, password toggle
    │   │   ├── Loading.tsx               # Spinner + message
    │   │   ├── NetworkBanner.tsx         # Offline warning
    │   │   └── StatCard.tsx              # Stat display
    │   └── booking/
    │       ├── BookingStepIndicator.tsx   # Step 1-2-3 progress
    │       ├── ItemSelector.tsx           # Categorized item picker with quantity stepper
    │       ├── BookingSummary.tsx         # Review card before payment
    │       ├── TicketCard.tsx             # Booking card for list view
    │       └── QRTicket.tsx              # QR code display for booking detail
    ├── services/
    │   ├── api.ts                        # Axios: token injection, 401 refresh, retry
    │   ├── authService.ts                # Register, OTP, login, Google, profile, password
    │   ├── bookingService.ts             # Branches, routes, items, rates, CRUD bookings
    │   ├── paymentService.ts             # SabPaisa integration (placeholder)
    │   └── storageService.ts             # SecureStore + AsyncStorage
    ├── store/
    │   ├── index.ts                      # configureStore
    │   └── slices/
    │       ├── authSlice.ts              # Customer auth & profile state
    │       ├── bookingSlice.ts           # Booking form + list + history
    │       └── appSlice.ts               # Online status, theme, language
    ├── types/
    │   ├── models.ts                     # Customer, Booking, BookingItem, Branch, etc.
    │   ├── api.ts                        # API response types
    │   ├── navigation.ts                 # Navigation param types
    │   └── index.ts
    ├── theme/
    │   ├── colors.ts                     # Ocean-blue palette (dynamic theme support)
    │   ├── spacing.ts                    # Spacing + border radius scale
    │   ├── typography.ts                 # Font sizes & weights
    │   └── index.ts
    ├── utils/
    │   ├── errorMessages.ts              # Friendly error mapper
    │   ├── validators.ts                 # Email, password, phone validation
    │   └── logger.ts                     # Dev-only logger
    └── i18n/
        ├── en.ts                         # English translations
        ├── mr.ts                         # Marathi translations
        └── index.ts                      # i18n setup + translation function
```

## Navigation

```
RootNavigator
├── AuthNavigator (Stack)
│   ├── Splash → (auto-navigates based on auth)
│   ├── Login
│   ├── Register
│   ├── OTP
│   ├── ForgotPassword
│   ├── ForgotPasswordOTP
│   └── ResetPassword
│
└── MainNavigator (Bottom Tabs)
    ├── Home Tab (Stack)
    │   ├── HomeScreen
    │   └── BookingScreen
    ├── Bookings Tab (Stack)
    │   ├── BookingsListScreen
    │   └── BookingDetailScreen
    └── Profile Tab (Stack)
        ├── ProfileScreen
        ├── EditProfileScreen
        └── ChangePasswordScreen
```

## Booking Flow

### Step 1 — Route Selection
- Select "From" branch (required) → `GET /api/bookings/branches`
- Select "To" branch (optional) → `GET /api/bookings/to-branches/{from_id}`
- Auto-loads items + rates for selected route

### Step 2 — Date, Ferry & Time
- Date picker: today → 30 days ahead
- Ferry selection from available boats
- Departure time → `GET /api/bookings/schedules/{branch_id}`
- Smart filter: hide past times when date is today

### Step 3 — Items & Quantities
- Categorized: Passengers | Vehicles | Others
- Items filtered by `online_visibility` flag
- Quantity stepper (+/-) per item
- Real-time total from rates
- Vehicle number input for vehicle items

### Summary → Payment
- Review: route, date, time, items, total
- "Pay ₹XXX" → SabPaisa checkout
- On success → `POST /api/portal/bookings` with payment ref
- Confirmation → "View Booking"

## Payment (SabPaisa)

**Integration approach:** Placeholder service with defined interface. Dev mode uses simulated payment. When API keys arrive, swap in real SabPaisa SDK/web checkout calls.

**Endpoints:**
- `POST /api/portal/payment/create-order` — Create payment order
- `POST /api/portal/payment/verify` — Verify payment callback
- `GET /api/portal/payment/config` — Client configuration

**Flow:** App → create order → redirect to SabPaisa → callback → verify server-side → confirm booking

## Backend Changes

### New Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| PUT | `/api/portal/auth/profile` | Update customer profile |
| POST | `/api/portal/auth/profile/picture` | Upload profile picture |
| POST | `/api/portal/auth/change-password` | Change password |
| POST | `/api/portal/auth/google-signin` | Google Sign-In |
| GET | `/api/portal/theme` | Get active theme colors |
| POST | `/api/portal/payment/create-order` | Create SabPaisa order |
| POST | `/api/portal/payment/verify` | Verify payment |
| GET | `/api/portal/payment/config` | Payment client config |

### Modified Endpoints

- `GET /api/portal/auth/me` — Include profile picture URL in response

### New Services

- `portal_profile_service.py` — Profile update, picture storage
- `sabpaisa_service.py` — SabPaisa payment integration (placeholder)

### Database Migration

- Add `google_id VARCHAR(255)` column to `portal_users` table

## Theme & Branding

### Default Colors (Ocean Blue — matches legacy)
```
Primary: #006994
Primary Dark: #004A6B
Primary Light: #00A8E8
Accent: #00D4FF
Gradient: ['#006994', '#00A8E8']
Status: success=#4CAF50, error=#F44336, warning=#FF9800, info=#2196F3
```

### Dynamic Theming
- App fetches `GET /api/portal/theme` on launch
- Returns color overrides from `company.active_theme` DB field
- Admin can change theme from portal for festivals/schemes
- Cached locally, refreshed on app open
- Falls back to default ocean-blue on failure

## Internationalization (i18n)

- English + Marathi (मराठी)
- Key-value translation files in `src/i18n/`
- Language preference in AsyncStorage
- Toggle in Profile screen
- All user-facing strings go through `t('key')` function

## Auth Flow

### Registration
Email + name + mobile + password → `POST /register` → OTP email → `POST /verify-email` → auto-login

### Login
- Email/password → `POST /login` → tokens + customer data
- Google Sign-In → `POST /google-signin` → tokens + customer data (creates account if new)

### Token Management
- Access token (30 min) + refresh token (7 days)
- Axios interceptor: inject Bearer token, auto-refresh on 401
- SecureStore for tokens, AsyncStorage for profile cache

### Password Reset
Enter email → `POST /forgot-password` → OTP → `POST /reset-password`

## Offline & Error Handling

- NetInfo network detection with offline banner
- Cached booking list for offline viewing
- Friendly error messages mapped from HTTP/network errors
- Retry with exponential backoff (3 attempts) on 5xx/network errors
- Same patterns as checker app

## Dependencies

Same as checker app + additions for customer features:
- `@react-navigation/bottom-tabs` — Tab navigation
- `react-native-qrcode-svg` + `react-native-svg` — QR code display
- `expo-image-picker` — Profile picture upload
- `expo-auth-session` + `expo-web-browser` + `expo-crypto` — Google Sign-In
- `date-fns` — Date formatting/manipulation
- `@react-native-community/netinfo` — Network status

## Key Patterns (same as checker)

- **Data flow:** Screen → dispatch thunk → Service → API → Slice → Screen re-render
- **Auth:** JWT Bearer via axios interceptor, auto-refresh, SecureStore
- **Error handling:** Thunks catch errors → `rejectWithValue(friendlyError(err))`
- **Components:** Pure UI with props/callbacks, no direct store access in common components
- **Services:** Thin API wrappers, no business logic
- **Slices:** State shape + reducers + async thunks
