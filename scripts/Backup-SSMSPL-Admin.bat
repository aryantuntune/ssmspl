@echo off
REM SSMSPL Laptop Backup Sync - manual trigger
REM Pulls latest DB dumps + snapshots from Server 2 (admin) and Server 1 (prod)
REM to D:\backups\ (override via SSMSPL_LOCAL_BACKUP_DIR), then notifies the
REM backend ingest API per file.
REM Double-click to run, or schedule via Task Scheduler.

title SSMSPL Backup Sync
echo.
echo ============================================================
echo  SSMSPL Backup Sync
echo  Sources: Server 2 (admin) + Server 1 (prod)
echo  Target : D:\backups\  (override via SSMSPL_LOCAL_BACKUP_DIR)
echo ============================================================
echo.

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0laptop_backup_sync.ps1" %*

set EXIT=%ERRORLEVEL%
echo.
echo ============================================================
if "%EXIT%"=="0" (
    echo  DONE - sync completed successfully
) else (
    echo  FAILED - exit code %EXIT% - see D:\backups\sync.log for details
)
echo ============================================================
echo.
echo Press any key to close...
pause >nul
exit /b %EXIT%
