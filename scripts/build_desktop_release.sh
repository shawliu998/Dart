#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backend_python="$root_dir/backend/.venv/bin/python"
desktop_build="$root_dir/desktop/build"

if [[ ! -x "$backend_python" ]]; then
  echo "Missing backend virtual environment. Run make setup first." >&2
  exit 1
fi
if [[ ! -x "$root_dir/backend/.venv/bin/pyinstaller" ]]; then
  echo "Missing PyInstaller. Install backend/requirements-dev.txt first." >&2
  exit 1
fi
if [[ ! -x "$root_dir/desktop/node_modules/.bin/electron-builder" ]]; then
  echo "Missing electron-builder. Run npm install in desktop/ first." >&2
  exit 1
fi

case "$desktop_build" in
  "$root_dir/desktop/build") ;;
  *) echo "Refusing to clean an unexpected build directory." >&2; exit 1 ;;
esac

rm -rf "$desktop_build"
mkdir -p "$desktop_build/frontend" "$desktop_build/pyinstaller"

(cd "$root_dir/frontend" && npm run build)
cp -R "$root_dir/frontend/.next/standalone/." "$desktop_build/frontend/"
mv "$desktop_build/frontend/node_modules" "$desktop_build/frontend/runtime_modules"
mkdir -p "$desktop_build/frontend/.next"
cp -R "$root_dir/frontend/.next/static" "$desktop_build/frontend/.next/static"
cp -R "$root_dir/frontend/public" "$desktop_build/frontend/public"

(
  cd "$root_dir/backend"
  .venv/bin/pyinstaller \
    --clean \
    --noconfirm \
    --distpath "$desktop_build/backend" \
    --workpath "$desktop_build/pyinstaller" \
    "$root_dir/desktop/bidevidence_backend.spec"
)

(cd "$root_dir/desktop" && npm run build)

target="${1:-mac}"
case "$target" in
  dir) (cd "$root_dir/desktop" && npm run dist:dir) ;;
  mac) (cd "$root_dir/desktop" && npm run dist:mac) ;;
  *) echo "Usage: $0 [dir|mac]" >&2; exit 1 ;;
esac
