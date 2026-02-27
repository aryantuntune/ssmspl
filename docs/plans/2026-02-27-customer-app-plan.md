# SSMSPL Customer App — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a customer-facing React Native mobile app (apps/customer) and the backend API additions needed to support it, providing full feature parity with the legacy jetty-customer-rn app.

**Architecture:** Mirror the existing apps/checker architecture — Expo 54, React 19, Redux Toolkit, TypeScript, axios with interceptors. Backend additions follow existing FastAPI patterns (routers → services → models). Portal auth already exists; we add mobile-login, profile management, Google Sign-In, SabPaisa payment placeholder, and a public theme endpoint.

**Tech Stack:** React Native 0.81.5 / Expo 54 / Redux Toolkit 2.11 / TypeScript 5.9 / @react-navigation 7 (stack + bottom-tabs) / axios / expo-secure-store / FastAPI / SQLAlchemy 2.0 async / PostgreSQL 16

---

## Phase 1: Backend API Additions

### Task 1: Add mobile-login endpoint for portal users

The existing portal auth only returns tokens via HttpOnly cookies (designed for web). The mobile app needs tokens in the JSON response body, like the checker's `/api/auth/mobile-login`.

**Files:**
- Modify: `backend/app/routers/portal_auth.py`
- Modify: `backend/app/schemas/portal_user.py`

**Step 1: Add schema for mobile login response**

In `backend/app/schemas/portal_user.py`, add at the end:

```python
class PortalUserMobileLoginResponse(BaseModel):
    access_token: str = Field(..., description="JWT access token")
    refresh_token: str = Field(..., description="JWT refresh token")
    token_type: str = Field(default="bearer")
    user: PortalUserMeResponse
```

**Step 2: Add mobile-login endpoint**

In `backend/app/routers/portal_auth.py`, add this import at the top:

```python
from app.schemas.portal_user import PortalUserMobileLoginResponse
```

Then add this endpoint after the existing `login` endpoint:

```python
@router.post(
    "/mobile-login",
    response_model=PortalUserMobileLoginResponse,
    summary="Mobile app login for portal user",
    description="Authenticate a customer for the mobile app. Returns tokens in JSON body (no cookies).",
    responses={
        200: {"description": "Successfully authenticated"},
        401: {"description": "Invalid email or password"},
        403: {"description": "Email not verified"},
    },
)
@limiter.limit("10/minute")
async def mobile_login(request: Request, body: PortalUserLogin, background_tasks: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    tokens = await portal_auth_service.login(db, body.email, body.password)
    if random.random() < 0.05:
        background_tasks.add_task(cleanup_expired_background)

    # Fetch user for response
    result = await db.execute(
        __import__("sqlalchemy").select(PortalUser).where(PortalUser.email == body.email)
    )
    user = result.scalar_one()

    return PortalUserMobileLoginResponse(
        access_token=tokens["access_token"],
        refresh_token=tokens["refresh_token"],
        user=PortalUserMeResponse(
            id=user.id,
            first_name=user.first_name,
            last_name=user.last_name,
            email=user.email,
            mobile=user.mobile,
            is_verified=user.is_verified,
            created_at=user.created_at,
            full_name=f"{user.first_name} {user.last_name}",
        ),
    )
```

Note: Clean up the import — use `from sqlalchemy import select` at top instead of inline `__import__`. The select is already imported in the service; we just need it in the router too.

**Step 3: Add mobile-refresh endpoint**

Add after mobile-login:

```python
@router.post(
    "/mobile-refresh",
    summary="Refresh portal user access token (mobile)",
    description="Exchange a refresh token for new tokens. Returns tokens in JSON body.",
    responses={
        200: {"description": "New token pair issued"},
        401: {"description": "Invalid or expired refresh token"},
    },
)
@limiter.limit("20/minute")
async def mobile_refresh(request: Request, body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    tokens = await portal_auth_service.refresh_access_token(db, body.refresh_token)
    return {
        "access_token": tokens["access_token"],
        "refresh_token": tokens["refresh_token"],
        "token_type": "bearer",
    }
```

**Step 4: Verify**

Run: `cd backend && python -c "from app.routers.portal_auth import router; print('OK')"`

**Step 5: Commit**

```bash
git add backend/app/routers/portal_auth.py backend/app/schemas/portal_user.py
git commit -m "feat: add mobile-login and mobile-refresh endpoints for portal users"
```

---

### Task 2: Add profile update, change password, and profile picture endpoints

**Files:**
- Modify: `backend/app/routers/portal_auth.py`
- Modify: `backend/app/schemas/portal_user.py`
- Modify: `backend/app/services/portal_auth_service.py`

**Step 1: Add schemas**

In `backend/app/schemas/portal_user.py`, add:

```python
class PortalUserProfileUpdate(BaseModel):
    first_name: str | None = Field(None, max_length=60)
    last_name: str | None = Field(None, max_length=60)
    mobile: str | None = Field(None, max_length=60)


class PortalUserChangePassword(BaseModel):
    old_password: str = Field(..., description="Current password")
    new_password: str = Field(..., min_length=8, description="New password")

    @field_validator("new_password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password_complexity(v)
```

**Step 2: Add service functions**

In `backend/app/services/portal_auth_service.py`, add:

```python
async def update_profile(db: AsyncSession, user_id: int, first_name: str | None, last_name: str | None, mobile: str | None) -> PortalUser:
    result = await db.execute(select(PortalUser).where(PortalUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if first_name is not None:
        user.first_name = first_name
    if last_name is not None:
        user.last_name = last_name
    if mobile is not None:
        user.mobile = mobile
    await db.commit()
    await db.refresh(user)
    return user


async def change_password(db: AsyncSession, user_id: int, old_password: str, new_password: str) -> None:
    result = await db.execute(select(PortalUser).where(PortalUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not verify_password(old_password, user.password):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
    user.password = get_password_hash(new_password)
    await db.commit()
```

**Step 3: Add router endpoints**

In `backend/app/routers/portal_auth.py`, add imports:

```python
from app.schemas.portal_user import PortalUserProfileUpdate, PortalUserChangePassword
```

Add endpoints:

```python
@router.put(
    "/profile",
    response_model=PortalUserMeResponse,
    summary="Update portal user profile",
)
async def update_profile(
    body: PortalUserProfileUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    user = await portal_auth_service.update_profile(
        db, current_user.id, body.first_name, body.last_name, body.mobile
    )
    return PortalUserMeResponse(
        id=user.id, first_name=user.first_name, last_name=user.last_name,
        email=user.email, mobile=user.mobile, is_verified=user.is_verified,
        created_at=user.created_at, full_name=f"{user.first_name} {user.last_name}",
    )


@router.post(
    "/change-password",
    summary="Change portal user password",
)
async def change_password(
    body: PortalUserChangePassword,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    await portal_auth_service.change_password(db, current_user.id, body.old_password, body.new_password)
    return {"message": "Password changed successfully"}
```

**Step 4: Commit**

```bash
git add backend/app/routers/portal_auth.py backend/app/schemas/portal_user.py backend/app/services/portal_auth_service.py
git commit -m "feat: add profile update and change password endpoints for portal users"
```

---

### Task 3: Add public theme endpoint

**Files:**
- Modify: `backend/app/routers/company.py`

**Step 1: Add theme endpoint**

The company router already exists. Add a public endpoint that doesn't require auth:

```python
@router.get(
    "/theme",
    summary="Get active app theme (public)",
    description="Returns the active theme identifier. No authentication required.",
)
async def get_theme(db: AsyncSession = Depends(get_db)):
    company = await company_service.get_company(db)
    themes = {
        "ocean": {
            "primary": "#006994",
            "primaryDark": "#004A6B",
            "primaryLight": "#00A8E8",
            "accent": "#00D4FF",
            "gradient": ["#006994", "#00A8E8"],
        },
        "default": {
            "primary": "#006994",
            "primaryDark": "#004A6B",
            "primaryLight": "#00A8E8",
            "accent": "#00D4FF",
            "gradient": ["#006994", "#00A8E8"],
        },
    }
    active = company.active_theme if company and company.active_theme else "ocean"
    return {"theme_name": active, "colors": themes.get(active, themes["ocean"])}
```

Check `company.py` router prefix and add this endpoint accordingly. The current company router requires admin auth — this theme endpoint should be unauthenticated. You may need to create a small separate router or add it without the auth dependency.

**Step 2: Commit**

```bash
git add backend/app/routers/company.py
git commit -m "feat: add public theme endpoint for mobile app"
```

---

### Task 4: Add SabPaisa payment placeholder

**Files:**
- Create: `backend/app/routers/portal_payment.py`
- Create: `backend/app/services/sabpaisa_service.py`
- Modify: `backend/app/main.py` (register router)
- Modify: `backend/app/config.py` (add SabPaisa config)

**Step 1: Add config**

In `backend/app/config.py`, in the Settings class, add:

```python
    # SabPaisa
    SABPAISA_CLIENT_CODE: str = ""
    SABPAISA_AUTH_KEY: str = ""
    SABPAISA_AUTH_IV: str = ""
    SABPAISA_BASE_URL: str = "https://securepay.sabpaisa.in"
```

**Step 2: Create service placeholder**

Create `backend/app/services/sabpaisa_service.py`:

```python
"""
SabPaisa payment gateway integration.
Placeholder until API keys are provisioned.
"""
from app.config import settings


def is_configured() -> bool:
    return bool(settings.SABPAISA_CLIENT_CODE and settings.SABPAISA_AUTH_KEY)


async def create_order(amount: float, booking_id: int, customer_email: str) -> dict:
    """Create a SabPaisa payment order. Returns order details for the mobile SDK."""
    if not is_configured():
        # Dev mode: return simulated order
        return {
            "order_id": f"SIM_{booking_id}",
            "amount": amount,
            "status": "simulated",
            "payment_url": None,
            "message": "SabPaisa not configured. Using simulated payment.",
        }
    # TODO: Implement real SabPaisa API call when keys are available
    raise NotImplementedError("SabPaisa integration pending API keys")


async def verify_payment(transaction_id: str, order_id: str) -> dict:
    """Verify a SabPaisa payment callback."""
    if not is_configured():
        return {"verified": True, "status": "simulated"}
    # TODO: Implement real verification
    raise NotImplementedError("SabPaisa integration pending API keys")
```

**Step 3: Create router**

Create `backend/app/routers/portal_payment.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_portal_user
from app.models.portal_user import PortalUser
from app.services import sabpaisa_service, booking_service


router = APIRouter(prefix="/api/portal/payment", tags=["Portal Payment"])


class CreateOrderRequest(BaseModel):
    booking_id: int = Field(..., description="Booking ID to pay for")


class VerifyPaymentRequest(BaseModel):
    transaction_id: str = Field(..., description="SabPaisa transaction ID")
    order_id: str = Field(..., description="Order ID returned by create-order")
    booking_id: int = Field(..., description="Booking ID")


@router.get("/config", summary="Get payment gateway config")
async def payment_config():
    return {
        "gateway": "sabpaisa",
        "configured": sabpaisa_service.is_configured(),
    }


@router.post("/create-order", summary="Create a payment order")
async def create_order(
    body: CreateOrderRequest,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    booking = await booking_service.get_booking_by_id(db, body.booking_id, current_user.id)
    if booking["status"] != "PENDING":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Booking is not in PENDING status")
    return await sabpaisa_service.create_order(booking["net_amount"], body.booking_id, current_user.email)


@router.post("/verify", summary="Verify payment and confirm booking")
async def verify_payment(
    body: VerifyPaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: PortalUser = Depends(get_current_portal_user),
):
    result = await sabpaisa_service.verify_payment(body.transaction_id, body.order_id)
    if result.get("verified"):
        confirmed = await booking_service.confirm_booking_payment(db, body.booking_id, current_user.id)
        return {"message": "Payment verified, booking confirmed", "booking": confirmed}
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Payment verification failed")
```

**Step 4: Register router in main.py**

In `backend/app/main.py`, add:

```python
from app.routers import portal_payment
```

And add `app.include_router(portal_payment.router)` after the other router includes.

**Step 5: Commit**

```bash
git add backend/app/routers/portal_payment.py backend/app/services/sabpaisa_service.py backend/app/main.py backend/app/config.py
git commit -m "feat: add SabPaisa payment placeholder router and service"
```

---

### Task 5: Add google_id column to portal_users

**Files:**
- Modify: `backend/app/models/portal_user.py`
- Create: Alembic migration

**Step 1: Add column to model**

In `backend/app/models/portal_user.py`, add after the `mobile` field:

```python
    google_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True, index=True)
```

**Step 2: Create migration**

```bash
cd backend
alembic revision --autogenerate -m "add google_id to portal_users"
alembic upgrade head
```

**Step 3: Add Google Sign-In service function**

In `backend/app/services/portal_auth_service.py`, add:

```python
async def google_signin(db: AsyncSession, google_id: str, email: str, first_name: str, last_name: str) -> dict:
    """Handle Google Sign-In. Creates account if new, logs in if existing."""
    # Check by google_id first
    result = await db.execute(select(PortalUser).where(PortalUser.google_id == google_id))
    user = result.scalar_one_or_none()

    if not user:
        # Check by email (user may have registered with email first)
        result = await db.execute(select(PortalUser).where(PortalUser.email == email))
        user = result.scalar_one_or_none()
        if user:
            # Link Google account to existing user
            user.google_id = google_id
            user.is_verified = True
        else:
            # Create new user
            import secrets
            user = PortalUser(
                first_name=first_name,
                last_name=last_name,
                email=email,
                password=get_password_hash(secrets.token_urlsafe(32)),  # Random password for Google users
                mobile="",
                is_verified=True,
                google_id=google_id,
            )
            db.add(user)
            await db.flush()

    extra = {"role": "PORTAL_USER"}
    access_token = create_access_token(subject=str(user.id), extra_claims=extra)
    refresh_token_val = create_refresh_token(subject=str(user.id))

    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    await token_service.store_refresh_token(db, refresh_token_val, expires_at, portal_user_id=user.id)

    await db.commit()
    await db.refresh(user)

    return {"access_token": access_token, "refresh_token": refresh_token_val, "user": user}
```

**Step 4: Add Google Sign-In endpoint**

In `backend/app/routers/portal_auth.py`, add schema in portal_user.py:

```python
class GoogleSignInRequest(BaseModel):
    google_id: str = Field(..., description="Google user ID")
    email: EmailStr = Field(..., description="Google email")
    first_name: str = Field(..., max_length=60)
    last_name: str = Field(..., max_length=60)
```

In the router, add:

```python
@router.post(
    "/google-signin",
    response_model=PortalUserMobileLoginResponse,
    summary="Google Sign-In for mobile app",
)
@limiter.limit("10/minute")
async def google_signin(request: Request, body: GoogleSignInRequest, db: AsyncSession = Depends(get_db)):
    result = await portal_auth_service.google_signin(
        db, body.google_id, body.email, body.first_name, body.last_name
    )
    user = result["user"]
    return PortalUserMobileLoginResponse(
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
        user=PortalUserMeResponse(
            id=user.id, first_name=user.first_name, last_name=user.last_name,
            email=user.email, mobile=user.mobile, is_verified=user.is_verified,
            created_at=user.created_at, full_name=f"{user.first_name} {user.last_name}",
        ),
    )
```

**Step 5: Commit**

```bash
git add backend/app/models/portal_user.py backend/app/services/portal_auth_service.py backend/app/routers/portal_auth.py backend/app/schemas/portal_user.py
git commit -m "feat: add Google Sign-In support for portal users"
```

---

## Phase 2: Customer App Scaffold

### Task 6: Initialize Expo project and configure dependencies

**Files:**
- Create: `apps/customer/package.json`
- Create: `apps/customer/app.json`
- Create: `apps/customer/tsconfig.json`
- Create: `apps/customer/index.ts`
- Create: `apps/customer/App.tsx` (minimal)

**Step 1: Create package.json**

Create `apps/customer/package.json`:

```json
{
  "name": "customer",
  "version": "1.0.0",
  "main": "index.ts",
  "scripts": {
    "start": "expo start",
    "android": "expo start --android",
    "ios": "expo start --ios",
    "web": "expo start --web"
  },
  "dependencies": {
    "@react-native-async-storage/async-storage": "2.2.0",
    "@react-native-community/netinfo": "11.4.1",
    "@react-navigation/bottom-tabs": "^7.10.0",
    "@react-navigation/native": "^7.1.28",
    "@react-navigation/native-stack": "^7.13.0",
    "@reduxjs/toolkit": "^2.11.2",
    "axios": "^1.13.5",
    "date-fns": "^4.1.0",
    "expo": "~54.0.33",
    "expo-auth-session": "~7.0.10",
    "expo-constants": "~18.0.13",
    "expo-crypto": "~15.0.8",
    "expo-haptics": "~15.0.8",
    "expo-image-picker": "~17.0.10",
    "expo-secure-store": "~15.0.8",
    "expo-status-bar": "~3.0.9",
    "expo-web-browser": "~15.0.10",
    "react": "19.1.0",
    "react-native": "0.81.5",
    "react-native-qrcode-svg": "^6.3.21",
    "react-native-safe-area-context": "~5.6.0",
    "react-native-screens": "~4.16.0",
    "react-native-svg": "^15.15.1",
    "react-redux": "^9.2.0"
  },
  "devDependencies": {
    "@types/react": "~19.1.0",
    "typescript": "~5.9.2"
  },
  "private": true
}
```

**Step 2: Create app.json**

Create `apps/customer/app.json`:

```json
{
  "expo": {
    "name": "SSMSPL Customer",
    "slug": "ssmspl-customer",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "light",
    "newArchEnabled": true,
    "splash": {
      "backgroundColor": "#006994"
    },
    "ios": {
      "supportsTablet": false,
      "bundleIdentifier": "com.ssmspl.customer"
    },
    "android": {
      "adaptiveIcon": {
        "backgroundColor": "#006994"
      },
      "package": "com.ssmspl.customer",
      "edgeToEdgeEnabled": true,
      "usesCleartextTraffic": false,
      "versionCode": 1
    },
    "plugins": [
      "expo-secure-store"
    ],
    "extra": {
      "apiUrl": "https://api.carferry.online",
      "googleClientId": ""
    }
  }
}
```

**Step 3: Create tsconfig.json**

Create `apps/customer/tsconfig.json`:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true
  }
}
```

**Step 4: Create index.ts**

Create `apps/customer/index.ts`:

```typescript
import { registerRootComponent } from 'expo';

import App from './App';

registerRootComponent(App);
```

**Step 5: Create minimal App.tsx**

Create `apps/customer/App.tsx`:

```tsx
import React from 'react';
import { View, Text } from 'react-native';

export default function App() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>SSMSPL Customer</Text>
    </View>
  );
}
```

**Step 6: Copy logo assets**

Copy `apps/checker/assets/logo.png` and `apps/checker/assets/logo-white.png` to `apps/customer/assets/`.

**Step 7: Install dependencies**

```bash
cd apps/customer && npm install
```

**Step 8: Verify**

```bash
cd apps/customer && npx expo start --no-dev --no-minify
```
(Ctrl+C after it starts successfully)

**Step 9: Commit**

```bash
git add apps/customer/
git commit -m "feat: initialize customer app Expo project with dependencies"
```

---

### Task 7: Create theme, types, and utils

**Files:**
- Create: `apps/customer/src/theme/colors.ts`
- Create: `apps/customer/src/theme/spacing.ts`
- Create: `apps/customer/src/theme/typography.ts`
- Create: `apps/customer/src/theme/index.ts`
- Create: `apps/customer/src/types/models.ts`
- Create: `apps/customer/src/types/api.ts`
- Create: `apps/customer/src/types/navigation.ts`
- Create: `apps/customer/src/types/index.ts`
- Create: `apps/customer/src/utils/errorMessages.ts`
- Create: `apps/customer/src/utils/validators.ts`
- Create: `apps/customer/src/utils/logger.ts`

**Step 1: Create theme files**

`apps/customer/src/theme/colors.ts`:
```typescript
export const colors = {
  primary: '#006994',
  primaryDark: '#004A6B',
  primaryLight: '#00A8E8',
  accent: '#00D4FF',

  success: '#4CAF50',
  successLight: '#E8F5E9',
  warning: '#FF9800',
  warningLight: '#FFF3E0',
  error: '#F44336',
  errorLight: '#FFEBEE',
  info: '#2196F3',
  infoLight: '#E3F2FD',

  background: '#F5F5F5',
  surface: '#FFFFFF',
  border: '#E0E0E0',

  text: '#212121',
  textSecondary: '#757575',
  textLight: '#BDBDBD',
  textOnPrimary: '#FFFFFF',

  divider: '#EEEEEE',
};
```

`apps/customer/src/theme/spacing.ts` — same as checker:
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

`apps/customer/src/theme/typography.ts` — same as checker:
```typescript
import { TextStyle } from 'react-native';

export const typography = {
  h1: { fontSize: 28, fontWeight: 'bold' as TextStyle['fontWeight'], lineHeight: 34 },
  h2: { fontSize: 22, fontWeight: 'bold' as TextStyle['fontWeight'], lineHeight: 28 },
  h3: { fontSize: 18, fontWeight: '600' as TextStyle['fontWeight'], lineHeight: 24 },
  body: { fontSize: 16, fontWeight: 'normal' as TextStyle['fontWeight'], lineHeight: 22 },
  bodySmall: { fontSize: 14, fontWeight: 'normal' as TextStyle['fontWeight'], lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: 'normal' as TextStyle['fontWeight'], lineHeight: 16 },
  button: { fontSize: 16, fontWeight: '600' as TextStyle['fontWeight'], lineHeight: 22 },
};
```

`apps/customer/src/theme/index.ts`:
```typescript
export { colors } from './colors';
export { spacing, borderRadius } from './spacing';
export { typography } from './typography';
```

**Step 2: Create type files**

`apps/customer/src/types/models.ts`:
```typescript
export interface Customer {
  id: number;
  first_name: string;
  last_name: string;
  email: string;
  mobile: string;
  is_verified: boolean;
  created_at: string;
  full_name: string;
}

export interface Branch {
  id: number;
  name: string;
  address?: string;
}

export interface ScheduleItem {
  id: number;
  branch_id: number;
  departure: string; // HH:MM
}

export interface BookableItem {
  id: number;
  name: string;
  short_name: string;
  is_vehicle: boolean;
  rate: number;
  levy: number;
  route_id: number;
}

export interface BookingItemCreate {
  item_id: number;
  quantity: number;
  vehicle_no?: string | null;
}

export interface BookingItemRead {
  id: number;
  booking_id: number;
  item_id: number;
  item_name: string | null;
  rate: number;
  levy: number;
  quantity: number;
  vehicle_no: string | null;
  is_cancelled: boolean;
  amount: number;
}

export interface Booking {
  id: number;
  booking_no: number;
  status: string;
  verification_code: string | null;
  branch_id: number;
  branch_name: string | null;
  route_id: number;
  route_name: string | null;
  travel_date: string;
  departure: string | null;
  amount: number;
  discount: number;
  net_amount: number;
  portal_user_id: number;
  is_cancelled: boolean;
  created_at: string | null;
  items: BookingItemRead[] | null;
}

export interface BookingListItem {
  id: number;
  booking_no: number;
  status: string;
  branch_name: string | null;
  route_name: string | null;
  travel_date: string;
  departure: string | null;
  net_amount: number;
  is_cancelled: boolean;
  created_at: string | null;
  items: { item_name: string; quantity: number }[] | null;
}
```

`apps/customer/src/types/api.ts`:
```typescript
import { Customer, BookingListItem } from './models';

export interface MobileLoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: Customer;
}

export interface MobileRefreshResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface BookingListResponse {
  data: BookingListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ApiError {
  detail: string;
}

export interface ThemeResponse {
  theme_name: string;
  colors: {
    primary: string;
    primaryDark: string;
    primaryLight: string;
    accent: string;
    gradient: string[];
  };
}
```

`apps/customer/src/types/navigation.ts`:
```typescript
export type AuthStackParamList = {
  Splash: undefined;
  Login: undefined;
  Register: undefined;
  OTP: { email: string };
  ForgotPassword: undefined;
  ForgotPasswordOTP: { email: string };
  ResetPassword: { email: string; otp: string };
};

export type HomeStackParamList = {
  HomeMain: undefined;
  Booking: undefined;
};

export type BookingsStackParamList = {
  BookingsList: undefined;
  BookingDetail: { bookingId: number };
};

export type ProfileStackParamList = {
  ProfileMain: undefined;
  EditProfile: undefined;
  ChangePassword: undefined;
};

export type MainTabParamList = {
  HomeTab: undefined;
  BookingsTab: undefined;
  ProfileTab: undefined;
};
```

`apps/customer/src/types/index.ts`:
```typescript
export * from './models';
export * from './api';
export * from './navigation';
```

**Step 3: Create util files**

`apps/customer/src/utils/errorMessages.ts` — same as checker:
```typescript
export function friendlyError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'Something went wrong. Please try again.';
  const err = error as any;
  if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
    return 'Request timed out. Please try again.';
  }
  if (err.message === 'Network Error' || err.code === 'ERR_NETWORK') {
    return 'Unable to connect. Please check your internet.';
  }
  const status = err.response?.status;
  if (status === 401) return 'Session expired. Please log in again.';
  if (status === 403) return 'You do not have permission for this action.';
  if (status === 404) return 'Not found. Please check and try again.';
  if (status === 409) {
    const detail = err.response?.data?.detail;
    return typeof detail === 'string' ? detail : 'This action was already performed.';
  }
  if (status === 422) {
    const detail = err.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    return 'Invalid input. Please check your data.';
  }
  if (status && status >= 500) return 'Server error. Please try again later.';
  const detail = err.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  return 'Something went wrong. Please try again.';
}
```

`apps/customer/src/utils/validators.ts`:
```typescript
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidPassword(password: string): boolean {
  return password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
}

export function isValidPhone(phone: string): boolean {
  return /^\+?\d{10,15}$/.test(phone.replace(/\s/g, ''));
}

export function isValidOtp(otp: string): boolean {
  return /^\d{6}$/.test(otp);
}
```

`apps/customer/src/utils/logger.ts` — same as checker:
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
git add apps/customer/src/
git commit -m "feat: add theme, types, and utils for customer app"
```

---

### Task 8: Create services (api, auth, booking, payment, storage)

**Files:**
- Create: `apps/customer/src/services/api.ts`
- Create: `apps/customer/src/services/storageService.ts`
- Create: `apps/customer/src/services/authService.ts`
- Create: `apps/customer/src/services/bookingService.ts`
- Create: `apps/customer/src/services/paymentService.ts`

**Step 1: Create api.ts**

Same pattern as checker but uses portal auth refresh endpoint:

`apps/customer/src/services/api.ts`:
```typescript
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import { getAccessToken, getRefreshToken, setTokens, clearAll } from './storageService';
import { MobileRefreshResponse } from '../types';
import { logger } from '../utils/logger';

const BASE_URL =
  Constants.expoConfig?.extra?.apiUrl ||
  (__DEV__ ? 'http://10.0.2.2:8000' : 'https://api.ssmspl.com');

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY = 1000;

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as InternalAxiosRequestConfig & { __retryCount?: number };
    if (!config) return Promise.reject(error);
    const retryCount = config.__retryCount ?? 0;
    const isNetworkError = !error.response;
    const isServerError = error.response && error.response.status >= 500;
    if ((isNetworkError || isServerError) && retryCount < MAX_RETRIES) {
      config.__retryCount = retryCount + 1;
      const delay = RETRY_BASE_DELAY * Math.pow(2, retryCount);
      logger.warn(`Retry ${config.__retryCount}/${MAX_RETRIES} after ${delay}ms for ${config.url}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return api(config);
    }
    return Promise.reject(error);
  },
);

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach(({ resolve, reject }) => {
    if (token) resolve(token);
    else reject(error);
  });
  failedQueue = [];
}

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
        `${BASE_URL}/api/portal/auth/mobile-refresh`,
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

**Step 2: Create storageService.ts**

`apps/customer/src/services/storageService.ts`:
```typescript
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Customer } from '../types';
import { logger } from '../utils/logger';

const KEYS = {
  ACCESS_TOKEN: 'ssmspl_customer_access_token',
  REFRESH_TOKEN: 'ssmspl_customer_refresh_token',
  CUSTOMER_DATA: 'ssmspl_customer_data',
  LANGUAGE: 'ssmspl_customer_language',
  THEME: 'ssmspl_customer_theme',
};

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

export async function getCustomerData(): Promise<Customer | null> {
  const raw = await AsyncStorage.getItem(KEYS.CUSTOMER_DATA);
  return raw ? JSON.parse(raw) : null;
}

export async function setCustomerData(customer: Customer): Promise<void> {
  await AsyncStorage.setItem(KEYS.CUSTOMER_DATA, JSON.stringify(customer));
}

export async function clearCustomerData(): Promise<void> {
  await AsyncStorage.removeItem(KEYS.CUSTOMER_DATA);
}

export async function getLanguage(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.LANGUAGE)) || 'en';
}

export async function setLanguage(lang: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.LANGUAGE, lang);
}

export async function getStoredTheme(): Promise<string> {
  return (await AsyncStorage.getItem(KEYS.THEME)) || 'light';
}

export async function setStoredTheme(theme: string): Promise<void> {
  await AsyncStorage.setItem(KEYS.THEME, theme);
}

export async function clearAll(): Promise<void> {
  await clearTokens();
  await clearCustomerData();
}
```

**Step 3: Create authService.ts**

`apps/customer/src/services/authService.ts`:
```typescript
import api from './api';
import { MobileLoginResponse, Customer } from '../types';
import { setTokens, setCustomerData, clearAll, getRefreshToken } from './storageService';

export async function login(email: string, password: string): Promise<MobileLoginResponse> {
  const { data } = await api.post<MobileLoginResponse>('/api/portal/auth/mobile-login', {
    email,
    password,
  });
  await setTokens(data.access_token, data.refresh_token);
  await setCustomerData(data.user);
  return data;
}

export async function register(
  first_name: string,
  last_name: string,
  email: string,
  password: string,
  mobile: string,
): Promise<{ message: string; email: string }> {
  const { data } = await api.post('/api/portal/auth/register', {
    first_name,
    last_name,
    email,
    password,
    mobile,
  });
  return data;
}

export async function verifyOtp(email: string, otp: string): Promise<void> {
  await api.post('/api/portal/auth/verify-email', { email, otp });
}

export async function resendOtp(email: string, purpose: string = 'registration'): Promise<void> {
  await api.post(`/api/portal/auth/resend-otp?purpose=${purpose}`, { email });
}

export async function forgotPassword(email: string): Promise<void> {
  await api.post('/api/portal/auth/forgot-password', { email });
}

export async function resetPassword(email: string, otp: string, new_password: string): Promise<void> {
  await api.post('/api/portal/auth/reset-password', { email, otp, new_password });
}

export async function googleSignIn(
  google_id: string,
  email: string,
  first_name: string,
  last_name: string,
): Promise<MobileLoginResponse> {
  const { data } = await api.post<MobileLoginResponse>('/api/portal/auth/google-signin', {
    google_id,
    email,
    first_name,
    last_name,
  });
  await setTokens(data.access_token, data.refresh_token);
  await setCustomerData(data.user);
  return data;
}

export async function getProfile(): Promise<Customer> {
  const { data } = await api.get<Customer>('/api/portal/auth/me');
  return data;
}

export async function updateProfile(
  first_name?: string,
  last_name?: string,
  mobile?: string,
): Promise<Customer> {
  const { data } = await api.put<Customer>('/api/portal/auth/profile', {
    first_name,
    last_name,
    mobile,
  });
  await setCustomerData(data);
  return data;
}

export async function changePassword(old_password: string, new_password: string): Promise<void> {
  await api.post('/api/portal/auth/change-password', { old_password, new_password });
}

export async function logout(): Promise<void> {
  try {
    const refreshToken = await getRefreshToken();
    if (refreshToken) {
      await api.post('/api/portal/auth/logout', { refresh_token: refreshToken });
    }
  } catch {
    // Best-effort
  }
  await clearAll();
}
```

**Step 4: Create bookingService.ts**

`apps/customer/src/services/bookingService.ts`:
```typescript
import api from './api';
import { Branch, ScheduleItem, BookableItem, Booking, BookingItemCreate } from '../types';
import { BookingListResponse } from '../types';

export async function getBranches(): Promise<Branch[]> {
  const { data } = await api.get<Branch[]>('/api/booking/branches');
  return data;
}

export async function getToBranches(fromBranchId: number): Promise<Branch[]> {
  const { data } = await api.get<Branch[]>(`/api/booking/to-branches/${fromBranchId}`);
  return data;
}

export async function getItems(fromBranchId: number, toBranchId: number): Promise<BookableItem[]> {
  const { data } = await api.get<BookableItem[]>(`/api/booking/items/${fromBranchId}/${toBranchId}`);
  return data;
}

export async function getSchedules(branchId: number): Promise<ScheduleItem[]> {
  const { data } = await api.get<ScheduleItem[]>(`/api/booking/schedules/${branchId}`);
  return data;
}

export async function createBooking(
  from_branch_id: number,
  to_branch_id: number,
  travel_date: string,
  departure: string,
  items: BookingItemCreate[],
): Promise<Booking> {
  const { data } = await api.post<Booking>('/api/portal/bookings', {
    from_branch_id,
    to_branch_id,
    travel_date,
    departure,
    items,
  });
  return data;
}

export async function getBookings(page: number = 1, pageSize: number = 10): Promise<BookingListResponse> {
  const { data } = await api.get<BookingListResponse>(`/api/portal/bookings?page=${page}&page_size=${pageSize}`);
  return data;
}

export async function getBookingDetail(bookingId: number): Promise<Booking> {
  const { data } = await api.get<Booking>(`/api/portal/bookings/${bookingId}`);
  return data;
}

export async function cancelBooking(bookingId: number): Promise<Booking> {
  const { data } = await api.post<Booking>(`/api/portal/bookings/${bookingId}/cancel`);
  return data;
}

export async function getBookingQrUrl(bookingId: number): Promise<string> {
  const baseURL = api.defaults.baseURL;
  return `${baseURL}/api/portal/bookings/${bookingId}/qr`;
}
```

**Step 5: Create paymentService.ts**

`apps/customer/src/services/paymentService.ts`:
```typescript
import api from './api';

export interface PaymentConfig {
  gateway: string;
  configured: boolean;
}

export interface PaymentOrder {
  order_id: string;
  amount: number;
  status: string;
  payment_url: string | null;
  message?: string;
}

export async function getPaymentConfig(): Promise<PaymentConfig> {
  const { data } = await api.get<PaymentConfig>('/api/portal/payment/config');
  return data;
}

export async function createPaymentOrder(bookingId: number): Promise<PaymentOrder> {
  const { data } = await api.post<PaymentOrder>('/api/portal/payment/create-order', {
    booking_id: bookingId,
  });
  return data;
}

export async function verifyPayment(
  transactionId: string,
  orderId: string,
  bookingId: number,
): Promise<any> {
  const { data } = await api.post('/api/portal/payment/verify', {
    transaction_id: transactionId,
    order_id: orderId,
    booking_id: bookingId,
  });
  return data;
}

export async function simulatePayment(bookingId: number): Promise<any> {
  const { data } = await api.post(`/api/portal/bookings/${bookingId}/pay`);
  return data;
}
```

**Step 6: Commit**

```bash
git add apps/customer/src/services/
git commit -m "feat: add customer app services (api, auth, booking, payment, storage)"
```

---

### Task 9: Create Redux store (auth, booking, app slices)

**Files:**
- Create: `apps/customer/src/store/index.ts`
- Create: `apps/customer/src/store/slices/authSlice.ts`
- Create: `apps/customer/src/store/slices/bookingSlice.ts`
- Create: `apps/customer/src/store/slices/appSlice.ts`

**Step 1: Create authSlice.ts**

`apps/customer/src/store/slices/authSlice.ts`:
```typescript
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
```

**Step 2: Create bookingSlice.ts**

`apps/customer/src/store/slices/bookingSlice.ts`:
```typescript
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Branch, ScheduleItem, BookableItem, Booking, BookingListItem, BookingItemCreate } from '../../types';
import { BookingListResponse } from '../../types';
import * as bookingService from '../../services/bookingService';
import { friendlyError } from '../../utils/errorMessages';

interface BookingFormItem extends BookableItem {
  quantity: number;
  vehicle_no?: string;
}

interface BookingState {
  // Master data
  branches: Branch[];
  toBranches: Branch[];
  schedules: ScheduleItem[];
  items: BookableItem[];

  // Form state
  fromBranch: Branch | null;
  toBranch: Branch | null;
  travelDate: string;
  departure: string;
  formItems: BookingFormItem[];
  totalAmount: number;

  // Booking list
  bookings: BookingListItem[];
  currentBooking: Booking | null;
  page: number;
  totalPages: number;

  // UI
  isLoadingForm: boolean;
  isLoadingBookings: boolean;
  isCreating: boolean;
  error: string | null;
}

const initialState: BookingState = {
  branches: [],
  toBranches: [],
  schedules: [],
  items: [],
  fromBranch: null,
  toBranch: null,
  travelDate: '',
  departure: '',
  formItems: [],
  totalAmount: 0,
  bookings: [],
  currentBooking: null,
  page: 1,
  totalPages: 1,
  isLoadingForm: false,
  isLoadingBookings: false,
  isCreating: false,
  error: null,
};

export const fetchBranches = createAsyncThunk('booking/fetchBranches', async (_, { rejectWithValue }) => {
  try { return await bookingService.getBranches(); }
  catch (err: any) { return rejectWithValue(friendlyError(err)); }
});

export const fetchToBranches = createAsyncThunk('booking/fetchToBranches', async (fromBranchId: number, { rejectWithValue }) => {
  try { return await bookingService.getToBranches(fromBranchId); }
  catch (err: any) { return rejectWithValue(friendlyError(err)); }
});

export const fetchItems = createAsyncThunk('booking/fetchItems', async (params: { from: number; to: number }, { rejectWithValue }) => {
  try { return await bookingService.getItems(params.from, params.to); }
  catch (err: any) { return rejectWithValue(friendlyError(err)); }
});

export const fetchSchedules = createAsyncThunk('booking/fetchSchedules', async (branchId: number, { rejectWithValue }) => {
  try { return await bookingService.getSchedules(branchId); }
  catch (err: any) { return rejectWithValue(friendlyError(err)); }
});

export const createBooking = createAsyncThunk(
  'booking/create',
  async (params: {
    from_branch_id: number;
    to_branch_id: number;
    travel_date: string;
    departure: string;
    items: BookingItemCreate[];
  }, { rejectWithValue }) => {
    try {
      return await bookingService.createBooking(
        params.from_branch_id, params.to_branch_id,
        params.travel_date, params.departure, params.items,
      );
    } catch (err: any) { return rejectWithValue(friendlyError(err)); }
  },
);

export const fetchBookings = createAsyncThunk(
  'booking/fetchBookings',
  async (params: { page: number; pageSize?: number }, { rejectWithValue }) => {
    try { return await bookingService.getBookings(params.page, params.pageSize); }
    catch (err: any) { return rejectWithValue(friendlyError(err)); }
  },
);

export const fetchBookingDetail = createAsyncThunk(
  'booking/fetchDetail',
  async (bookingId: number, { rejectWithValue }) => {
    try { return await bookingService.getBookingDetail(bookingId); }
    catch (err: any) { return rejectWithValue(friendlyError(err)); }
  },
);

export const cancelBookingThunk = createAsyncThunk(
  'booking/cancel',
  async (bookingId: number, { rejectWithValue }) => {
    try { return await bookingService.cancelBooking(bookingId); }
    catch (err: any) { return rejectWithValue(friendlyError(err)); }
  },
);

function computeTotal(items: BookingFormItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity * (item.rate + item.levy), 0);
}

const bookingSlice = createSlice({
  name: 'booking',
  initialState,
  reducers: {
    setFromBranch(state, action: PayloadAction<Branch>) {
      state.fromBranch = action.payload;
      state.toBranch = null;
      state.formItems = [];
      state.totalAmount = 0;
    },
    setToBranch(state, action: PayloadAction<Branch>) {
      state.toBranch = action.payload;
    },
    setTravelDate(state, action: PayloadAction<string>) {
      state.travelDate = action.payload;
    },
    setDeparture(state, action: PayloadAction<string>) {
      state.departure = action.payload;
    },
    updateItemQty(state, action: PayloadAction<{ itemId: number; quantity: number; vehicleNo?: string }>) {
      const { itemId, quantity, vehicleNo } = action.payload;
      const idx = state.formItems.findIndex((i) => i.id === itemId);
      if (idx >= 0) {
        if (quantity <= 0) {
          state.formItems.splice(idx, 1);
        } else {
          state.formItems[idx].quantity = quantity;
          if (vehicleNo !== undefined) state.formItems[idx].vehicle_no = vehicleNo;
        }
      } else if (quantity > 0) {
        const item = state.items.find((i) => i.id === itemId);
        if (item) {
          state.formItems.push({ ...item, quantity, vehicle_no: vehicleNo });
        }
      }
      state.totalAmount = computeTotal(state.formItems);
    },
    clearBookingForm(state) {
      state.fromBranch = null;
      state.toBranch = null;
      state.travelDate = '';
      state.departure = '';
      state.formItems = [];
      state.totalAmount = 0;
      state.toBranches = [];
      state.schedules = [];
      state.items = [];
    },
    clearBookingError(state) {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchBranches.fulfilled, (state, action) => { state.branches = action.payload; })
      .addCase(fetchToBranches.pending, (state) => { state.isLoadingForm = true; })
      .addCase(fetchToBranches.fulfilled, (state, action) => { state.toBranches = action.payload; state.isLoadingForm = false; })
      .addCase(fetchToBranches.rejected, (state) => { state.isLoadingForm = false; })
      .addCase(fetchItems.fulfilled, (state, action) => { state.items = action.payload; })
      .addCase(fetchSchedules.fulfilled, (state, action) => { state.schedules = action.payload; })
      .addCase(createBooking.pending, (state) => { state.isCreating = true; state.error = null; })
      .addCase(createBooking.fulfilled, (state, action) => {
        state.isCreating = false;
        state.currentBooking = action.payload;
      })
      .addCase(createBooking.rejected, (state, action) => {
        state.isCreating = false;
        state.error = action.payload as string;
      })
      .addCase(fetchBookings.pending, (state) => { state.isLoadingBookings = true; })
      .addCase(fetchBookings.fulfilled, (state, action) => {
        state.isLoadingBookings = false;
        const resp = action.payload;
        state.bookings = resp.page === 1 ? resp.data : [...state.bookings, ...resp.data];
        state.page = resp.page;
        state.totalPages = resp.total_pages;
      })
      .addCase(fetchBookings.rejected, (state) => { state.isLoadingBookings = false; })
      .addCase(fetchBookingDetail.pending, (state) => { state.isLoadingBookings = true; })
      .addCase(fetchBookingDetail.fulfilled, (state, action) => {
        state.isLoadingBookings = false;
        state.currentBooking = action.payload;
      })
      .addCase(fetchBookingDetail.rejected, (state, action) => {
        state.isLoadingBookings = false;
        state.error = action.payload as string;
      })
      .addCase(cancelBookingThunk.fulfilled, (state, action) => {
        state.currentBooking = action.payload;
        const idx = state.bookings.findIndex((b) => b.id === action.payload.id);
        if (idx >= 0) {
          state.bookings[idx].status = action.payload.status;
          state.bookings[idx].is_cancelled = action.payload.is_cancelled;
        }
      });
  },
});

export const {
  setFromBranch, setToBranch, setTravelDate, setDeparture,
  updateItemQty, clearBookingForm, clearBookingError,
} = bookingSlice.actions;
export default bookingSlice.reducer;
```

**Step 3: Create appSlice.ts**

`apps/customer/src/store/slices/appSlice.ts`:
```typescript
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface AppState {
  isOnline: boolean;
  theme: 'light' | 'dark';
  language: 'en' | 'mr';
  sessionExpired: boolean;
}

const initialState: AppState = {
  isOnline: true,
  theme: 'light',
  language: 'en',
  sessionExpired: false,
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
});

export const { setOnline, setTheme, setLanguage, setSessionExpired } = appSlice.actions;
export default appSlice.reducer;
```

**Step 4: Create store/index.ts**

`apps/customer/src/store/index.ts`:
```typescript
import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import bookingReducer from './slices/bookingSlice';
import appReducer from './slices/appSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    booking: bookingReducer,
    app: appReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
```

**Step 5: Commit**

```bash
git add apps/customer/src/store/
git commit -m "feat: add Redux store with auth, booking, and app slices"
```

---

### Task 10: Create common UI components

**Files:**
- Create: `apps/customer/src/components/common/Button.tsx`
- Create: `apps/customer/src/components/common/Card.tsx`
- Create: `apps/customer/src/components/common/Input.tsx`
- Create: `apps/customer/src/components/common/Loading.tsx`
- Create: `apps/customer/src/components/common/NetworkBanner.tsx`

These are identical to the checker app components (same patterns, but using the customer theme colors). Copy them from the checker and the theme imports will pick up the customer colors automatically since both use `../../theme`.

**Step 1: Create all 5 components** — same code as checker (Button.tsx, Card.tsx, Input.tsx, Loading.tsx, NetworkBanner.tsx). NetworkBanner uses `s.app.isOnline` instead of `s.ui.isOnline`.

**Step 2: Commit**

```bash
git add apps/customer/src/components/common/
git commit -m "feat: add common UI components (Button, Card, Input, Loading, NetworkBanner)"
```

---

## Phase 3: Navigation & Auth Screens

### Task 11: Create navigation structure

**Files:**
- Create: `apps/customer/src/navigation/AuthNavigator.tsx`
- Create: `apps/customer/src/navigation/MainNavigator.tsx`
- Create: `apps/customer/src/navigation/RootNavigator.tsx`
- Create: `apps/customer/src/navigation/index.ts`

**Step 1: Create AuthNavigator** — Stack navigator with Splash, Login, Register, OTP, ForgotPassword, ForgotPasswordOTP, ResetPassword screens.

**Step 2: Create MainNavigator** — Bottom tab navigator with 3 tabs (Home, Bookings, Profile), each containing a nested stack navigator.

**Step 3: Create RootNavigator** — Checks `isCheckingAuth` and `isAuthenticated` from Redux, conditionally renders AuthNavigator or MainNavigator.

**Step 4: Commit**

```bash
git add apps/customer/src/navigation/
git commit -m "feat: add navigation structure (auth stack, main tabs, root navigator)"
```

---

### Task 12: Create auth screens

**Files:**
- Create: `apps/customer/src/screens/auth/SplashScreen.tsx`
- Create: `apps/customer/src/screens/auth/LoginScreen.tsx`
- Create: `apps/customer/src/screens/auth/RegisterScreen.tsx`
- Create: `apps/customer/src/screens/auth/OTPScreen.tsx`
- Create: `apps/customer/src/screens/auth/ForgotPasswordScreen.tsx`
- Create: `apps/customer/src/screens/auth/ForgotPasswordOTPScreen.tsx`
- Create: `apps/customer/src/screens/auth/ResetPasswordScreen.tsx`

**Key patterns:**
- SplashScreen dispatches `checkAuthStatus()` on mount (same as checker)
- LoginScreen has email/password + Google Sign-In button + Register link
- RegisterScreen collects first_name, last_name, email, mobile, password → dispatches `register()` → navigates to OTP
- OTPScreen accepts 6-digit code → dispatches `verifyOtp()` → navigates to Login with success message
- ForgotPasswordScreen → enter email → dispatches `forgotPassword()` → navigates to ForgotPasswordOTP
- ForgotPasswordOTPScreen → enter OTP → navigates to ResetPassword with email + otp
- ResetPasswordScreen → enter new password → dispatches `resetPassword()` → navigates to Login

**Step 1–7: Create each screen following the patterns above**

**Step 8: Commit**

```bash
git add apps/customer/src/screens/auth/
git commit -m "feat: add auth screens (splash, login, register, OTP, forgot/reset password)"
```

---

## Phase 4: Main App Screens

### Task 13: Create HomeScreen

**Files:**
- Create: `apps/customer/src/screens/main/HomeScreen.tsx`

**Features:**
- Welcome greeting with customer name
- Quick action cards: "Book New Ticket" and "View Bookings"
- Upcoming trips section (fetches first page of bookings, shows up to 3 non-cancelled upcoming ones)
- Pull-to-refresh
- NetworkBanner at top

### Task 14: Create BookingScreen (3-step form)

**Files:**
- Create: `apps/customer/src/screens/main/BookingScreen.tsx`
- Create: `apps/customer/src/components/booking/BookingStepIndicator.tsx`
- Create: `apps/customer/src/components/booking/ItemSelector.tsx`
- Create: `apps/customer/src/components/booking/BookingSummary.tsx`

**Features:**
- Step indicator (1-2-3) at top
- Step 1: Route selection (From branch picker, To branch picker)
- Step 2: Date picker + departure time picker
- Step 3: Item selection with categorized sections (Passengers, Vehicles, Others) + quantity steppers
- Summary review with total
- Pay button → SabPaisa or simulated payment

### Task 15: Create BookingsListScreen

**Files:**
- Create: `apps/customer/src/screens/main/BookingsListScreen.tsx`
- Create: `apps/customer/src/components/booking/TicketCard.tsx`

**Features:**
- Paginated list of bookings
- Filter tabs: All, Upcoming, Completed, Cancelled
- Each card shows route, status badge, ferry, date, amount
- Pull-to-refresh + infinite scroll
- Tap → navigate to BookingDetail

### Task 16: Create BookingDetailScreen

**Files:**
- Create: `apps/customer/src/screens/main/BookingDetailScreen.tsx`
- Create: `apps/customer/src/components/booking/QRTicket.tsx`

**Features:**
- Full ticket display with status badge
- Route (FROM → TO), date, time, amount
- Items table
- QR code (using react-native-qrcode-svg)
- Cancel button (if status allows)
- Share button (native share)

### Task 17: Create ProfileScreen, EditProfileScreen, ChangePasswordScreen

**Files:**
- Create: `apps/customer/src/screens/main/ProfileScreen.tsx`
- Create: `apps/customer/src/screens/main/EditProfileScreen.tsx`
- Create: `apps/customer/src/screens/main/ChangePasswordScreen.tsx`

**ProfileScreen features:**
- Profile info card (avatar, name, email, mobile)
- Menu items: Edit Profile, Change Password, Language, Theme, About, Terms, Privacy, Logout

**EditProfileScreen features:**
- Edit first name, last name, mobile
- Save dispatches `updateProfile()`

**ChangePasswordScreen features:**
- Old password, new password, confirm password
- Validation matching backend requirements
- Dispatches change password service call

### Task 18: Wire up App.tsx with full navigation

**Files:**
- Modify: `apps/customer/App.tsx`

Wire up Redux Provider, SafeAreaProvider, NavigationContainer, RootNavigator, NetInfo listener, AppState listener, auth failure handler — same pattern as checker App.tsx.

**Commit after each task in this phase.**

---

## Phase 5: i18n & Dynamic Theme

### Task 19: Add internationalization (English + Marathi)

**Files:**
- Create: `apps/customer/src/i18n/en.ts`
- Create: `apps/customer/src/i18n/mr.ts`
- Create: `apps/customer/src/i18n/index.ts`

Simple key-value translation with a `t()` function that reads from the Redux `app.language` state. All user-facing strings should use `t('key')`.

### Task 20: Add dynamic theme support

**Files:**
- Modify: `apps/customer/src/theme/colors.ts`
- Modify: `apps/customer/src/store/slices/appSlice.ts`

Add async thunk `fetchAppTheme` that calls `GET /api/company/theme` and stores colors in state. Components read from Redux when dynamic theme is active, fall back to static colors otherwise.

**Commit after each task.**

---

## Phase 6: Final Integration & Polish

### Task 21: End-to-end verification

- Run `cd apps/customer && npx expo start` — verify app loads
- Test auth flow: register → OTP → login
- Test booking flow: select route → date/time → items → pay
- Test bookings list → detail → QR
- Test profile → edit → change password
- Test offline banner
- Test logout

### Task 22: Commit and tag

```bash
git add -A
git commit -m "feat: complete SSMSPL customer app with full feature parity"
```

---

## Dependency Graph

```
Task 1 (mobile-login) ──┐
Task 2 (profile)  ───────┤
Task 3 (theme endpoint) ─┤
Task 4 (payment)  ───────┤
Task 5 (google-signin) ──┘
         │
         ▼
Task 6 (scaffold) → Task 7 (theme/types) → Task 8 (services) → Task 9 (store)
         │
         ▼
Task 10 (components) → Task 11 (navigation) → Task 12 (auth screens)
         │
         ▼
Task 13-17 (main screens) → Task 18 (App.tsx wiring)
         │
         ▼
Task 19-20 (i18n + dynamic theme) → Task 21-22 (verification)
```

Backend tasks (1-5) can run in parallel. App tasks (6+) are sequential. Tasks 13-17 can partially parallelize (independent screens).
