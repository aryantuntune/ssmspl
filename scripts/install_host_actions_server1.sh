#!/usr/bin/env bash
# One-shot installer for the SSMSPL host-action daemon on Server 1 (prod).
#
# Server 2 already has this installed; Server 1 needs sudo from the
# jetty_admin account, which is interactive — the daemon must therefore
# be installed by hand. This script does it in one paste.
#
# USAGE (on Server 1, as jetty_admin):
#   cd /var/www/ssmspl
#   git pull origin main      # gets daemon script + service unit
#   sudo bash scripts/install_host_actions_server1.sh
#
# After this finishes, recreate the backend so it picks up the new group:
#   docker compose -f docker-compose.prod.yml up -d --force-recreate backend
#
# IDEMPOTENT: safe to re-run. Refuses to clobber an existing install.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: must run as root (use sudo)." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DAEMON_SRC="$REPO_ROOT/scripts/ssmspl-host-action-daemon.sh"
SERVICE_SRC="$REPO_ROOT/scripts/ssmspl-host-actions.service"

[ -f "$DAEMON_SRC" ]  || { echo "ERROR: $DAEMON_SRC not found"; exit 1; }
[ -f "$SERVICE_SRC" ] || { echo "ERROR: $SERVICE_SRC not found"; exit 1; }

echo "[1/6] Creating system group ssmspl-host-actions..."
if getent group ssmspl-host-actions >/dev/null; then
  echo "    group already exists; gid=$(getent group ssmspl-host-actions | cut -d: -f3)"
else
  groupadd --system ssmspl-host-actions
fi
GID=$(getent group ssmspl-host-actions | cut -d: -f3)
echo "    ssmspl-host-actions gid=$GID"

echo "[2/6] Creating /var/lib/ssmspl-host-actions/{queue,results,inflight}..."
install -d -o root -g ssmspl-host-actions -m 0770 /var/lib/ssmspl-host-actions
install -d -o root -g ssmspl-host-actions -m 0770 /var/lib/ssmspl-host-actions/queue
install -d -o root -g ssmspl-host-actions -m 0770 /var/lib/ssmspl-host-actions/results
install -d -o root -g ssmspl-host-actions -m 0770 /var/lib/ssmspl-host-actions/inflight

echo "[3/6] Installing daemon script + systemd unit..."
install -m 0755 "$DAEMON_SRC"  /usr/local/bin/ssmspl-host-action-daemon.sh
install -m 0644 "$SERVICE_SRC" /etc/systemd/system/ssmspl-host-actions.service
sed -i 's/\r$//' /usr/local/bin/ssmspl-host-action-daemon.sh
sed -i 's/\r$//' /etc/systemd/system/ssmspl-host-actions.service

echo "[4/6] systemctl daemon-reload + enable + start..."
systemctl daemon-reload
systemctl enable --now ssmspl-host-actions

sleep 2
echo "[5/6] Checking daemon status..."
if ! systemctl is-active ssmspl-host-actions >/dev/null; then
  echo "ERROR: daemon failed to start."
  journalctl -u ssmspl-host-actions --no-pager -n 20
  exit 1
fi
echo "    daemon is active"

echo "[6/6] Reminder: docker-compose.prod.yml expects group_add: \"986\""
if [ "$GID" != "986" ]; then
  cat <<EOF

  *** GID MISMATCH — ACTION REQUIRED ***
  Your ssmspl-host-actions GID is $GID, but the committed
  docker-compose.prod.yml hardcodes 986. Update line:

      group_add:
        - "986"
  to:
        - "$GID"

  Then recreate the backend container.

EOF
else
  echo "    GID matches the committed compose value (986). No edit needed."
fi

cat <<'EOF'

DONE. Now recreate the backend to pick up the new group membership:

    docker compose -f docker-compose.prod.yml up -d --force-recreate backend

After it's healthy, sanity-check from inside the container:

    docker exec ssmspl-backend-1 id
    # expect: groups=...,986 (or whatever GID printed above)

    docker exec ssmspl-backend-1 sh -c \
      'echo TEST > /var/lib/ssmspl-host-actions/queue/_writetest.json \
       && rm /var/lib/ssmspl-host-actions/queue/_writetest.json && echo OK'
    # expect: OK
EOF
