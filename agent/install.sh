#!/usr/bin/env bash
set -euo pipefail

ENROLL_URL="${1:-}"
if [[ -z "$ENROLL_URL" ]]; then
  echo "Usage: curl -fsSL <server>/downloads/install.sh | sudo bash -s -- <one-time-enrollment-url>"
  exit 2
fi
if [[ $EUID -ne 0 ]]; then
  echo "Run this installer as root (sudo)." >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required. Install it from https://nodejs.org/ and run this command again." >&2
  exit 1
fi
NODE_BIN="$(command -v node)"
NODE_MAJOR="$("$NODE_BIN" -p 'Number(process.versions.node.split(".")[0])')"
if [[ "$NODE_MAJOR" -lt 20 ]]; then
  echo "Node.js 20 or newer is required. Detected: $("$NODE_BIN" --version)" >&2
  exit 1
fi
API_ROOT="$("$NODE_BIN" -e 'console.log(new URL(process.argv[1]).origin)' "$ENROLL_URL")"
install -d -m 0755 /opt/godsgate
curl -fsSL "$API_ROOT/downloads/agent.mjs" -o /opt/godsgate/agent.mjs
chmod 0755 /opt/godsgate/agent.mjs
if ! id godsgate >/dev/null 2>&1; then
  useradd --system --home-dir /var/lib/godsgate --create-home --shell /usr/sbin/nologin godsgate
fi
install -d -o godsgate -g godsgate -m 0700 /var/lib/godsgate
HOME=/var/lib/godsgate su -s /bin/sh godsgate -c "$NODE_BIN /opt/godsgate/agent.mjs --enroll '$ENROLL_URL'"
cat >/etc/systemd/system/godsgate-agent.service <<EOF
[Unit]
Description=God's Gate Defense Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=godsgate
Group=godsgate
Environment=HOME=/var/lib/godsgate
ExecStart=$NODE_BIN /opt/godsgate/agent.mjs
Restart=always
RestartSec=15
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/var/lib/godsgate

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable --now godsgate-agent.service
echo "God's Gate agent installed and enabled."
systemctl --no-pager --full status godsgate-agent.service || true