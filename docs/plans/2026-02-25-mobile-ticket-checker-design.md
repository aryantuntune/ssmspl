# Mobile Ticket Checker App — Design Document

**Date**: 2026-02-25
**Status**: Approved

## Overview

A new Expo/React Native mobile app for TICKET_CHECKER users to scan and verify ferry tickets via QR code. Replaces the legacy `jetty-checker-rn` app, rebuilt from scratch to work with the current SSMSPL backend APIs.

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Approach | Rebuild from scratch | Legacy app targets non-existent endpoints; current backend has complete verification APIs |
| Auth | New `/api/auth/mobile-login` endpoint | RN can't use HttpOnly cookies; returns JWT in JSON body |
| Role access | TICKET_CHECKER only | Keeps app focused; other roles use web dashboard |
| Scan flow | Two-step (scan → confirm) | Prevents accidental verification; lets checker inspect details |
| Location | `apps/checker/` | `apps/` directory supports future customer app alongside |
| UI theme | Legacy app's indigo design | Proven in the field, familiar to checkers |
| Offline | Not supported | Every scan requires server call; show clear error when offline |

## Tech Stack

- Expo ~54, React Native 0.81+, React 19
- TypeScript strict mode
- Redux Toolkit for state management
- Axios with interceptor-based token refresh
- expo-camera for QR scanning
- expo-secure-store for encrypted token storage
- expo-haptics for scan feedback
- React Navigation (native stack)

## Project Structure

```
apps/checker/
├── app.json
├── package.json
├── tsconfig.json
├── index.ts
├── App.tsx
└── src/
    ├── screens/
    │   ├── SplashScreen.tsx
    │   ├── LoginScreen.tsx
    │   ├── HomeScreen.tsx
    │   └── QRScannerScreen.tsx
    ├── components/
    │   ├── common/          # Button, Input, Card, Loading, StatCard
    │   └── ticket/          # TicketDetailsModal, VerificationBadge
    ├── services/
    │   ├── api.ts           # Axios instance
    │   ├── authService.ts   # mobile-login, refresh, me
    │   ├── verificationService.ts  # scan, check-in, manual lookup
    │   └── storageService.ts       # expo-secure-store + AsyncStorage
    ├── store/
    │   ├── index.ts
    │   └── slices/
    │       ├── authSlice.ts
    │       └── verificationSlice.ts
    ├── theme/               # Colors, spacing, typography
    ├── types/               # TypeScript interfaces
    └── utils/               # Logger, helpers
```

## Backend Changes

### POST /api/auth/mobile-login

Same validation as existing login. Rejects non-TICKET_CHECKER roles with 403. Returns tokens in JSON body:

```json
{
  "access_token": "eyJ...",
  "refresh_token": "eyJ...",
  "token_type": "bearer",
  "user": {
    "id": "uuid",
    "full_name": "Name",
    "email": "email",
    "role": "TICKET_CHECKER",
    "route_id": 1,
    "route_name": "Location A - Location B"
  }
}
```

### POST /api/auth/mobile-refresh

Accepts `{ refresh_token }` in body. Returns new token pair.

### Existing verification endpoints — no changes

- `GET /api/verification/scan?payload=` — QR lookup with HMAC validation
- `POST /api/verification/check-in` — verify/check-in a ticket
- `GET /api/verification/booking-number` — manual booking lookup
- `GET /api/verification/ticket` — manual ticket lookup

## Screens

### SplashScreen
- Logo + loading spinner
- Reads token from secure store
- Validates with GET /api/auth/me
- Routes to Login or Home

### LoginScreen
- Email + password form
- Validates email format and password length
- Shows error for non-TICKET_CHECKER roles
- On success: stores tokens, navigates to Home

### HomeScreen
- Header: app title, checker name, location badge, logout
- Date display
- "Verified Today" count card (local counter, resets daily)
- Action buttons: "Scan QR Code" (primary), "Manual Entry" (secondary)
- Recent verifications list (last 5)
- Pull-to-refresh
- Manual entry modal: tab toggle Booking/Ticket, number input

### QRScannerScreen
- Full-screen camera with scanner frame overlay
- Flash toggle, close button
- On scan: parse HMAC payload → GET /api/verification/scan
- TicketDetailsModal shows: route, passengers, amount, date, departure, status
- CONFIRMED → "Verify Passenger" button → POST /api/verification/check-in
- VERIFIED → "Already Verified" with who/when
- CANCELLED/PENDING → appropriate message
- Haptic feedback per outcome
- "Scan Next" to continue

## Auth Flow

```
App Start → Read token from secure store
  → Exists: GET /api/auth/me
    → 200: Home
    → 401: Try mobile-refresh → fail: Login
  → None: Login

Axios 401 interceptor:
  → Queue request
  → POST /api/auth/mobile-refresh
  → Success: update tokens, retry queue
  → Failure: clear storage, navigate to Login
```

## Out of Scope

- Offline scanning / queue
- Push notifications
- Analytics
- Multi-language
- Biometric login
- Dark mode
