#!/usr/bin/env bash
# SSMSPL host-action daemon.
#
# Runs as root via systemd. Polls /var/lib/ssmspl-host-actions/queue/ for
# JSON request files written by the SuperAdmin backend, executes ONLY
# whitelisted actions, and writes results back to .../results/.
#
# SECURITY MODEL
# --------------
# Queue dir is mode 0770, owned by root:ssmspl-host-actions. The docker
# container's runtime UID is added to that group at install time so the
# backend can drop request files in. The dir is NOT world-writable.
#
# Every executed command is hardcoded — no shell interpolation of params
# beyond what each action explicitly destructures. New actions require an
# edit to this file (review-gated), not a config tweak.
#
# Each action has a built-in timeout. We refuse to exec anything outside
# the explicit case statement.
#
# INSTALL (run once on host as root):
#   getent group ssmspl-host-actions || groupadd --system ssmspl-host-actions
#   install -d -o root -g ssmspl-host-actions -m 0770 /var/lib/ssmspl-host-actions
#   install -d -o root -g ssmspl-host-actions -m 0770 /var/lib/ssmspl-host-actions/queue
#   install -d -o root -g ssmspl-host-actions -m 0770 /var/lib/ssmspl-host-actions/results
#   install -d -o root -g ssmspl-host-actions -m 0770 /var/lib/ssmspl-host-actions/inflight
#   # find the UID the admin-backend container runs as (typically 1000):
#   docker inspect admin-backend --format '{{.Config.User}}'
#   # then either: usermod -aG ssmspl-host-actions <username>
#   # or in compose: user: "1000:<gid-of-ssmspl-host-actions>"
#   install -m 0755 ssmspl-host-action-daemon.sh /usr/local/bin/
#   install -m 0644 ssmspl-host-actions.service /etc/systemd/system/
#   systemctl daemon-reload
#   systemctl enable --now ssmspl-host-actions
#
set -uo pipefail

QUEUE_ROOT="/var/lib/ssmspl-host-actions"
QUEUE_DIR="$QUEUE_ROOT/queue"
RESULTS_DIR="$QUEUE_ROOT/results"
INFLIGHT_DIR="$QUEUE_ROOT/inflight"
LOG_TAG="ssmspl-host-action"

mkdir -p "$QUEUE_DIR" "$RESULTS_DIR" "$INFLIGHT_DIR" 2>/dev/null || true

log() {
  logger -t "$LOG_TAG" -- "$*"
  echo "[$(date -Is)] $*" >&2
}

write_result() {
  local rid="$1" exit_code="$2" stdout="$3" stderr="$4"
  local out="$RESULTS_DIR/${rid}.json"
  local tmp="${out}.tmp"
  # use jq if available for safe JSON encoding; otherwise minimal escape.
  if command -v jq >/dev/null 2>&1; then
    jq -n \
      --arg rid "$rid" \
      --argjson code "$exit_code" \
      --arg stdout "$stdout" \
      --arg stderr "$stderr" \
      --arg ts "$(date -Is)" \
      '{request_id:$rid, exit_code:$code, stdout:$stdout, stderr:$stderr, completed_at:$ts}' \
      > "$tmp"
  else
    # crude fallback — strip control chars + escape quotes/backslashes
    local so=$(printf '%s' "$stdout" | tr -d '\000-\010\013\014\016-\037' | sed 's/\\/\\\\/g; s/"/\\"/g')
    local se=$(printf '%s' "$stderr" | tr -d '\000-\010\013\014\016-\037' | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf '{"request_id":"%s","exit_code":%s,"stdout":"%s","stderr":"%s","completed_at":"%s"}\n' \
      "$rid" "$exit_code" "$so" "$se" "$(date -Is)" > "$tmp"
  fi
  mv -f "$tmp" "$out"
  chmod 0660 "$out" 2>/dev/null || true
}

run_action() {
  local action="$1" params_json="$2"
  local stdout="" stderr="" rc=0

  case "$action" in
    run_iptables_fix)
      local script="/usr/local/bin/admin-iptables-fix.sh"
      if [ ! -x "$script" ]; then
        printf -v stderr 'admin-iptables-fix.sh missing or not executable'
        return 127
      fi
      stdout=$(timeout 30 "$script" 2>/tmp/host-action-stderr.$$)
      rc=$?
      stderr=$(cat /tmp/host-action-stderr.$$ 2>/dev/null || true)
      rm -f /tmp/host-action-stderr.$$
      ;;

    run_health_check)
      local hc=""
      for c in /var/www/ssmspl-admin/scripts/health_check.sh \
               /var/www/ssmspl/scripts/health_check.sh \
               /opt/ssmspl/scripts/health_check.sh; do
        if [ -x "$c" ]; then hc="$c"; break; fi
      done
      if [ -z "$hc" ]; then
        printf -v stderr 'health_check.sh not found at any known path'
        return 127
      fi
      stdout=$(timeout 60 "$hc" 2>/tmp/host-action-stderr.$$)
      rc=$?
      stderr=$(cat /tmp/host-action-stderr.$$ 2>/dev/null || true)
      rm -f /tmp/host-action-stderr.$$
      ;;

    cleanup_logs)
      # Truncate any /var/log/*.log over 200 MB. Hardcoded — no params accepted.
      local truncated_count=0
      while IFS= read -r f; do
        : > "$f" 2>/dev/null && truncated_count=$((truncated_count + 1))
      done < <(find /var/log -maxdepth 2 -type f \( -name "*.log" -o -name "*.log.1" \) -size +200M 2>/dev/null)
      stdout="truncated $truncated_count file(s) over 200MB"
      rc=0
      ;;

    force_recreate_admin_backend)
      # Stops & starts the admin-backend service via the host-mounted compose.
      # Note: requires docker-compose at expected path.
      local compose_dir=""
      for d in /var/www/ssmspl-admin /opt/ssmspl-admin /home/jetty_admin/ssmspl-admin; do
        if [ -f "$d/docker-compose.admin.yml" ]; then compose_dir="$d"; break; fi
      done
      if [ -z "$compose_dir" ]; then
        printf -v stderr 'admin compose file not found at known paths'
        return 127
      fi
      stdout=$(cd "$compose_dir" && timeout 90 docker compose -f docker-compose.yml -f docker-compose.admin.yml up -d --force-recreate admin-backend 2>/tmp/host-action-stderr.$$)
      rc=$?
      stderr=$(cat /tmp/host-action-stderr.$$ 2>/dev/null || true)
      rm -f /tmp/host-action-stderr.$$
      ;;

    restart_nginx)
      stdout=$(timeout 20 systemctl restart nginx 2>/tmp/host-action-stderr.$$)
      rc=$?
      stderr=$(cat /tmp/host-action-stderr.$$ 2>/dev/null || true)
      rm -f /tmp/host-action-stderr.$$
      ;;

    certbot_renew)
      stdout=$(timeout 120 certbot renew --quiet 2>/tmp/host-action-stderr.$$)
      rc=$?
      stderr=$(cat /tmp/host-action-stderr.$$ 2>/dev/null || true)
      rm -f /tmp/host-action-stderr.$$
      ;;

    *)
      printf -v stderr 'action %q not whitelisted' "$action"
      rc=126
      ;;
  esac

  printf '%s\n' "$stdout"
  printf '%s\n' "$stderr" >&2
  return $rc
}

extract_field() {
  # extract_field <json-file> <key> — uses jq if present, else trivial grep.
  local file="$1" key="$2"
  if command -v jq >/dev/null 2>&1; then
    jq -r --arg k "$key" '.[$k] // empty' "$file" 2>/dev/null
  else
    grep -oE "\"$key\"\s*:\s*\"[^\"]+\"" "$file" 2>/dev/null \
      | head -1 \
      | sed -E "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"([^\"]+)\".*/\1/"
  fi
}

process_one() {
  local req="$1"
  local base; base=$(basename "$req" .json)

  # validate filename matches a uuid (defensive)
  if ! [[ "$base" =~ ^[a-f0-9-]{8,}$ ]]; then
    log "rejecting non-uuid request file: $req"
    rm -f -- "$req"
    return
  fi

  # move to inflight (atomic-ish on same filesystem)
  local inflight="$INFLIGHT_DIR/${base}.json"
  if ! mv -- "$req" "$inflight" 2>/dev/null; then
    return
  fi

  local action; action=$(extract_field "$inflight" "action")
  local params; params=$(extract_field "$inflight" "params" || true)

  if [ -z "$action" ]; then
    log "request $base: missing/empty action"
    write_result "$base" 126 "" "missing action field"
    rm -f -- "$inflight"
    return
  fi

  log "executing $base: action=$action"
  local stdout stderr rc
  stdout=$(run_action "$action" "$params" 2>/tmp/wrapper-stderr.$$)
  rc=$?
  stderr=$(cat /tmp/wrapper-stderr.$$ 2>/dev/null || true)
  rm -f /tmp/wrapper-stderr.$$

  log "completed $base: rc=$rc"
  write_result "$base" "$rc" "${stdout:0:4000}" "${stderr:0:4000}"
  rm -f -- "$inflight"
}

# clean any stuck inflights from previous crash
find "$INFLIGHT_DIR" -maxdepth 1 -type f -name '*.json' -mmin +5 -delete 2>/dev/null || true

log "ssmspl-host-action daemon starting; queue=$QUEUE_DIR"

while true; do
  shopt -s nullglob
  for req in "$QUEUE_DIR"/*.json; do
    process_one "$req"
  done
  shopt -u nullglob
  sleep 1
done
