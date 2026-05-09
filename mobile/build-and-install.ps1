# SSMSPL SuperAdmin — build debug APK & install on connected phone.
# Run from PowerShell in this directory (mobile/).

$ErrorActionPreference = "Stop"

# ── env ──────────────────────────────────────────────────────────────
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:JAVA_HOME    = "C:\installations\jdk-17.0.2"
$env:Path = "$env:ANDROID_HOME\platform-tools;$env:JAVA_HOME\bin;$env:Path"

if (-not (Test-Path "$env:ANDROID_HOME\platform-tools\adb.exe")) {
    Write-Host "ERROR: adb not found at $env:ANDROID_HOME\platform-tools" -ForegroundColor Red
    exit 1
}

# ── pick the connected device ────────────────────────────────────────
$devices = & adb devices | Select-Object -Skip 1 | Where-Object { $_ -match '\sdevice$' }
if (-not $devices) {
    Write-Host "ERROR: no authorized devices. Plug in phone, tap 'Allow' on USB-debug prompt." -ForegroundColor Red
    exit 1
}
$deviceId = ($devices[0] -split '\s+')[0]
Write-Host "→ Using device: $deviceId" -ForegroundColor Cyan

# ── prebuild ──────────────────────────────────────────────────────────
if (-not (Test-Path "android\settings.gradle")) {
    Write-Host "→ Running expo prebuild (one-time)…" -ForegroundColor Cyan
    npx --yes expo prebuild --platform android --clean
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

# ── build release APK (debug builds require Metro dev server — unusable for sideload) ──
Write-Host "→ Compiling release APK with Gradle (first build ~5-10 min)…" -ForegroundColor Cyan
Push-Location android
try {
    # Invoke via cmd.exe so PowerShell 5.1's NativeCommandError doesn't trip
    # on harmless gradlew warnings written to stderr (e.g. "SDK XML version 4
    # was encountered" — non-fatal, but PS treats native-cmd stderr as throw
    # under StrictMode and fails the script). cmd's `2>&1` merges streams at
    # the OS level before PS sees them.
    cmd /c "gradlew.bat assembleRelease --no-daemon 2>&1"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Gradle build FAILED" -ForegroundColor Red
        exit $LASTEXITCODE
    }
} finally {
    Pop-Location
}

$apk = "android\app\build\outputs\apk\release\app-release.apk"
if (-not (Test-Path $apk)) {
    Write-Host "ERROR: APK not found at $apk" -ForegroundColor Red
    exit 1
}

$apkSize = [math]::Round((Get-Item $apk).Length / 1MB, 1)
Write-Host "→ APK built: $apk ($apkSize MB)" -ForegroundColor Green

# ── install ───────────────────────────────────────────────────────────
Write-Host "→ Installing on $deviceId…" -ForegroundColor Cyan
& adb -s $deviceId install -r $apk
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: install failed (try `adb -s $deviceId uninstall com.ssmspl.superadmin` first)" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "" -ForegroundColor Green
Write-Host "✓ DONE — open 'SSMSPL SuperAdmin' on your phone." -ForegroundColor Green
Write-Host "  Login with your SUPER_ADMIN account against https://admin.carferry.online" -ForegroundColor Gray

# ── launch on phone ──────────────────────────────────────────────────
& adb -s $deviceId shell monkey -p com.ssmspl.superadmin -c android.intent.category.LAUNCHER 1 | Out-Null
