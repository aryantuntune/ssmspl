# SSMSPL SuperAdmin — Android app

Personal admin app for the SSMSPL super-admin. **Sideload-only** — no Play Store.
Single user (you, the SuperAdmin), single distribution (APK on your phone).

## What it does

- View live system-health for both servers (carferry.online + admin.carferry.online)
- Receive push notifications when `health_check.sh` cron detects a CRIT issue
- Sign in with the same SUPER_ADMIN/ADMIN credentials as the web admin
- Scrollable feed of recent CRIT/WARN events (last 50 by default)
- Pull-to-refresh; auto-refresh every 30 s

## What it does NOT do (yet)

- Action buttons (restart container, trigger backup) — out of scope for v1
- Two-way responses to alerts — out of scope for v1
- Live container log tail — out of scope for v1

These are intentionally deferred so v1 ships in hours, not days, and stays simple.

## Architecture

```
┌─────────────────┐        POST /api/system-health/events
│ health_check.sh │ ───────────► (X-Health-Token)
│ (host cron)     │              │
└─────────────────┘              ▼
                       ┌──────────────────┐         Expo Push API
                       │  FastAPI backend │ ─────────► ┌──────────┐
                       │  /api/system-    │            │ exp.host │
                       │  health/*        │            └─────┬────┘
                       └──────────────────┘                  │
                              ▲                              │push
                              │ pull: GET /status            ▼
                              │       GET /events       ┌──────────┐
                              └──────────────────────── │ this APK │
                                                        └──────────┘
```

## Stack

- Expo SDK 51 + React Native 0.74 + TypeScript
- Expo Notifications (push)
- Expo SecureStore (token storage)
- Axios (HTTP)
- No native modules, no react-navigation (custom stack to keep deps light)

## One-time setup

### 1. Install Expo CLI + EAS CLI

```bash
npm i -g eas-cli
```

### 2. Install deps

```bash
cd mobile
npm install
```

### 3. Create an Expo account + EAS project

```bash
cd mobile
eas login            # creates a free Expo account if you don't have one
eas init             # creates an EAS project; prints a projectId
```

Copy the printed `projectId` into `app.json` under `expo.extra.eas.projectId`
(replacing `REPLACE_WITH_YOUR_EAS_PROJECT_ID`).

### 4. Generate icons (optional)

Place a 1024×1024 PNG at `assets/icon.png` and a `assets/splash.png` (any size,
keep under 2MB). Otherwise Expo provides defaults.

## Build the APK

### Cloud build (recommended — no Android SDK on your machine needed)

```bash
cd mobile
eas build --platform android --profile preview
```

After the build finishes (~10 minutes), you'll get a URL to download the APK
from Expo's cloud storage. Email/share that URL to your phone, tap, install.

### Local build (faster iteration if you have Android SDK)

```bash
cd mobile
eas build --platform android --profile preview --local
```

This produces a `.apk` in `mobile/`. Transfer to phone via USB / scp / Drive.

## Install on your phone

1. Email yourself or AirDroid the `.apk` file
2. On the phone: Settings → Apps → Install unknown apps → Allow your file manager
3. Tap the APK to install
4. Open "SSMSPL SuperAdmin"

## Backend env vars (admin server)

In `backend/.env.admin` (or whichever env file the admin backend reads):

```dotenv
# Shared secret — must exactly match the same value the host-side
# health_check.sh sends in X-Health-Token header. Generate with:
#   openssl rand -hex 32
HEALTH_INGEST_SECRET=<generated 64-char hex>
```

## Host-side cron config (Server 1 + Server 2)

In `/etc/ssmspl_monitor.conf` (Server 2) or `~/.config/ssmspl_monitor.conf`
(Server 1), add:

```bash
HEALTH_INGEST_URL=https://admin.carferry.online/api/system-health/events
HEALTH_INGEST_SECRET=<same value as backend .env>
```

The existing health_check.sh now POSTs an event to this URL whenever it
detects a CRIT-level issue (in addition to sending the email). The backend
fans out an Expo push notification to all registered devices.

## Push notification flow

1. App launches → checks for stored access token
2. After login, the app calls `Notifications.getExpoPushTokenAsync()` and
   POSTs the token to `/api/system-health/devices`
3. Backend stores it, marks active
4. When `health_check.sh` POSTs a CRIT event, the backend builds an Expo
   push message with title=`[server_name] check_name` and fans it out to
   every active device via `https://exp.host/--/api/v2/push/send`
5. Phone receives push within 1-3 seconds, shows native notification
6. Tap → app opens to the dashboard, recent events visible

If a device's token becomes invalid (`DeviceNotRegistered`), the backend
auto-deactivates it on the next push attempt — no clean-up needed.

## Troubleshooting

- **Login works on web but app shows 401**: check that the login endpoint
  returns `access_token` in JSON (not just a cookie). The mobile app reads
  `r.data.access_token`.
- **No push received after CRIT event**: check `/var/log/ssmspl_health.log`
  — should say `push event ingested OK`. If it says `HTTP 401`, the
  `HEALTH_INGEST_SECRET` doesn't match. If `HTTP 503`, the backend env var
  isn't set.
- **App says "Role X can't use this app"**: only SUPER_ADMIN and ADMIN can
  log in. This is intentional — the app exposes server-internal status.
- **Push token registration silently fails**: check Settings → Push devices.
  Tap "Re-register push notifications" to retry. On Android emulator,
  push tokens don't work — use a real device.

## Updating the app later

Either:
- Re-run `eas build --profile preview` and install the new APK
- Or use Expo's OTA updates: `eas update --branch preview` (only updates
  JS bundle; native changes still require a new APK)
