# Deployment Steps — 9 March 2026

## Pre-Deployment: SSH into VPS

```bash
ssh your-user@your-vps
cd /path/to/ssmspl
```

## Step 1: Pull Latest Code

```bash
git pull origin main
```

## Step 2: Run Database Migration (NEW COLUMNS)

The single-session feature adds two new columns to the `users` table:
- `active_session_id` (VARCHAR 36, nullable)
- `session_last_active` (TIMESTAMP WITH TIME ZONE, nullable)

```bash
docker compose exec backend alembic upgrade head
```

**Verify migration ran:**
```bash
docker compose exec backend alembic current
```
Should show: `8bfe9649daad (head)`

## Step 3: Rebuild & Restart All Services

```bash
docker compose up --build -d
```

## Step 4: Verify Services Are Running

```bash
docker compose ps
docker compose logs --tail=20 backend
docker compose logs --tail=20 frontend
```

---

## What Changed Today

### 1. Single-Session Enforcement (requires migration)
- Each user account can only have ONE active session at a time
- Second login attempt is rejected with "already logged in" message
- If system/browser crashes, session auto-expires after 2 minutes of no API activity
- Proper logout clears session immediately
- **All existing users will be forced to re-login once** (their old JWTs don't have session ID)

### 2. Reprint Restricted to MANAGER+
- Billing operators can no longer reprint tickets
- Only SUPER_ADMIN, ADMIN, MANAGER see the reprint button

### 3. Filter Scoping Fixes
- "Clear Filters" no longer resets route lock for scoped users
- "Clear Filters" button no longer always shows as active for scoped users
- Item-rates page same fix for managers
- SUPER_ADMIN can now edit tickets (was missing, only ADMIN could)

---

## Quick Rollback (if something breaks)

```bash
# Revert migration
docker compose exec backend alembic downgrade -1

# Revert code
git revert HEAD
docker compose up --build -d
```

## One-Liner (if you're confident)

```bash
git pull && docker compose exec backend alembic upgrade head && docker compose up --build -d
```
