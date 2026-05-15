# laptop_backup_sync.ps1
# Pulls SSMSPL backups to the Windows laptop and notifies the backend ingest API.
#
# Sources:
#   Server 1 (prod):  jetty_admin@72.61.227.217:2222  /var/www/ssmspl/backups/
#                     -> ssmspl_db_prod_*.sql.gz                  -> D:\backups\prod-db\
#                     (no snapshots on Server 1; skipped)
#   Server 2 (admin): root@194.164.148.228               /home/ssmspl-admin-backups/
#                     -> ssmspl_admin_*.sql.gz                    -> D:\backups\admin-db\
#                     -> ssmspl_admin_server_*.tar.gz             -> D:\backups\admin-snapshots\
#
# After each per-file download (or failed attempt), POSTs an event to:
#   server1-prod    -> https://carferry.online/api/backups/events
#   server2-admin   -> https://admin.carferry.online/api/backups/events
# Header X-Backup-Ingest-Secret comes from $env:BACKUP_INGEST_SECRET; if unset, POSTs are skipped.
#
# Triggered by Windows Task Scheduler (twice daily) or manually via the .bat shortcut.
# Compatible with Windows PowerShell 5.1.
#
# Switches:
#   -DryRun   : list what would download and POST without executing scp/Invoke-RestMethod.

[CmdletBinding()]
param(
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

# Local backup root. Defaults to D:\backups; override with $env:SSMSPL_LOCAL_BACKUP_DIR.
$LocalDir = if ($env:SSMSPL_LOCAL_BACKUP_DIR) { $env:SSMSPL_LOCAL_BACKUP_DIR } else { 'D:\backups' }

# Per-source local subdirectories
$LocalAdminDbDir       = Join-Path $LocalDir 'admin-db'
$LocalAdminSnapshotDir = Join-Path $LocalDir 'admin-snapshots'
$LocalProdDbDir        = Join-Path $LocalDir 'prod-db'
$LogFile               = Join-Path $LocalDir 'sync.log'

# Per-server SSH config
$Server2 = @{
    Id              = 'server2-admin'
    SshUser         = 'root'
    SshHost         = '194.164.148.228'
    SshPort         = 22
    RemoteDir       = '/home/ssmspl-admin-backups'
    DbPattern       = 'ssmspl_admin_*.sql.gz'
    SnapshotPattern = 'ssmspl_admin_server_*.tar.gz'
    LocalDbDir      = $LocalAdminDbDir
    LocalSnapDir    = $LocalAdminSnapshotDir
    IngestUrl       = 'https://admin.carferry.online/api/backups/events'
}

$Server1 = @{
    Id              = 'server1-prod'
    SshUser         = 'jetty_admin'
    SshHost         = '72.61.227.217'
    SshPort         = 2222
    RemoteDir       = '/var/www/ssmspl/backups'
    DbPattern       = 'ssmspl_db_prod_*.sql.gz'
    SnapshotPattern = '*server*.tar.gz'
    LocalDbDir      = $LocalProdDbDir
    LocalSnapDir    = $null  # not configured on remote; checked at runtime
    IngestUrl       = 'https://carferry.online/api/backups/events'
}

# Per-run download cap (per server) to protect against runaway pulls
$MaxDownloadsPerRun = 4

# Local retention (days)
$KeepDbDays       = 14
$KeepSnapshotDays = 21

# Backend ingest secret (no hardcoded fallback)
$BackupIngestSecret = $env:BACKUP_INGEST_SECRET

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

function Write-Log {
    param([string]$Msg, [string]$ServerId = $null)
    $prefix = '[' + (Get-Date -Format 's') + ']'
    if ($ServerId) { $prefix = $prefix + ' server=' + $ServerId }
    $line = $prefix + ' ' + $Msg
    Add-Content -Path $LogFile -Value $line
    Write-Host $line
}

function Invoke-Ssh {
    param(
        [hashtable]$Server,
        [string]$RemoteCmd
    )
    $sshArgs = @(
        '-o', 'BatchMode=yes',
        '-o', 'ConnectTimeout=15',
        '-p', $Server.SshPort,
        ($Server.SshUser + '@' + $Server.SshHost),
        $RemoteCmd
    )
    return (& ssh @sshArgs)
}

function Get-RemoteSize {
    param([hashtable]$Server, [string]$RemotePath)
    try {
        $r = Invoke-Ssh -Server $Server -RemoteCmd ("stat -c %s '" + $RemotePath + "' 2>/dev/null")
        if ($LASTEXITCODE -eq 0 -and $r) { return [int64]$r } else { return -1 }
    } catch {
        return -1
    }
}

function Get-RemoteListing {
    param([hashtable]$Server, [string[]]$Patterns)
    $globs = ($Patterns | ForEach-Object { $Server.RemoteDir + '/' + $_ }) -join ' '
    $cmd = 'ls -1 ' + $globs + ' 2>/dev/null'
    $raw = Invoke-Ssh -Server $Server -RemoteCmd $cmd
    if (-not $raw) { return @() }
    return ($raw -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
}

function Get-FileSha256 {
    param([string]$Path)
    try {
        return (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    } catch {
        return $null
    }
}

function Get-Iso8601Now {
    # PS 5.1 doesn't have "K" giving +HH:MM cleanly with all formats, so build it.
    $now = Get-Date
    $offset = [TimeZoneInfo]::Local.GetUtcOffset($now)
    $sign = if ($offset.TotalMinutes -ge 0) { '+' } else { '-' }
    $absH = [math]::Abs($offset.Hours).ToString('D2')
    $absM = [math]::Abs($offset.Minutes).ToString('D2')
    return ($now.ToString('yyyy-MM-ddTHH:mm:ss') + $sign + $absH + ':' + $absM)
}

function Post-BackupEvent {
    param(
        [hashtable]$Server,
        [string]$BackupType,   # db_dump | snapshot
        [string]$Status,       # success | failed | partial
        [string]$FileName,
        [Nullable[int64]]$FileSize,
        [string]$Sha256,
        [string]$Message
    )

    if (-not $BackupIngestSecret) {
        Write-Log ('  POST skipped (no BACKUP_INGEST_SECRET configured): ' + $Status + ' ' + $FileName) -ServerId $Server.Id
        return
    }

    $body = [ordered]@{
        server_id       = $Server.Id
        backup_type     = $BackupType
        status          = $Status
        file_name       = $FileName
        file_size_bytes = $FileSize
        sha256          = $Sha256
        message         = $Message
        occurred_at     = Get-Iso8601Now
    }
    $json = $body | ConvertTo-Json -Compress

    if ($DryRun) {
        Write-Log ('  DRY-RUN POST -> ' + $Server.IngestUrl + ' : ' + $json) -ServerId $Server.Id
        return
    }

    $headers = @{
        'X-Backup-Ingest-Secret' = $BackupIngestSecret
        'Content-Type'           = 'application/json'
    }

    $maxAttempts = 3
    for ($attempt = 1; $attempt -le $maxAttempts; $attempt++) {
        try {
            $resp = Invoke-WebRequest -Uri $Server.IngestUrl -Method Post -Headers $headers -Body $json -UseBasicParsing -TimeoutSec 20
            Write-Log ('  POST ok ' + $resp.StatusCode + ' ' + $Status + ' ' + $FileName) -ServerId $Server.Id
            return
        } catch {
            $reason = $_.Exception.Message
            $code = $null
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
                $code = [int]$_.Exception.Response.StatusCode
            }
            if ($code -and $code -ge 400 -and $code -lt 500) {
                # 4xx is not retryable
                Write-Log ('  POST failed (no retry) code=' + $code + ' reason="' + $reason + '" ' + $Status + ' ' + $FileName) -ServerId $Server.Id
                return
            }
            if ($attempt -lt $maxAttempts) {
                Write-Log ('  POST attempt ' + $attempt + ' failed code=' + $code + ' reason="' + $reason + '" -- retrying in 5s') -ServerId $Server.Id
                Start-Sleep -Seconds 5
            } else {
                Write-Log ('  POST failed after ' + $maxAttempts + ' attempts code=' + $code + ' reason="' + $reason + '" ' + $Status + ' ' + $FileName) -ServerId $Server.Id
            }
        }
    }
}

function Rotate-Local {
    param([string]$Dir, [string]$Pattern, [int]$KeepDays, [string]$Label, [string]$ServerId)
    if (-not $Dir) { return }
    if (-not (Test-Path $Dir)) { return }
    $cutoff = (Get-Date).AddDays(-$KeepDays)
    $old = Get-ChildItem -Path $Dir -Filter $Pattern -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt $cutoff }
    foreach ($f in $old) {
        if ($DryRun) {
            Write-Log ('  DRY-RUN ROTATE: would remove old ' + $Label + ': ' + $f.Name + ' (mtime ' + $f.LastWriteTime.ToString('s') + ')') -ServerId $ServerId
        } else {
            Write-Log ('  ROTATE: removing old ' + $Label + ': ' + $f.Name + ' (mtime ' + $f.LastWriteTime.ToString('s') + ')') -ServerId $ServerId
            Remove-Item $f.FullName -Force
        }
    }
}

function Sync-Server {
    param([hashtable]$Server)

    Write-Log ('--- sync start (' + $Server.Id + ') ---') -ServerId $Server.Id

    # Ensure local dirs exist
    if (-not (Test-Path $Server.LocalDbDir)) {
        New-Item -ItemType Directory -Path $Server.LocalDbDir -Force | Out-Null
    }

    # Decide which patterns to query remotely. For Server 1 we probe for
    # snapshots; if none present, we skip them rather than creating any.
    $patterns = @($Server.DbPattern)
    $serverSnapDir = $Server.LocalSnapDir

    if ($null -ne $serverSnapDir) {
        $patterns += $Server.SnapshotPattern
        if (-not (Test-Path $serverSnapDir)) {
            New-Item -ItemType Directory -Path $serverSnapDir -Force | Out-Null
        }
    } else {
        # Server 1 path: probe for any *server*.tar.gz, decide at runtime
        $probe = Invoke-Ssh -Server $Server -RemoteCmd ("find " + $Server.RemoteDir + " -maxdepth 1 -name '*server*.tar.gz' 2>/dev/null | head -1")
        if ($probe) {
            Write-Log ('  detected snapshots on remote; enabling snapshot pull') -ServerId $Server.Id
            $serverSnapDir = Join-Path $LocalDir 'prod-snapshots'
            if (-not (Test-Path $serverSnapDir)) {
                New-Item -ItemType Directory -Path $serverSnapDir -Force | Out-Null
            }
            $patterns += $Server.SnapshotPattern
        } else {
            Write-Log ('  Server 1 snapshots not configured on remote -- skipping') -ServerId $Server.Id
        }
    }

    # List remote files
    $remoteListing = @()
    try {
        $remoteListing = Get-RemoteListing -Server $Server -Patterns $patterns
    } catch {
        Write-Log ('ERROR: SSH list failed: ' + $_) -ServerId $Server.Id
        return
    }

    if (-not $remoteListing -or $remoteListing.Count -eq 0) {
        Write-Log 'WARN: no remote backup files found' -ServerId $Server.Id
        return
    }

    Write-Log ('remote has ' + $remoteListing.Count + ' total backup file(s)') -ServerId $Server.Id

    # Classify + decide what to pull (newest first)
    $toPull = @()
    foreach ($remotePath in ($remoteListing | Sort-Object -Descending)) {
        $name = Split-Path $remotePath -Leaf
        $isSnapshot = $name -like '*server*.tar.gz'
        if ($isSnapshot) {
            $backupType = 'snapshot'
            $localPath = Join-Path $serverSnapDir $name
        } else {
            $backupType = 'db_dump'
            $localPath = Join-Path $Server.LocalDbDir $name
        }
        if (Test-Path $localPath) {
            $localSize = (Get-Item $localPath).Length
            $remoteSize = Get-RemoteSize -Server $Server -RemotePath $remotePath
            if ($remoteSize -gt 0 -and $remoteSize -ne $localSize) {
                Write-Log ('  size mismatch on ' + $name + ' (local=' + $localSize + ' remote=' + $remoteSize + ') -- will re-pull') -ServerId $Server.Id
                $toPull += @{
                    Path       = $remotePath
                    Name       = $name
                    LocalPath  = $localPath
                    BackupType = $backupType
                }
            }
        } else {
            $toPull += @{
                Path       = $remotePath
                Name       = $name
                LocalPath  = $localPath
                BackupType = $backupType
            }
        }
    }

    if ($toPull.Count -eq 0) {
        Write-Log 'all remote files already present locally - nothing to pull' -ServerId $Server.Id
    } else {
        Write-Log ($toPull.Count.ToString() + ' file(s) to pull') -ServerId $Server.Id
    }

    # Apply per-run cap
    if ($toPull.Count -gt $MaxDownloadsPerRun) {
        $skipped = $toPull.Count - $MaxDownloadsPerRun
        Write-Log ('  CAP: limiting this run to ' + $MaxDownloadsPerRun + ' newest; deferring ' + $skipped + ' older file(s) to next run') -ServerId $Server.Id
        $toPull = $toPull[0..($MaxDownloadsPerRun - 1)]
    }

    # Pull each + POST event
    $pulled = 0
    $failed = 0
    foreach ($item in $toPull) {
        Write-Log ('  PULL ' + $item.Name) -ServerId $Server.Id

        if ($DryRun) {
            Write-Log ('  DRY-RUN scp ' + $Server.SshUser + '@' + $Server.SshHost + ':' + $item.Path + ' -> ' + $item.LocalPath) -ServerId $Server.Id
            Post-BackupEvent -Server $Server -BackupType $item.BackupType -Status 'success' -FileName $item.Name -FileSize $null -Sha256 $null -Message '(dry-run)'
            $pulled++
            continue
        }

        $scpFailed = $false
        $errMsg = $null
        try {
            $scpArgs = @(
                '-o', 'BatchMode=yes',
                '-o', 'ConnectTimeout=20',
                '-o', 'ServerAliveInterval=15',
                '-P', $Server.SshPort,
                ($Server.SshUser + '@' + $Server.SshHost + ':' + $item.Path),
                $item.LocalPath
            )
            & scp @scpArgs
            if ($LASTEXITCODE -ne 0) {
                $scpFailed = $true
                $errMsg = 'scp exit code ' + $LASTEXITCODE
            }
        } catch {
            $scpFailed = $true
            $errMsg = $_.ToString()
        }

        if ($scpFailed) {
            Write-Log ('    ERROR: ' + $errMsg) -ServerId $Server.Id
            Post-BackupEvent -Server $Server -BackupType $item.BackupType -Status 'failed' -FileName $item.Name -FileSize $null -Sha256 $null -Message $errMsg
            $failed++
            continue
        }

        if (-not (Test-Path $item.LocalPath)) {
            $errMsg = 'scp completed but file missing locally'
            Write-Log ('    ERROR: ' + $errMsg) -ServerId $Server.Id
            Post-BackupEvent -Server $Server -BackupType $item.BackupType -Status 'failed' -FileName $item.Name -FileSize $null -Sha256 $null -Message $errMsg
            $failed++
            continue
        }

        $localSize = (Get-Item $item.LocalPath).Length
        $remoteSize = Get-RemoteSize -Server $Server -RemotePath $item.Path
        if ($remoteSize -gt 0 -and $remoteSize -ne $localSize) {
            $errMsg = 'size mismatch after pull (local=' + $localSize + ' remote=' + $remoteSize + ')'
            Write-Log ('    ERROR: ' + $errMsg) -ServerId $Server.Id
            Post-BackupEvent -Server $Server -BackupType $item.BackupType -Status 'failed' -FileName $item.Name -FileSize $localSize -Sha256 $null -Message $errMsg
            $failed++
            continue
        }

        $sz = [math]::Round($localSize / 1048576, 1)
        Write-Log ('    saved ' + $item.Name + ' (' + $sz + ' megabytes)') -ServerId $Server.Id
        $sha = Get-FileSha256 -Path $item.LocalPath
        Post-BackupEvent -Server $Server -BackupType $item.BackupType -Status 'success' -FileName $item.Name -FileSize $localSize -Sha256 $sha -Message $null
        $pulled++
    }

    Write-Log ('pulled ' + $pulled + ' file(s), ' + $failed + ' failure(s)') -ServerId $Server.Id

    # Local retention
    Rotate-Local -Dir $Server.LocalDbDir -Pattern $Server.DbPattern -KeepDays $KeepDbDays -Label 'DB dump' -ServerId $Server.Id
    if ($serverSnapDir) {
        Rotate-Local -Dir $serverSnapDir -Pattern $Server.SnapshotPattern -KeepDays $KeepSnapshotDays -Label 'snapshot' -ServerId $Server.Id
    }

    # Inventory summary
    $dbCount = (Get-ChildItem -Path $Server.LocalDbDir -Filter $Server.DbPattern -ErrorAction SilentlyContinue).Count
    $snapCount = 0
    if ($serverSnapDir -and (Test-Path $serverSnapDir)) {
        $snapCount = (Get-ChildItem -Path $serverSnapDir -Filter $Server.SnapshotPattern -ErrorAction SilentlyContinue).Count
    }
    Write-Log ('local inventory: ' + $dbCount + ' DB dump(s), ' + $snapCount + ' snapshot(s)') -ServerId $Server.Id

    Write-Log ('--- sync end (' + $Server.Id + ') ---') -ServerId $Server.Id
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if (-not (Test-Path $LocalDir)) { New-Item -ItemType Directory -Path $LocalDir -Force | Out-Null }

Write-Log '=== sync run start ==='
if ($DryRun)              { Write-Log 'DRY-RUN mode: no scp, no POST, no rotate' }
if (-not $BackupIngestSecret) { Write-Log 'WARN: BACKUP_INGEST_SECRET not set -- POSTs will be skipped' }

# Server 2 (admin) first, matches prior behavior
Sync-Server -Server $Server2

# Server 1 (prod) second
Sync-Server -Server $Server1

Write-Log '=== sync run end ==='
exit 0
