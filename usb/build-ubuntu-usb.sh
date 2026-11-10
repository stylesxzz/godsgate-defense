#!/usr/bin/env bash
set -euo pipefail

ENROLL_URL="${1:-}"
OUT_DIR="${2:-./godsgate-usb-kit}"
if [[ -z "$ENROLL_URL" ]]; then
  echo "Usage: ./build-ubuntu-usb.sh <one-time-enrollment-url> [output-folder]"
  exit 2
fi
if [[ "$ENROLL_URL" != https://*/api/agent/bootstrap/* && "$ENROLL_URL" != http://localhost:*/api/agent/bootstrap/* ]]; then
  echo "Enrollment URL must point to /api/agent/bootstrap/<one-time-code> on your trusted God's Gate server." >&2
  exit 2
fi
if ! command -v curl >/dev/null 2>&1 || ! command -v tar >/dev/null 2>&1; then
  echo "curl and tar are required." >&2
  exit 1
fi
API_ROOT="${ENROLL_URL%%/api/agent/bootstrap/*}"
if [[ -z "$API_ROOT" ]]; then
  echo "Could not determine the server origin from the enrollment URL." >&2
  exit 2
fi
mkdir -p "$OUT_DIR"
OUT_DIR="$(cd "$OUT_DIR" && pwd)"
KIT="$OUT_DIR/GodsGate-USB-Kit"
mkdir -p "$KIT"

curl -fsSL "$API_ROOT/downloads/agent.mjs" -o "$KIT/agent.mjs"
curl -fsSL "$API_ROOT/downloads/install.sh" -o "$KIT/install.sh"
curl -fsSL "$API_ROOT/downloads/install.ps1" -o "$KIT/install.ps1"
chmod 0755 "$KIT/install.sh"
printf '%s\n' "$ENROLL_URL" > "$KIT/enrollment.url"
cat > "$KIT/START-HERE.txt" <<'EOF'
GOD'S GATE DEFENSE — USB DEPLOYMENT KIT

1. Keep enrollment.url private. It is single-use and expires after one hour.
2. Linux: install Node.js 20+ on the target system, then run:
     sudo bash install.sh "$(cat enrollment.url)"
3. Windows: open PowerShell as Administrator and run:
     .\install.ps1 -EnrollmentUrl (Get-Content .\enrollment.url -Raw).Trim()
4. The installer downloads the current agent from your God's Gate server,
   exchanges the one-time enrollment URL for its private token and registers
   a background service/task.

BOOTABLE USB
- This kit is not an ISO and must not be flashed as a disk image.
- To boot installation media, prepare the USB with Ventoy (or another trusted
  boot-media tool), place an official Ubuntu Server ISO on it, and copy this
  kit folder onto the USB data partition.
- Boot the target machine from the Ubuntu installer, complete the OS install
  yourself, then run install.sh from the kit after the system has internet.
- The script never partitions or formats a disk.

SECURITY
- The enrollment link is single-use and expires in one hour.
- Do not post the kit or enrollment URL publicly.
- Revoke an agent by deleting it from the admin console.
EOF
tar -czf "$OUT_DIR/GodsGate-USB-Kit.tar.gz" -C "$OUT_DIR" GodsGate-USB-Kit
echo "USB kit created at: $OUT_DIR/GodsGate-USB-Kit.tar.gz"
echo "Copy the folder/archive to your Ventoy USB. This script does not flash or format a drive."