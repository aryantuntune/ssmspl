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
- **Config**: `pydantic-settings` in `config.py`. Loads from `.env.development` by default (hardcoded in `SettingsConfigDict`). Cached via `@lru_cache`.
- **Database**: PostgreSQL 16 via `asyncpg`. Connection pool: size=10, max_overflow=20. `get_db()` yields a session that auto-commits/rollbacks.
- **Swagger/ReDoc**: Only available when `DEBUG=true` at `/docs` and `/redoc`.

### Frontend (`frontend/src/`)

- **Framework**: Next.js App Router with `src/` directory layout, TypeScript strict mode, Tailwind CSS v4.
- **Auth flow**: Login POSTs to `/api/auth/login`, tokens stored in cookies (`ssmspl_access_token`, `ssmspl_refresh_token`) via `js-cookie`. Axios interceptor in `lib/api.ts` attaches Bearer token and redirects to `/login` on 401.
- **Navigation permissions are server-controlled**: Backend `ROLE_MENU_ITEMS` dict in `core/rbac.py` is the authority. `/api/auth/me` returns `menu_items` list; frontend `Sidebar` maps these strings to routes.
- **Path alias**: `@/*` maps to `./src/*` (tsconfig paths).

### RBAC (5 roles)

`SUPER_ADMIN > ADMIN > MANAGER > BILLING_OPERATOR > TICKET_CHECKER`

Roles are defined in `backend/app/core/rbac.py` as a Python `str, Enum`. Menu items per role are in the `ROLE_MENU_ITEMS` dict in the same file.

### Test Setup

- Tests use a separate `ssmspl_db_test` database (hardcoded URL in `tests/conftest.py`).
- `asyncio_mode = auto` — all async tests run automatically.
- `conftest.py` overrides `get_db` dependency with a test session and creates/drops all tables per session.
- Fixtures: `client` (httpx `AsyncClient` via `ASGITransport`), `db_session`, `super_admin_user`.

### Database

- DDL in `backend/scripts/ddl.sql`, seed data in `backend/scripts/seed_data.sql`.
- Tables: `users` (UUID PK), `refresh_tokens` (DB-backed token rotation via `token_service`).
- Soft deletes: user deactivation sets `is_active=False`, no hard deletes.
- Seed credentials (dev only): `superadmin` / `admin` / `manager` / `billing_operator` / `ticket_checker`, all with password `Password@123`.

## Known Issues

- **Most dashboard routes are stubs**: Only `/dashboard` is implemented. Routes like `/dashboard/users`, `/dashboard/ferries`, etc. are sidebar links without pages.
