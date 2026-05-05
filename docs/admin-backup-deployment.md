# Admin DB Backup — Server 2 Deployment

> Operator runbook for enabling automated `pg_dump` backups + Google Drive
> sync on **Server 2** (the admin portal, `admin.carferry.online`,
> backing the `ssmspl_admin` database).

This reuses the exact same scripts that run on Server 1 (prod) — the
behavior is now driven by env vars so the same `backup_db.sh`,
`sync_backup_gdrive.sh`, and `notify_backup.sh` work transparently for
either database. The Backups settings tab in the admin portal UI will
populate automatically once the scripts run.

**Do not run any of this against Server 1 (prod).** Prod already has
backups configured and its cron must keep working unchanged.

---

## What you're setting up

1. A host directory `/var/www/ssmspl-admin/backups` that the
   `admin-backend` container mounts at `/app/backups`.
2. The three shell scripts copied into a stable location on the host.
3. A cron schedule that:
   - Runs `backup_db.sh` daily at 2:00 AM IST.
   - Runs `sync_backup_gdrive.sh` every 5 minutes (cheap no-op when nothing changed).
4. `rclone` with a Google Drive remote scoped to a **different folder**
   from prod (`SSMSPL-Admin-Backups`).
5. `msmtp` so failure notifications fire on the admin DB independently.

---

## 0. Prerequisites on Server 2

```bash
sudo apt update
sudo apt install -y rclone msmtp msmtp-mta jq postgresql-client
```

`postgresql-client` ships `pg_dump`, which the host script needs because
the admin compose file does not run a `db-backup` sidecar — Server 2
backs up via host cron pointing at the host-network Postgres.

> If on Server 2 you **want** the same in-container scheduler pattern as
> prod, you can copy the `db-backup` service block from
> `docker-compose.prod.yml` into a `docker-compose.admin.override.yml` and
> set `BACKUP_DB_NAME=ssmspl_admin`, `BACKUP_OUTPUT_DIR=/backups`,
> `BACKUP_GDRIVE_REMOTE_DIR=SSMSPL-Admin-Backups` on it. The
> backwards-compatible env-var changes in `backup_db.sh` make either
> deployment style work. The host-cron path documented below is the
> simpler default.

---

## 1. Pull latest admin branch on Server 2

Per `CLAUDE.md`, Server 2 is a tar-synced folder. Copy the updated tree
across so it has the new env-var-driven scripts:

```bash
# From your dev box (NOT inside this isolated worktree — use your own admin checkout):
git checkout admin
git pull
# build a clean tar (mirroring whatever your existing deploy step does) and
# rsync it to /var/www/ssmspl-admin/ on Server 2.
```

Verify these files exist on Server 2 after sync:

```bash
ls -l /var/www/ssmspl-admin/backend/scripts/backup_db.sh
ls -l /var/www/ssmspl-admin/backend/scripts/sync_backup_gdrive.sh
ls -l /var/www/ssmspl-admin/backend/scripts/notify_backup.sh
ls -l /var/www/ssmspl-admin/docker-compose.admin.yml
```

Make them executable:

```bash
chmod +x /var/www/ssmspl-admin/backend/scripts/backup_db.sh
chmod +x /var/www/ssmspl-admin/backend/scripts/sync_backup_gdrive.sh
chmod +x /var/www/ssmspl-admin/backend/scripts/notify_backup.sh
```

---

## 2. Create the backups directory

```bash
sudo mkdir -p /var/www/ssmspl-admin/backups
sudo chown -R "$USER":"$USER" /var/www/ssmspl-admin/backups
chmod 755 /var/www/ssmspl-admin/backups
```

The compose file already binds this to `/app/backups` inside the
admin-backend container.

---

## 3. Add backup env vars to `backend/.env.admin`

Append the following block. **`BACKUP_DB_NAME` is the only critical
one** — the rest just tag the output cleanly so admin and prod backups
don't collide if you ever look at them side by side.

```dotenv
# ── DB Backup configuration (host scripts read these) ─────────────
# Database to dump — separate from the connection POSTGRES_DB if needed.
BACKUP_DB_NAME=ssmspl_admin
# Where the dumps land on the host (also where the backend reads status).
BACKUP_OUTPUT_DIR=/var/www/ssmspl-admin/backups
# Sub-folder name in the configured rclone remote.
BACKUP_GDRIVE_REMOTE_DIR=SSMSPL-Admin-Backups
# Email subject / body label so admin DB emails are obvious.
BACKUP_NOTIFY_LABEL=SSMSPL Admin
# Optional: global recipient (DB-driven recipients in the UI also work).
BACKUP_NOTIFY_EMAIL=
```

Restart the admin-backend container so it picks up the new env file:

```bash
cd /var/www/ssmspl-admin
docker compose -f docker-compose.admin.yml up -d --force-recreate admin-backend
```

Verify the volume mount took effect:

```bash
docker exec admin-backend ls -la /app/backups
```

It should be writable by the container user (file ownership only matters
for the dot-files the backend itself writes — see "DB-driven recipient
list" below).

---

## 4. Configure rclone for Google Drive (use a separate remote name)

**Use a different remote name from prod**, e.g. `gdrive_admin`. This
keeps OAuth scopes / token files separate and prevents an accidental
typo from writing admin dumps into the prod folder.

```bash
sudo -i    # rclone config typically lives under root if cron runs as root
rclone config
```

Pick `n` for new remote, name it `gdrive_admin`, type `drive` (Google
Drive), accept defaults, complete the OAuth flow in your browser
(headless: pick `n` for auto-config, paste the verification token).

Verify:

```bash
rclone lsd gdrive_admin:
rclone mkdir gdrive_admin:SSMSPL-Admin-Backups
rclone lsd gdrive_admin:SSMSPL-Admin-Backups
```

---

## 5. Configure msmtp (Gmail SMTP) for backup notification emails

If Server 1 already has `/etc/msmtprc` configured for the same
sender Gmail account, you can reuse the same file on Server 2 — no
changes needed. Otherwise, follow the same setup as prod (App Password,
TLS on port 587). The admin emails will simply be tagged "SSMSPL Admin"
in the subject/body via `BACKUP_NOTIFY_LABEL`.

```bash
sudo -e /etc/msmtprc       # edit if missing
sudo chmod 600 /etc/msmtprc
sudo chown root:root /etc/msmtprc

# smoke test
echo "Subject: msmtp test"$'\n\n'"hello" | msmtp YOUR_EMAIL@example.com
```

---

## 6. Wire up cron

Edit root's crontab (cron must run as a user that can write into
`/var/www/ssmspl-admin/backups`; root is simplest):

```bash
sudo crontab -e
```

Add these lines (set `TZ` so the 02:00 trigger is IST, matching prod):

```cron
# ── SSMSPL Admin DB backup (Server 2) ──────────────────────────────
TZ=Asia/Kolkata
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Daily dump at 02:00 IST
0 2 * * * BACKUP_DB_NAME=ssmspl_admin BACKUP_OUTPUT_DIR=/var/www/ssmspl-admin/backups POSTGRES_USER=ssmspl_admin_user POSTGRES_PASSWORD='REPLACE_ME' PGHOST=127.0.0.1 PGPORT=5432 BACKUP_NOTIFY_LABEL='SSMSPL Admin' /var/www/ssmspl-admin/backend/scripts/backup_db.sh >> /var/log/ssmspl-admin-backup.log 2>&1 && touch /var/www/ssmspl-admin/backups/.sync_needed

# Sync to Google Drive — runs every 5 min; exits silently if .sync_needed is absent
*/5 * * * * BACKUP_OUTPUT_DIR=/var/www/ssmspl-admin/backups RCLONE_REMOTE=gdrive_admin BACKUP_GDRIVE_REMOTE_DIR=SSMSPL-Admin-Backups BACKUP_NOTIFY_LABEL='SSMSPL Admin' /var/www/ssmspl-admin/backend/scripts/sync_backup_gdrive.sh >> /var/log/ssmspl-admin-backup-sync.log 2>&1

# Daily safety-net sync at 02:15 IST regardless of trigger file
15 2 * * * BACKUP_OUTPUT_DIR=/var/www/ssmspl-admin/backups RCLONE_REMOTE=gdrive_admin BACKUP_GDRIVE_REMOTE_DIR=SSMSPL-Admin-Backups BACKUP_NOTIFY_LABEL='SSMSPL Admin' /var/www/ssmspl-admin/backend/scripts/sync_backup_gdrive.sh --force >> /var/log/ssmspl-admin-backup-sync.log 2>&1
```

Replace `POSTGRES_USER` / `POSTGRES_PASSWORD` / `PGHOST` / `PGPORT` to
match how the admin DB is reachable from the host. If admin Postgres
runs in a docker bridge that's not host-bound, expose port 5432 to
127.0.0.1 first or run the script inside an ephemeral container with
`--network admin-net`.

Pre-create the log files so the first cron run isn't blocked by
permissions:

```bash
sudo touch /var/log/ssmspl-admin-backup.log /var/log/ssmspl-admin-backup-sync.log
sudo chmod 644 /var/log/ssmspl-admin-backup*.log
```

---

## 7. Smoke test (do this BEFORE leaving the SSH session)

Run a one-shot manual backup:

```bash
sudo BACKUP_DB_NAME=ssmspl_admin \
     BACKUP_OUTPUT_DIR=/var/www/ssmspl-admin/backups \
     POSTGRES_USER=ssmspl_admin_user \
     POSTGRES_PASSWORD='REPLACE_ME' \
     PGHOST=127.0.0.1 PGPORT=5432 \
     BACKUP_NOTIFY_LABEL='SSMSPL Admin' \
     /var/www/ssmspl-admin/backend/scripts/backup_db.sh
```

Check the resulting file:

```bash
ls -lh /var/www/ssmspl-admin/backups/ssmspl_admin_*.sql.gz
gzip -t /var/www/ssmspl-admin/backups/ssmspl_admin_*.sql.gz   # integrity
```

Trigger the sync:

```bash
sudo touch /var/www/ssmspl-admin/backups/.sync_needed
sudo BACKUP_OUTPUT_DIR=/var/www/ssmspl-admin/backups \
     RCLONE_REMOTE=gdrive_admin \
     BACKUP_GDRIVE_REMOTE_DIR=SSMSPL-Admin-Backups \
     BACKUP_NOTIFY_LABEL='SSMSPL Admin' \
     /var/www/ssmspl-admin/backend/scripts/sync_backup_gdrive.sh --force
```

Verify on Google Drive:

```bash
rclone ls gdrive_admin:SSMSPL-Admin-Backups
```

---

## 8. Verify the admin portal UI sees it

Open https://admin.carferry.online → Settings → Backups tab.

You should see:

- Last backup time / file / size for the dump you just ran.
- Last sync time and total GDrive count.
- The full backup file listed in the history table with the cloud icon.
- The "Trigger backup now" button works (it writes a `.trigger` file
  into the mounted volume — the host cron above does NOT watch this
  file, see "Open question" below).

---

## DB-driven recipient list

The Backups tab lets a SUPER_ADMIN add notification email recipients.
The backend writes these to `<BACKUP_OUTPUT_DIR>/.notify_emails`, which
`notify_backup.sh` reads. For this to work the file must be writable by
the **container user** (the backend writes it) AND readable by the
**cron user** (root reads it). The simplest fix is `chmod 666` on the
file or matching UIDs. Verify after first recipient is added:

```bash
ls -l /var/www/ssmspl-admin/backups/.notify_emails
cat /var/www/ssmspl-admin/backups/.notify_emails
```

---

## Open question / caveat — manual "Trigger backup" button

On prod, the in-container `db-backup` scheduler watches for
`.trigger`. With the host-cron-only setup above, **the manual trigger
button will create the file but nothing consumes it**. Two options
when the operator is ready to address this:

1. **Recommended:** Add a `db-backup` sidecar to
   `docker-compose.admin.yml` that mirrors the prod pattern but with
   `BACKUP_DB_NAME=ssmspl_admin`,
   `BACKUP_GDRIVE_REMOTE_DIR=SSMSPL-Admin-Backups`,
   `BACKUP_OUTPUT_DIR=/backups`, mounting `./backups:/backups`.
   The backend, the host cron, and the sidecar would all agree.
2. **Quick & dirty:** Add a 1-minute cron entry on the host that runs
   `backup_db.sh` whenever `.trigger` exists, then `rm` it.

For the initial rollout, document this in the UI or simply rely on the
daily 2 AM run; the data warehouse / analytics team rarely needs
on-demand admin DB dumps.

---

## Rollback

If anything goes wrong:

```bash
sudo crontab -e          # remove the three cron lines added above
docker compose -f docker-compose.admin.yml up -d --force-recreate admin-backend  # remount without /app/backups if you also reverted the compose file
```

Backups already taken stay on disk and on Google Drive — they aren't
deleted by removing cron. Drop them manually with `rclone delete` and
`rm` if needed.
