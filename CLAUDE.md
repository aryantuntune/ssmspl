# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SSMSPL (Suvarnadurga Shipping & Marine Services Pvt. Ltd.) — Ferry Boat Ticketing System. Full-stack monorepo with a FastAPI async backend and Next.js frontend communicating via REST API.

## Branch Workflow (READ BEFORE COMMITTING)

This single repo is deployed twice. Two long-lived branches map 1:1 to the two servers — never delete them, never use them for short-lived work:

| Branch | Deploys to | Purpose |
|--------|-----------|---------|
| `main` | Server 1 — `carferry.online` (production, cashier-facing) | Only commits safe for live cashier use |
| `admin` | Server 2 — `admin.carferry.online` (admin portal, internal) | `main` + admin-only features layered on top |

**Rules:**

1. **Shared work** (bug fixes, features both servers should get) → commit to `main`. Then `git checkout admin && git merge main` (almost always a fast-forward) and push.
2. **Admin-only work** (anything that should never touch prod, e.g. admin-portal-only screens, OCC version column, admin DDL patches) → commit to `admin` directly. Never to `main`.
3. **Commit messages MUST start with `[prod]`, `[admin]`, or `[both]`** so the target is unmistakable in `git log`. Example:
   - `[both] fix(tickets): null-safe discount handling`
   - `[admin] feat(tickets): editable date + optimistic locking`
   - `[prod] fix(receipt): correct thermal print width`
4. **No more short-lived `feature/*` branches doing double-duty.** If you need a working branch, fine, but it must merge into either `main` or `admin` — not both.
5. **Each deploy gets a tag**: `prod-vN` / `admin-vN` (or date-based). Baselines from the two-branch migration: `prod-baseline-2026-04-29` and `admin-baseline-2026-04-29`.

**Architecture supports this**: `ADMIN_PORTAL_MODE=true` env var on Server 2 already gates admin-only backend behavior; `NEXT_PUBLIC_ADMIN_PORTAL=true` gates the frontend route middleware. The branch split is for *code* the two servers shouldn't share, not for the shared codebase.

**Server 1 is a git checkout** at `/var/www/ssmspl/` and pulls `main`. **Server 2 is a tar-synced folder** at `/var/www/ssmspl-admin/` (no `.git/`); its deploys come from a tar of the `admin` branch worktree.



## Development Commands

### Backend (Python 3.12 / FastAPI)

```bash
# Setup
cd backend
python -m venv .venv
.venv/Scripts/activate          # Windows
pip install -r requirements-dev.txt

# Run dev server
uvicorn app.main:app --reload   # reads .env.development by default

# Run all tests (requires PostgreSQL test DB running)
pytest tests/ -v

# Run single test file / single test
pytest tests/test_auth.py -v
pytest tests/test_auth.py::test_login_success -v

# Run tests with coverage
pytest tests/ -v --cov=app --cov-report=term-missing

# Alembic migrations
alembic revision --autogenerate -m "description"
alembic upgrade head
```

### Frontend (Next.js 16 / React 19 / TypeScript)

```bash
cd frontend
npm install
npm run dev       # http://localhost:3000
npm run build
npm run lint      # ESLint 9
```

### Docker (full stack)

```bash
# Production
docker compose up --build

# Development with hot reload
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## Architecture

### Backend (`backend/app/`)

- **Framework**: FastAPI with full async/await. All DB operations use SQLAlchemy 2.0 `AsyncSession` with `asyncpg`.
- **Layered architecture**: Routers → Services → Models. Routers are thin; business logic lives in `services/`.
- **Auth via dependency injection**: `get_current_user` extracts JWT from Bearer header, `require_roles(*roles)` is a factory returning a FastAPI `Depends()` that gates endpoints by role.
- **Config**: `pydantic-settings` in `config.py`. Env file selected by `APP_ENV` (`.env.development` by default). Cached via `@lru_cache` and exposed as the module-level `settings`. `SECRET_KEY` must be ≥32 chars (validator enforced).
- **Database**: PostgreSQL 16 via `asyncpg`. Connection pool: size=10, max_overflow=20. `get_db()` yields a session that auto-commits/rollbacks. Optional `SYNC_DATABASE_URL` points at a prod-mirror DB (`ssmspl_sync`) used only by the admin sync-check feature.
- **Swagger/ReDoc**: Only available when `DEBUG=true` at `/docs` and `/redoc`.
- **Reporting layer** (`app/reporting/`): A dedicated module separate from `services/`. `filters.py` defines the canonical filter model; `query_helpers.py`, `merge.py`, `sorting.py` are shared building blocks; each report under `reporting/reports/` (e.g. `date_wise_amount`, `payment_mode_report`, `admin_date_branch_summary`, `admin_itemwise_daily_charges`) is a self-contained query module. Surfaced via the `reports` and `admin_reports` routers.
- **Background tasks**: Started in the `lifespan` context manager — `expiry_loop` (booking expiry) and `daily_report_loop` (scheduled email reports). Both run ONLY when `ADMIN_PORTAL_MODE` is false (i.e. on Server 1 / prod, not the admin portal). A Redis-backed token blacklist is also initialized at startup (`REDIS_URL` empty = disabled, fine for dev).
- **Deployment-gated routers**: `app/main.py` mounts routers conditionally on `settings.ADMIN_PORTAL_MODE`. Customer-facing routers (`portal_auth`, `booking`, `portal_bookings`, `portal_payment`, `portal_theme`, `contact`) load only when NOT in admin-portal mode. Admin-only routers (`admin_user_access`, `admin_parameter_master`, `admin_d_drive`, `admin_transfer`, `admin_adjustments`, `admin_sync_check`) load only IN admin-portal mode. `admin_reports`, `system_health`, `system_actions`, `backup_events` mount on BOTH and rely on endpoint-level RBAC.

### Frontend (`frontend/src/`)

- **Framework**: Next.js App Router with `src/` directory layout, TypeScript strict mode, Tailwind CSS v4.
- **Auth flow**: Login POSTs to `/api/auth/login`, tokens stored in cookies (`ssmspl_access_token`, `ssmspl_refresh_token`) via `js-cookie`. Axios interceptor in `lib/api.ts` attaches Bearer token and redirects to `/login` on 401.
- **Navigation permissions are server-controlled**: Backend `ROLE_MENU_ITEMS` dict in `core/rbac.py` is the authority. `/api/auth/me` returns `menu_items` list; frontend `Sidebar` maps these strings to routes.
- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).

### RBAC (5 roles)

`SUPER_ADMIN > ADMIN > MANAGER > BILLING_OPERATOR > TICKET_CHECKER`

Roles are defined in `backend/app/core/rbac.py` as a Python `str, Enum`. Menu items per role are in the `ROLE_MENU_ITEMS` dict in the same file. Admin-portal-only menu items (D Drive, Parameter Master, Employee Transfer, Admin Reports, User Sessions) are gated by BOTH the role's menu list AND `ADMIN_PORTAL_MODE` — the backend only mounts those routers on Server 2, so they 404 on prod even for SUPER_ADMIN.

### Test Setup

- Tests use a separate `ssmspl_db_test` database (hardcoded URL in `tests/conftest.py`).
- `asyncio_mode = auto` — all async tests run automatically.
- `conftest.py` overrides `get_db` dependency with a test session and creates/drops all tables per session.
- Fixtures: `client` (httpx `AsyncClient` via `ASGITransport`), `db_session`, `super_admin_user`.

### Database

- DDL in `backend/scripts/ddl.sql`, seed data in `backend/scripts/seed_data.sql`. Schema is now driven primarily by **Alembic migrations** in `backend/alembic/versions/` — `alembic/env.py` does `from app.models import *` so every model is autodetected.
- **Migration revision IDs are hand-authored, not hashes** (e.g. `q2e5g7h9b3d6`, `e1a2b3c4d5f6`). When chaining migrations, set `down_revision` to the actual current head; multiple heads get reconciled with a `merge_heads` revision.
- ~35 models in `app/models/`. Major domains: core auth (`user`, `refresh_token`, `user_session`, `email_otp`), catalog (`branch`, `route`, `boat`, `ferry_schedule`, `item`, `item_rate`, `payment_mode`, `company`), ticketing (`ticket`, `ticket_items` / multi-ticket columns), customer portal (`portal_user`, `booking`, `booking_item`, `payment_transaction`), admin-portal features (`admin_user_access`, `parameter_master`, `admin_screen_toggle`, `admin_adjustments_log`, `admin_adjustment_details`, `tickets_backup`, `ticket_items_backup`), audit/ops (`rate_change_log`, `item_rate_history`, `user_activity_log`, `daily_report_log`, `backup_event`, `system_health_event`, `push_device`).
- Soft deletes: user deactivation sets `is_active=False`, no hard deletes.
- Seed credentials (dev only): `superadmin` / `admin` / `manager` / `billing_operator` / `ticket_checker`, all with password `Password@123`.

## Major Subsystems

- **Customer portal** (`portal_*` routers/models + `frontend/src/app/(public)` and `frontend/src/app/customer`): public-facing site and booking flow. Separate auth (`portal_auth_service`, `portal_user`) from the staff/admin JWT auth. Email OTP verification via `otp_service`. Only active when NOT in admin-portal mode.
- **Online payments**: Airpay v3 "Simple Transaction" redirect kit (`airpay_service.py`, `portal_payment` router, `payment_transaction` model). Hosted checkout via checksum: `privatekey = SHA256(secret@user:|:pass)`, request `checksum = SHA256(SHA256(user~:~pass)@alldata)`, response verified by `crc32` `ap_SecureHash`. SUCCESS is gated on Airpay's server-side `verify.php` for LIVE txns (fail-closed); TEST/sandbox trusts the verified callback (verify.php is live-only). `PAYMENT_SIMULATION=true` forces the built-in simulator. Config: `AIRPAY_MERCHANT_ID/USERNAME/PASSWORD/SECRET_KEY/API_KEY/CLIENT_ID/BASE_URL`. See `docs/superpowers/specs/2026-05-20-airpay-migration-design.md`.
- **Admin portal feature set** (Server 2 only): D Drive (`admin_d_drive` — branch ticket summary/audit), Parameter Master, Employee Transfer (`admin_transfer`), Adjustments engine (`admin_adjustment_engine`, with rollback via `admin_rollback_service`), Sync Check (`admin_sync_check`, diffs against `SYNC_DATABASE_URL`).
- **System health + remote control** (mobile companion app): `system_health` (read-only status + push-device registration + event ingestion, gated by `HEALTH_INGEST_SECRET`), `system_actions` (SUPER_ADMIN restart/backup/ack), `backup_events` (unified backup feed, gated by `BACKUP_INGEST_SECRET`). Mounted on both deployments.
- **Realtime dashboard**: `dashboard` router exposes both HTTP stats and a WebSocket; frontend hook `useDashboardWS.ts`.
- **Thermal printing**: QZ Tray integration — backend `qz` router signs requests with `QZ_PRIVATE_KEY_PEM`; frontend `lib/qz-service.ts` + print helpers in `frontend/src/lib/print-*.ts`.
- **Email / daily reports**: `email_service` (SMTP), `daily_report_service` (scheduled loop), recipient tables for daily reports and backup notifications.

## Known Issues

- (None currently tracked. The dashboard routes under `frontend/src/app/dashboard/` are implemented — earlier "stub" notes are obsolete.)
