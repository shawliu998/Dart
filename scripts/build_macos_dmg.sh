#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
desktop_dir="$root_dir/desktop"
app_path="$desktop_dir/release/mac-arm64/BidEvidence.app"
staging_dir="$desktop_dir/build/dmg-staging"
output_path="$desktop_dir/release/BidEvidence-0.2.0-arm64.dmg"

if [[ ! -d "$app_path" ]]; then
  echo "Packaged app was not found: $app_path" >&2
  exit 1
fi

case "$staging_dir" in
  "$desktop_dir/build/dmg-staging") ;;
  *) echo "Refusing to clean an unexpected staging directory." >&2; exit 1 ;;
esac

rm -rf "$staging_dir"
mkdir -p "$staging_dir"
ditto "$app_path" "$staging_dir/BidEvidence.app"
ln -s /Applications "$staging_dir/Applications"

hdiutil create \
  -ov \
  -fs HFS+ \
  -format UDZO \
  -srcfolder "$staging_dir" \
  -volname BidEvidence \
  "$output_path"
