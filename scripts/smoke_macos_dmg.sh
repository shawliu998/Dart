#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dmg_path="${1:-}"

if [[ -z "$dmg_path" ]]; then
  dmg_path="$(find "$root_dir/desktop/release" -maxdepth 1 -type f -name 'BidEvidence-*-arm64.dmg' -print -quit)"
fi
if [[ -z "$dmg_path" || ! -f "$dmg_path" ]]; then
  echo "BidEvidence DMG was not found. Build the desktop release first." >&2
  exit 1
fi

mount_dir="$(mktemp -d "${TMPDIR:-/tmp}/bidevidence-dmg-smoke.XXXXXX")"
install_root="$(mktemp -d "${TMPDIR:-/tmp}/bidevidence-install-smoke.XXXXXX")"
installed_app="$install_root/Applications/BidEvidence.app"
mounted="false"

cleanup() {
  if [[ "$mounted" == "true" ]]; then
    hdiutil detach "$mount_dir" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

hdiutil attach -nobrowse -readonly -mountpoint "$mount_dir" "$dmg_path" >/dev/null
mounted="true"

if [[ ! -L "$mount_dir/Applications" ]]; then
  echo "DMG is missing the Applications install shortcut." >&2
  exit 1
fi

mkdir -p "$install_root/Applications"
ditto "$mount_dir/BidEvidence.app" "$installed_app"
hdiutil detach "$mount_dir" >/dev/null
mounted="false"

bash "$root_dir/scripts/smoke_desktop_release.sh" "$installed_app"
echo "macOS DMG smoke test passed: copied install, detached image, packaged runtime, shutdown, and restart."
