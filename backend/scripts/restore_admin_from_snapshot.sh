#!/usr/bin/env bash
# restore_admin_from_snapshot.sh
# -----------------------------------------------------------------------------
# Disaster-recovery: bootstrap a FRESH Ubuntu host into a running SSMSPL
# admin portal (admin.carferry.online) from two artifacts:
#
#   1. <snapshot.tar.gz>   tarball rooted at / with all admin config + code
#   2. <db_dump.sql.gz>    pg_dump --clean --if-exists of `ssmspl_admin`
#
# This is intended to run on a green-field host. It has explicit guards
# against silently clobbering an existing install (see Phase C step 12).
#
# Re-runnability: every destructive step is idempotent or refuses + bails
# if it detects a non-fresh state. You can safely re-invoke after a partial
# failure.
#
# Coding standards:
#   - set -euo pipefail + ERR trap with line numbers
#   - Pure bash + apt-installed CLIs only; NO python, NO 3rd-party gems
#   - Sensitive values (DB pw, SMTP pw) are NEVER echoed
# -----------------------------------------------------------------------------

set -Eeuo pipefail

# -----------------------------------------------------------------------------
# Globals
# -----------------------------------------------------------------------------
SCRIPT_NAME="$(basename "$0")"
SCRIPT_VERSION="1.0.0"
EPOCH="$(date +%s)"
LOG_PREFIX="[restore-admin]"

# Defaults — overridable via flags
DRY_RUN=false
SKIP_SYSTEM_PACKAGES=false
SKIP_TLS=false
SKIP_NGINX_RELOAD=false
FORCE_DB_REPLACE=false
PG_SUPERUSER="postgres"
TARGET_DB="ssmspl_admin"
TARGET_USER="ssmspl_admin_user"
DB_PASSWORD_OVERRIDE=""
CERTBOT_EMAIL=""

SNAPSHOT_FILE=""
DB_DUMP_FILE=""

ADMIN_DIR="/var/www/ssmspl-admin"
COMPOSE_FILE="${ADMIN_DIR}/docker-compose.admin.yml"
BACKUP_ENV_FILE="/etc/ssmspl-admin-backup.env"
MONITOR_CONF_FILE="/etc/ssmspl_monitor.conf"
NGINX_SITE="admin.carferry.online"
CERT_LIVE_DIR="/etc/letsencrypt/live/${NGINX_SITE}"

# Exit codes
EX_OK=0
EX_VALIDATION=1
EX_PREREQ=2
EX_RESTORE=3
EX_POSTCHECK=4

# -----------------------------------------------------------------------------
# Logging + error handling
# -----------------------------------------------------------------------------
log() {
    # log <LEVEL> <message...>
    local level="$1"; shift
    printf '%s %s [%s] %s\n' "$LOG_PREFIX" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$level" "$*"
}
info()  { log INFO  "$*"; }
warn()  { log WARN  "$*" >&2; }
error() { log ERROR "$*" >&2; }

on_err() {
    local rc=$?
    local lineno=$1
    local cmd=$2
    error "FAILED at line ${lineno}: '${cmd}' (exit=${rc})"
    error "If this was a partial run, the script is safe to re-invoke once the cause is fixed."
    exit "$rc"
}
trap 'on_err ${LINENO} "${BASH_COMMAND}"' ERR

die() {
    local code="$1"; shift
    error "$*"
    exit "$code"
}

is_interactive() {
    [ -t 0 ]
}

confirm() {
    # confirm "prompt text"  -> y/N, defaults to NO. Auto-NO in non-interactive.
    local prompt="$1"
    if ! is_interactive; then
        warn "Non-interactive shell — auto-declining: ${prompt}"
        return 1
    fi
    local ans=""
    read -r -p "${prompt} [y/N]: " ans || true
    [[ "$ans" =~ ^[Yy]$ ]]
}

run() {
    # Wrap any side-effecting command. Honors --dry-run.
    if $DRY_RUN; then
        info "DRY-RUN: $*"
        return 0
    fi
    "$@"
}

# -----------------------------------------------------------------------------
# Usage
# -----------------------------------------------------------------------------
usage() {
    cat <<EOF
${SCRIPT_NAME} v${SCRIPT_VERSION}

Restore a fresh Ubuntu host into a running SSMSPL admin portal.

Usage:
  ${SCRIPT_NAME} [options] <snapshot.tar.gz> <db_dump.sql.gz>

Options:
  --dry-run                Print all actions without executing.
  --skip-system-packages   Assume docker, postgres-16, certbot already installed.
  --postgres-superuser X   Postgres superuser to use (default: postgres)
  --target-db NAME         Target database name (default: ssmspl_admin)
  --target-user NAME       Target DB user (default: ssmspl_admin_user)
  --db-password VALUE      Override DB password (default: read from snapshot's
                           ${BACKUP_ENV_FILE} after extract)
  --force-db-replace       Allow overwriting a target DB that already has data.
                           DANGEROUS — prints a big warning. Default off.
  --skip-tls               Don't restore/issue TLS certs.
  --skip-nginx-reload      Don't reload nginx at end (e.g., further scripting).
  --certbot-email ADDR     Email to use if a fresh cert needs to be issued.
  -h, --help               Show this help.

Exit codes:
  0  success
  1  validation failure
  2  prerequisite failure
  3  restore failure (extract, DB load, or compose up)
  4  partial success — admin up but post-checks failed
EOF
}

# -----------------------------------------------------------------------------
# Arg parsing
# -----------------------------------------------------------------------------
parse_args() {
    local positional=()
    while [ $# -gt 0 ]; do
        case "$1" in
            --dry-run)              DRY_RUN=true; shift ;;
            --skip-system-packages) SKIP_SYSTEM_PACKAGES=true; shift ;;
            --postgres-superuser)   PG_SUPERUSER="$2"; shift 2 ;;
            --target-db)            TARGET_DB="$2"; shift 2 ;;
            --target-user)          TARGET_USER="$2"; shift 2 ;;
            --db-password)          DB_PASSWORD_OVERRIDE="$2"; shift 2 ;;
            --force-db-replace)     FORCE_DB_REPLACE=true; shift ;;
            --skip-tls)             SKIP_TLS=true; shift ;;
            --skip-nginx-reload)    SKIP_NGINX_RELOAD=true; shift ;;
            --certbot-email)        CERTBOT_EMAIL="$2"; shift 2 ;;
            -h|--help)              usage; exit 0 ;;
            --) shift; positional+=("$@"); break ;;
            -*) die $EX_VALIDATION "Unknown option: $1 (try --help)" ;;
            *)  positional+=("$1"); shift ;;
        esac
    done

    if [ ${#positional[@]} -ne 2 ]; then
        usage
        die $EX_VALIDATION "Expected exactly 2 positional args (snapshot + db dump); got ${#positional[@]}"
    fi
    SNAPSHOT_FILE="${positional[0]}"
    DB_DUMP_FILE="${positional[1]}"
}

# =============================================================================
# Phase A — VALIDATION (no side effects)
# =============================================================================
phase_a_validate() {
    info "=== Phase A: validation ==="

    # 1. Files present + gzip integrity
    [ -f "$SNAPSHOT_FILE" ] || die $EX_VALIDATION "Snapshot file not found: $SNAPSHOT_FILE"
    [ -f "$DB_DUMP_FILE" ]  || die $EX_VALIDATION "DB dump file not found: $DB_DUMP_FILE"

    info "Checking snapshot integrity: $SNAPSHOT_FILE"
    gzip -t "$SNAPSHOT_FILE" || die $EX_VALIDATION "Snapshot failed gzip integrity check"
    local snap_size; snap_size=$(du -h "$SNAPSHOT_FILE" | cut -f1)
    info "  Snapshot OK (${snap_size})"

    info "Checking DB dump integrity: $DB_DUMP_FILE"
    gzip -t "$DB_DUMP_FILE" || die $EX_VALIDATION "DB dump failed gzip integrity check"
    local dump_size; dump_size=$(du -h "$DB_DUMP_FILE" | cut -f1)
    info "  DB dump OK (${dump_size})"

    # 2. Print the plan up-front (regardless of dry-run)
    cat <<EOF

${LOG_PREFIX} ----------------- PLAN -----------------
  Snapshot         : ${SNAPSHOT_FILE} (${snap_size})
  DB dump          : ${DB_DUMP_FILE} (${dump_size})
  Target DB        : ${TARGET_DB}
  Target user      : ${TARGET_USER}
  Postgres super   : ${PG_SUPERUSER}
  Skip syspkgs     : ${SKIP_SYSTEM_PACKAGES}
  Skip TLS         : ${SKIP_TLS}
  Skip nginx reload: ${SKIP_NGINX_RELOAD}
  Force DB replace : ${FORCE_DB_REPLACE}
  Dry run          : ${DRY_RUN}
${LOG_PREFIX} ----------------------------------------
EOF

    # 3. Root check
    if [ "$(id -u)" -ne 0 ]; then
        die $EX_VALIDATION "Must run as root (got uid=$(id -u))"
    fi

    # 4. Ubuntu 22.04+
    if [ ! -r /etc/os-release ]; then
        die $EX_VALIDATION "/etc/os-release missing — cannot identify OS"
    fi
    # shellcheck disable=SC1091
    . /etc/os-release
    if [ "${ID:-}" != "ubuntu" ]; then
        die $EX_VALIDATION "This script targets Ubuntu; detected ID=${ID:-unknown}"
    fi
    # VERSION_ID is like 22.04 / 24.04 — compare numerically
    local major; major=$(printf '%s' "${VERSION_ID:-0}" | cut -d. -f1)
    if [ "${major:-0}" -lt 22 ]; then
        die $EX_VALIDATION "Ubuntu 22.04+ required (detected ${VERSION_ID:-unknown})"
    fi
    info "OS check OK: Ubuntu ${VERSION_ID}"

    # 5. Snapshot contains expected key files
    local required=(
        "var/www/ssmspl-admin/docker-compose.admin.yml"
        "SNAPSHOT_README.md"
        "etc/nginx/sites-available/admin.carferry.online"
    )
    local missing=()
    local listing
    listing=$(tar -tzf "$SNAPSHOT_FILE")
    for f in "${required[@]}"; do
        if ! grep -Fxq "$f" <<<"$listing" && ! grep -Fq "$f" <<<"$listing"; then
            missing+=("$f")
        fi
    done
    if [ ${#missing[@]} -gt 0 ]; then
        error "Snapshot is missing required files:"
        for f in "${missing[@]}"; do error "  - $f"; done
        die $EX_VALIDATION "Snapshot does not look like a valid SSMSPL admin snapshot"
    fi
    info "Snapshot contains all required key files"

    if $DRY_RUN; then
        info "Dry run requested — Phase A passed; exiting without side effects."
        exit $EX_OK
    fi
}

# =============================================================================
# Phase B — system prerequisites
# =============================================================================
ensure_pkg() {
    # ensure_pkg <pkg-name> [more pkgs...]
    local to_install=()
    for p in "$@"; do
        if dpkg -s "$p" >/dev/null 2>&1; then
            info "  pkg present: $p"
        else
            to_install+=("$p")
        fi
    done
    if [ ${#to_install[@]} -gt 0 ]; then
        info "Installing: ${to_install[*]}"
        run apt-get update -y
        run apt-get install -y --no-install-recommends "${to_install[@]}"
    fi
}

install_docker() {
    # WHY apt over snap: snap-installed Docker has an AppArmor signal-routing
    # bug that prevents dockerd from delivering SIGTERM to containers (we hit
    # this exact issue on Server 2; see reference_server2_apparmor.md). A
    # fresh host should use apt to avoid that class of problem entirely.
    if command -v docker >/dev/null 2>&1; then
        if snap list 2>/dev/null | grep -q '^docker '; then
            warn "snap docker detected — leaving it alone but note:"
            warn "  Snap docker has an AppArmor bug blocking dockerd->container signals."
            warn "  The snapshot's /etc/systemd/system/docker.service.d/admin-iptables.conf"
            warn "  drop-in is your workaround; ensure it's loaded (systemctl daemon-reload)."
        else
            info "docker already installed: $(docker --version 2>/dev/null || true)"
        fi
        return 0
    fi
    info "Installing Docker via apt (docker.io)"
    # docker.io ships docker-compose-v2 as `docker compose` plugin on 22.04+
    ensure_pkg docker.io docker-compose-v2
    run systemctl enable --now docker
}

install_postgres() {
    if command -v psql >/dev/null 2>&1 && systemctl list-unit-files 2>/dev/null | grep -q '^postgresql@16-main'; then
        info "postgres-16 already installed"
        return 0
    fi
    # 24.04 ships pg16 in main repos; 22.04 needs PGDG.
    local major; major=$(. /etc/os-release; printf '%s' "${VERSION_ID%.*}")
    if [ "$major" = "22" ]; then
        info "Adding PGDG repo for Postgres 16 on Ubuntu 22.04"
        ensure_pkg curl ca-certificates gnupg lsb-release
        if [ ! -f /etc/apt/sources.list.d/pgdg.list ]; then
            run bash -c 'curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc | gpg --dearmor -o /usr/share/keyrings/pgdg.gpg'
            run bash -c 'echo "deb [signed-by=/usr/share/keyrings/pgdg.gpg] http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
            run apt-get update -y
        fi
    fi
    ensure_pkg postgresql-16 postgresql-client-16
    run systemctl enable --now postgresql
}

phase_b_prereqs() {
    if $SKIP_SYSTEM_PACKAGES; then
        info "=== Phase B: skipped (--skip-system-packages) ==="
        return 0
    fi
    info "=== Phase B: system prerequisites ==="

    run apt-get update -y || die $EX_PREREQ "apt-get update failed"

    install_docker     || die $EX_PREREQ "Docker install failed"
    install_postgres   || die $EX_PREREQ "Postgres install failed"

    info "Installing remaining packages (nginx, certbot, utilities)"
    ensure_pkg nginx certbot python3-certbot-nginx gzip tar curl jq cron
    # rclone is optional — used by snapshot sync. Install best-effort.
    if ! command -v rclone >/dev/null 2>&1; then
        info "Best-effort installing rclone (optional)"
        run apt-get install -y --no-install-recommends rclone || warn "rclone install skipped (non-fatal)"
    fi
}

# =============================================================================
# Phase C — extract snapshot
# =============================================================================
phase_c_extract() {
    info "=== Phase C: extract snapshot ==="

    # 12. Move aside an existing admin dir rather than clobber it. The whole
    #     point of this guard: if a human accidentally runs the restore on a
    #     live host, their data on disk survives intact, just renamed.
    if [ -d "$ADMIN_DIR" ] && [ -n "$(ls -A "$ADMIN_DIR" 2>/dev/null || true)" ]; then
        local moved="${ADMIN_DIR}.replaced-by-restore.${EPOCH}"
        warn "${ADMIN_DIR} already exists and is non-empty."
        warn "Moving it aside to: ${moved}"
        warn "(If this is a live host you ran this on by mistake, stop now and"
        warn " restore that directory back. Containers will keep their bind mounts"
        warn " by inode until restarted.)"
        run mv "$ADMIN_DIR" "$moved"
    fi

    # 11. Extract. -p preserves perms; --keep-directory-symlink preserves the
    #     letsencrypt live/ symlink dir as a symlink (otherwise tar replaces
    #     symlinked dirs with real ones and the cert wiring breaks).
    info "Extracting snapshot into /"
    run tar -xzpf "$SNAPSHOT_FILE" -C / --keep-directory-symlink \
        || die $EX_RESTORE "tar extraction failed"

    # 13. Source the sensitive env files so subsequent steps know creds.
    #     Both files are root:root 600 by virtue of the snapshot's perms.
    if [ -r "$BACKUP_ENV_FILE" ]; then
        # shellcheck disable=SC1090
        . "$BACKUP_ENV_FILE"
        info "Loaded ${BACKUP_ENV_FILE} (DB creds present in env, not echoed)"
    else
        warn "${BACKUP_ENV_FILE} not present in snapshot — DB password must be passed via --db-password"
    fi
    if [ -r "$MONITOR_CONF_FILE" ]; then
        # shellcheck disable=SC1090
        . "$MONITOR_CONF_FILE" 2>/dev/null || true
        info "Loaded ${MONITOR_CONF_FILE} (SMTP creds present in env, not echoed)"
    fi

    # Resolve effective DB password: CLI override wins, then env file.
    if [ -n "$DB_PASSWORD_OVERRIDE" ]; then
        DB_PASSWORD="$DB_PASSWORD_OVERRIDE"
    fi
    if [ -z "${DB_PASSWORD:-}" ]; then
        die $EX_RESTORE "No DB password resolved (neither --db-password nor ${BACKUP_ENV_FILE} provided one)"
    fi
}

# =============================================================================
# Phase D — restore Postgres
# =============================================================================
psql_super() {
    # Run psql as superuser via peer auth on the local socket.
    run sudo -u "$PG_SUPERUSER" psql -v ON_ERROR_STOP=1 -tA "$@"
}

phase_d_db_restore() {
    info "=== Phase D: Postgres restore ==="

    # 14. Sanity-check superuser connection
    if ! sudo -u "$PG_SUPERUSER" psql -tAc 'SELECT 1' >/dev/null 2>&1; then
        die $EX_RESTORE "Cannot connect to Postgres as ${PG_SUPERUSER} via peer auth"
    fi

    # 15. CREATE USER (idempotent). DO-block swallows duplicate-object.
    info "Ensuring role exists: ${TARGET_USER}"
    # WHY a DO-block: psql doesn't support `CREATE USER IF NOT EXISTS`.
    # We must guard via pg_roles lookup + dynamic SQL.
    local create_user_sql
    create_user_sql=$(cat <<SQL
DO \$\$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${TARGET_USER}') THEN
        EXECUTE format('CREATE USER %I WITH PASSWORD %L', '${TARGET_USER}', '${DB_PASSWORD}');
    ELSE
        EXECUTE format('ALTER USER %I WITH PASSWORD %L', '${TARGET_USER}', '${DB_PASSWORD}');
    END IF;
END
\$\$;
SQL
)
    if $DRY_RUN; then
        info "DRY-RUN: would run CREATE/ALTER USER ${TARGET_USER} (password redacted)"
    else
        printf '%s' "$create_user_sql" | sudo -u "$PG_SUPERUSER" psql -v ON_ERROR_STOP=1
    fi

    # 16/17. DB existence + clobber guard.
    local db_exists
    if $DRY_RUN; then
        db_exists=""
    else
        db_exists=$(sudo -u "$PG_SUPERUSER" psql -tAc "SELECT 1 FROM pg_database WHERE datname='${TARGET_DB}'" || true)
    fi

    if [ "$db_exists" = "1" ]; then
        local table_count
        table_count=$(sudo -u "$PG_SUPERUSER" psql -d "$TARGET_DB" -tAc \
            "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" 2>/dev/null || echo 0)
        if [ "$table_count" -gt 0 ] && ! $FORCE_DB_REPLACE; then
            error "Target DB '${TARGET_DB}' already exists with ${table_count} table(s)."
            error "Refusing to overwrite. Pass --force-db-replace to proceed (DESTRUCTIVE)."
            exit $EX_RESTORE
        fi
        if [ "$table_count" -gt 0 ] && $FORCE_DB_REPLACE; then
            warn ">>> --force-db-replace ENABLED — DROPPING database '${TARGET_DB}' <<<"
            warn "Sleeping 5s so you can Ctrl-C..."
            $DRY_RUN || sleep 5
            run sudo -u "$PG_SUPERUSER" psql -c "DROP DATABASE IF EXISTS \"${TARGET_DB}\";"
            db_exists=""
        fi
    fi

    if [ "$db_exists" != "1" ]; then
        info "Creating database ${TARGET_DB} owned by ${TARGET_USER}"
        run sudo -u "$PG_SUPERUSER" psql -c \
            "CREATE DATABASE \"${TARGET_DB}\" OWNER \"${TARGET_USER}\";"
    fi

    # 18. Stream dump in single transaction. ON_ERROR_STOP=1 ensures any
    #     SQL error aborts the load (no partial schema/data).
    #     We use --single-transaction so the entire restore is atomic.
    info "Loading dump into ${TARGET_DB} (single transaction)"
    if $DRY_RUN; then
        info "DRY-RUN: gunzip -c ${DB_DUMP_FILE} | psql -d ${TARGET_DB} --single-transaction"
    else
        gunzip -c "$DB_DUMP_FILE" | sudo -u "$PG_SUPERUSER" psql \
            -v ON_ERROR_STOP=1 --single-transaction -d "$TARGET_DB" \
            || die $EX_RESTORE "psql dump load failed"
    fi

    # 19. Refresh stats so the query planner has good cardinalities.
    info "Running ANALYZE on ${TARGET_DB}"
    run sudo -u "$PG_SUPERUSER" psql -d "$TARGET_DB" -c "ANALYZE;"
}

# =============================================================================
# Phase E — bring up admin compose stack
# =============================================================================
fixup_compose_docker_gid() {
    # 21. The compose file pins group_add: 987 (the snap-docker host docker GID
    #     on Server 2). On a fresh apt-installed host, the docker group GID is
    #     almost always different (typically 999 or whatever adduser assigned).
    #     If we don't fix this, the in-container user can't talk to the
    #     mounted /var/run/docker.sock.
    if [ ! -f "$COMPOSE_FILE" ]; then
        warn "Compose file not found at ${COMPOSE_FILE} — skipping GID fixup"
        return 0
    fi
    local host_gid
    host_gid=$(getent group docker | cut -d: -f3 || true)
    if [ -z "$host_gid" ]; then
        warn "No 'docker' group on host — skipping GID fixup"
        return 0
    fi
    if grep -Eq 'group_add:\s*$' "$COMPOSE_FILE" || grep -Eq '^\s*-\s*[0-9]+\s*$' "$COMPOSE_FILE"; then
        # Find the literal '- 987' line under group_add and patch if needed.
        if grep -Eq '^\s*-\s*987\s*$' "$COMPOSE_FILE" && [ "$host_gid" != "987" ]; then
            local bak="${COMPOSE_FILE}.bak.${EPOCH}"
            info "Host docker GID is ${host_gid}; rewriting compose group_add 987 -> ${host_gid} (backup: ${bak})"
            run cp -a "$COMPOSE_FILE" "$bak"
            run sed -i -E "s/^(\s*-\s*)987(\s*)$/\1${host_gid}\2/" "$COMPOSE_FILE"
        else
            info "Compose group_add matches host docker GID (${host_gid}) — no patch needed"
        fi
    fi
}

phase_e_compose_up() {
    info "=== Phase E: docker compose up --build ==="

    # 20. systemd needs to see the new unit files (admin-watchdog,
    #     docker.service.d drop-in) the snapshot put in place.
    run systemctl daemon-reload

    fixup_compose_docker_gid

    if [ ! -f "$COMPOSE_FILE" ]; then
        die $EX_RESTORE "Compose file missing: ${COMPOSE_FILE}"
    fi

    info "Building images + starting stack (this can take several minutes)"
    if $DRY_RUN; then
        info "DRY-RUN: (cd ${ADMIN_DIR} && docker compose -f $(basename "$COMPOSE_FILE") up -d --build)"
    else
        ( cd "$ADMIN_DIR" && docker compose -f "$(basename "$COMPOSE_FILE")" up -d --build ) \
            || die $EX_RESTORE "docker compose up failed"
    fi

    # 23/24. Health poll. Backend has a Dockerfile HEALTHCHECK; frontend may
    #        or may not depending on snapshot age. We poll best-effort.
    wait_for_healthy admin-backend  180
    wait_for_healthy admin-frontend  60
}

wait_for_healthy() {
    local container="$1"
    local timeout="$2"
    local elapsed=0
    if $DRY_RUN; then
        info "DRY-RUN: would wait up to ${timeout}s for ${container} to be healthy"
        return 0
    fi
    info "Waiting up to ${timeout}s for ${container} health..."
    while [ "$elapsed" -lt "$timeout" ]; do
        local status
        status=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' \
                    "$container" 2>/dev/null || echo "missing")
        case "$status" in
            healthy)
                info "  ${container}: healthy (after ${elapsed}s)"
                return 0
                ;;
            none)
                # No HEALTHCHECK defined. Fall back to "running".
                local running
                running=$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || echo false)
                if [ "$running" = "true" ]; then
                    info "  ${container}: running (no healthcheck defined, assumed OK)"
                    return 0
                fi
                ;;
            missing)
                warn "  ${container}: container not found yet"
                ;;
            *)
                : # starting/unhealthy/etc — keep polling
                ;;
        esac
        sleep 5
        elapsed=$((elapsed + 5))
    done
    warn "${container} did not reach healthy within ${timeout}s (continuing — post-checks will flag)"
    return 1
}

# =============================================================================
# Phase F — nginx + TLS
# =============================================================================
phase_f_nginx_tls() {
    info "=== Phase F: nginx + TLS ==="

    # 25. sites-enabled symlink
    if [ ! -L "/etc/nginx/sites-enabled/${NGINX_SITE}" ]; then
        info "Symlinking sites-enabled/${NGINX_SITE} -> sites-available/${NGINX_SITE}"
        run ln -sf "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
    fi

    # 26. Config syntax
    info "Validating nginx config"
    if $DRY_RUN; then
        info "DRY-RUN: nginx -t"
    else
        nginx -t || die $EX_RESTORE "nginx -t failed — see output above"
    fi

    # 27. Reload (or skip)
    if $SKIP_NGINX_RELOAD; then
        info "Skipping nginx reload (--skip-nginx-reload)"
    else
        run systemctl reload nginx
    fi

    # 28. TLS — only issue fresh if cert missing or expired
    if $SKIP_TLS; then
        info "Skipping TLS (--skip-tls)"
        return 0
    fi
    local fullchain="${CERT_LIVE_DIR}/fullchain.pem"
    local need_issue=false
    if [ ! -e "$fullchain" ]; then
        warn "No fullchain.pem at ${fullchain} — will issue fresh cert"
        need_issue=true
    else
        # Cert validity check: at least 7 days remaining.
        if ! openssl x509 -checkend $((7*24*3600)) -noout -in "$fullchain" >/dev/null 2>&1; then
            warn "Existing cert expires within 7 days — will renew"
            need_issue=true
        else
            info "Existing cert is valid (>=7d remaining) — keeping it"
        fi
    fi
    if $need_issue; then
        local email="${CERTBOT_EMAIL:-${SSMSPL_NOTIFY_EMAIL:-admin@${NGINX_SITE}}}"
        info "Issuing cert via certbot --nginx for ${NGINX_SITE} (email: ${email})"
        run certbot --nginx -d "$NGINX_SITE" --non-interactive --agree-tos --email "$email" --redirect
    fi
}

# =============================================================================
# Phase G — enable services + final verification
# =============================================================================
phase_g_verify() {
    info "=== Phase G: enable services + verify ==="

    # 29. Watchdog
    if [ -f /etc/systemd/system/admin-watchdog.service ]; then
        run systemctl enable --now admin-watchdog.service
    else
        warn "admin-watchdog.service not found in snapshot — skipping"
    fi

    # 30. Cron reload — the snapshot drops /etc/cron.d/ssmspl-admin-backup
    if [ -f /etc/cron.d/ssmspl-admin-backup ]; then
        # `service cron reload` is the portable way; cron re-reads /etc/cron.d
        # on file change anyway, but reloading makes it deterministic.
        run service cron reload || run systemctl reload cron || warn "cron reload non-fatal failure"
    fi

    # 31. Final probes
    local ok=true
    local front_code back_code
    if $DRY_RUN; then
        info "DRY-RUN: would curl localhost:3010/login and admin-backend /health"
    else
        front_code=$(curl -sS -m 5 -o /dev/null -w '%{http_code}' http://localhost:3010/login || echo "ERR")
        info "Frontend /login probe: HTTP ${front_code}"
        if [ "$front_code" != "200" ]; then
            ok=false
            error "Frontend probe did not return 200"
        fi

        back_code=$(docker exec admin-backend curl -sS -m 5 -o /dev/null -w '%{http_code}' \
                    http://localhost:8000/health 2>/dev/null || echo "ERR")
        info "Backend /health probe: HTTP ${back_code}"
        if [ "$back_code" != "200" ]; then
            ok=false
            error "Backend /health probe did not return 200"
        fi
    fi

    cat <<EOF

${LOG_PREFIX} ===========================================
${LOG_PREFIX} DONE
${LOG_PREFIX}   Site         : https://${NGINX_SITE}/
${LOG_PREFIX}   Frontend     : http://localhost:3010/login
${LOG_PREFIX}   Backend logs : docker logs admin-backend
${LOG_PREFIX}   Frontend logs: docker logs admin-frontend
${LOG_PREFIX}   Watchdog     : systemctl status admin-watchdog.service
${LOG_PREFIX}   Compose file : ${COMPOSE_FILE}
${LOG_PREFIX}   Backups dir  : /home/ssmspl-admin-backups/
${LOG_PREFIX} ===========================================
EOF

    if ! $ok; then
        error "Post-checks failed — stack came up but probes did not return 200."
        exit $EX_POSTCHECK
    fi
}

# =============================================================================
# Main
# =============================================================================
main() {
    parse_args "$@"

    info "${SCRIPT_NAME} v${SCRIPT_VERSION} starting"
    info "Args resolved: snapshot=${SNAPSHOT_FILE} db_dump=${DB_DUMP_FILE}"

    phase_a_validate     # may exit early if --dry-run
    phase_b_prereqs
    phase_c_extract
    phase_d_db_restore
    phase_e_compose_up
    phase_f_nginx_tls
    phase_g_verify

    info "All phases completed successfully."
    exit $EX_OK
}

main "$@"

# TODO: integrate rclone-based snapshot fetch ('--from-rclone <remote>:path/')
#       so the script can self-source the snapshot from cold storage rather
#       than requiring a manual scp first.
# TODO: support --postgres-port / --postgres-host for setups where the
#       superuser connection isn't via the default Unix socket (peer auth).
# TODO: emit a structured JSON status file at /var/log/restore-admin.json
#       summarizing each phase's pass/fail for downstream automation.
