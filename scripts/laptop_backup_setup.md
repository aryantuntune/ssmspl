# Laptop Backup Sync — setup

The Windows laptop pulls DB dumps and snapshots from the two production
servers and notifies the SSMSPL backend after each file. This doc covers
configuring the scheduled tasks, the ingest secret env var, and any
one-time migration from the legacy `D:\backups\sync-admin-backup.ps1`
location.

## Script paths

- PowerShell script: `D:\workspace\ssmspl\scripts\laptop_backup_sync.ps1`
- `.bat` shortcut  : `D:\workspace\ssmspl\scripts\Backup-SSMSPL-Admin.bat`
- Local data root  : `D:\backups\` (override with env var `SSMSPL_LOCAL_BACKUP_DIR`)
- Log file         : `D:\backups\sync.log`

The script never writes to the git repo. Backup blobs (~65 GB) stay in
`D:\backups\`, outside the repo.

## Local layout

```
D:\backups\
  admin-db\          ssmspl_admin_*.sql.gz
  admin-snapshots\   ssmspl_admin_server_*.tar.gz
  prod-db\           ssmspl_db_prod_*.sql.gz
  prod-snapshots\    (auto-created only if Server 1 ever has snapshots)
  sync.log
```

## Ingest secret env var

The script reads `BACKUP_INGEST_SECRET` from the environment and sends it
as the `X-Backup-Ingest-Secret` header. If unset, the script still runs
and downloads files, but skips all POSTs with a clear log line.

Set it as a USER env var (so it's visible to Task Scheduler runs under
the same user account):

```powershell
[Environment]::SetEnvironmentVariable('BACKUP_INGEST_SECRET','<paste-secret-here>','User')
```

To verify in a NEW PowerShell window (existing windows won't see it):

```powershell
$env:BACKUP_INGEST_SECRET
```

The same secret value must be configured on both backends
(`carferry.online` and `admin.carferry.online`). See the backend agent's
work for that side.

## (Re)create the scheduled tasks at the new path

Run these in an **elevated** PowerShell. The old tasks pointed at
`D:\backups\sync-admin-backup.ps1`; we delete and recreate them at the
new repo location.

```powershell
# Remove the old tasks (if they exist)
schtasks /Delete /TN "SSMSPL-AdminBackup-Sync-Morning" /F
schtasks /Delete /TN "SSMSPL-AdminBackup-Sync-Evening" /F

# Recreate at the new path
$script = 'D:\workspace\ssmspl\scripts\laptop_backup_sync.ps1'

schtasks /Create `
    /TN "SSMSPL-AdminBackup-Sync-Morning" `
    /SC DAILY /ST 09:00 `
    /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$script`"" `
    /RL HIGHEST /F

schtasks /Create `
    /TN "SSMSPL-AdminBackup-Sync-Evening" `
    /SC DAILY /ST 18:00 `
    /TR "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$script`"" `
    /RL HIGHEST /F
```

Verify:

```powershell
schtasks /Query /TN "SSMSPL-AdminBackup-Sync-Morning" /V /FO LIST
schtasks /Query /TN "SSMSPL-AdminBackup-Sync-Evening" /V /FO LIST
```

Trigger an on-demand run (uses the same env, including BACKUP_INGEST_SECRET):

```powershell
schtasks /Run /TN "SSMSPL-AdminBackup-Sync-Morning"
```

## Manual / dev run

```powershell
# Preview what would happen, no scp / no POST
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
    D:\workspace\ssmspl\scripts\laptop_backup_sync.ps1 -DryRun

# Real run
powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
    D:\workspace\ssmspl\scripts\laptop_backup_sync.ps1
```

The `.bat` shortcut forwards any args, so `Backup-SSMSPL-Admin.bat -DryRun`
works for double-click users too (use a shortcut with the arg, or run
from a terminal).

## Old script — clean up after verifying

After at least one successful run from the new path (check `D:\backups\sync.log`
for entries from BOTH `server=server1-prod` and `server=server2-admin`),
delete the legacy copies:

```powershell
Remove-Item D:\backups\sync-admin-backup.ps1
Remove-Item D:\backups\Backup-SSMSPL-Admin.bat
```

Don't delete `D:\backups\admin-db\`, `D:\backups\admin-snapshots\`, or
`D:\backups\sync.log` — those are data.

## To also enable Server 1 snapshots

Server 1 (`carferry.online`) currently has **only DB dumps** in
`/var/www/ssmspl/backups/` (pattern `ssmspl_db_prod_*.sql.gz`). It does
NOT produce any `*server*.tar.gz` snapshot tarballs.

This script intentionally does NOT create one on the remote — the user
is explicit that any change to Server 1 needs separate explicit approval.

To enable Server 1 snapshots in the future, the operator must (out of
scope for this script):

1. Decide where on Server 1 the snapshots should live (likely
   `/var/www/ssmspl/backups/` alongside DB dumps).
2. Set up the snapshot cron on Server 1 itself (similar to the Server 2
   admin snapshot mechanism), with file names matching the existing
   pattern `*server*.tar.gz`.
3. Confirm the snapshots are owned by a group the `jetty_admin` SSH user
   can read.

Once those exist, the script auto-detects them on next run (it does a
`find ... -name '*server*.tar.gz'` probe before each Server 1 sync) and
begins pulling them to `D:\backups\prod-snapshots\`, retention 21d, with
the same per-file POST notifications.

## Server contact summary

| Server | Branch | SSH | Remote backup dir | Local dir |
|--------|--------|-----|--------------------|-----------|
| 1 (prod, `carferry.online`)        | `main`  | `jetty_admin@72.61.227.217:2222` | `/var/www/ssmspl/backups/` | `D:\backups\prod-db\` |
| 2 (admin, `admin.carferry.online`) | `admin` | `root@194.164.148.228`           | `/home/ssmspl-admin-backups/` | `D:\backups\admin-db\` + `D:\backups\admin-snapshots\` |

The script POSTs each event to the **matching** server's API:

- `server1-prod` events  → `https://carferry.online/api/backups/events`
- `server2-admin` events → `https://admin.carferry.online/api/backups/events`

Each POST includes header `X-Backup-Ingest-Secret: $env:BACKUP_INGEST_SECRET`.
