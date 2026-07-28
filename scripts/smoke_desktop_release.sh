#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_path="${1:-}"

if [[ -z "$app_path" ]]; then
  app_path="$(find "$root_dir/desktop/release" -maxdepth 3 -type d -name 'BidEvidence.app' -print -quit)"
fi
if [[ -z "$app_path" || ! -d "$app_path" ]]; then
  echo "BidEvidence.app was not found. Build the desktop release first." >&2
  exit 1
fi

app_executable="$app_path/Contents/MacOS/BidEvidence"
if [[ ! -x "$app_executable" ]]; then
  echo "Packaged executable is missing: $app_executable" >&2
  exit 1
fi

smoke_root="$(mktemp -d "${TMPDIR:-/tmp}/bidevidence-desktop-smoke.XXXXXX")"

find_free_port() {
  local excluded_port="${1:-0}"
  local candidate
  for _ in $(seq 1 100); do
    candidate=$((20000 + RANDOM % 30000))
    if [[ "$candidate" -ne "$excluded_port" ]] \
      && ! /usr/bin/nc -z 127.0.0.1 "$candidate" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  echo "Could not find a free loopback port." >&2
  return 1
}

backend_port="$(find_free_port)"
frontend_port="$(find_free_port "$backend_port")"
app_pid=""
launch_number=0

stop_app() {
  if [[ -n "$app_pid" ]] && kill -0 "$app_pid" 2>/dev/null; then
    kill "$app_pid" 2>/dev/null || true
    wait "$app_pid" 2>/dev/null || true
  fi
  app_pid=""
}

cleanup() {
  stop_app
}
trap cleanup EXIT

start_app() {
  launch_number=$((launch_number + 1))
  local log_file="$smoke_root/desktop-$launch_number.log"
  env \
    PATH=/usr/bin:/bin \
    BIDEVIDENCE_DESKTOP_USER_DATA_DIR="$smoke_root/user-data" \
    BIDEVIDENCE_DESKTOP_BACKEND_PORT="$backend_port" \
    BIDEVIDENCE_DESKTOP_FRONTEND_PORT="$frontend_port" \
    "$app_executable" >"$log_file" 2>&1 &
  app_pid="$!"

  local ready="false"
  for _ in $(seq 1 90); do
    if /usr/bin/curl -fsS "http://127.0.0.1:$backend_port/health" >/dev/null 2>&1 \
      && /usr/bin/curl -fsS "http://127.0.0.1:$frontend_port/health" >/dev/null 2>&1; then
      ready="true"
      break
    fi
    if ! kill -0 "$app_pid" 2>/dev/null; then
      break
    fi
    sleep 1
  done

  if [[ "$ready" != "true" ]]; then
    echo "Packaged app did not become ready on launch $launch_number." >&2
    sed -n '1,240p' "$log_file" >&2
    find "$smoke_root/user-data/logs" -maxdepth 1 -type f -print -exec sed -n '1,200p' {} \; 2>/dev/null >&2 || true
    return 1
  fi
}

assert_ports_released() {
  local released="false"
  for _ in $(seq 1 20); do
    if ! /usr/bin/nc -z 127.0.0.1 "$backend_port" >/dev/null 2>&1 \
      && ! /usr/bin/nc -z 127.0.0.1 "$frontend_port" >/dev/null 2>&1; then
      released="true"
      break
    fi
    sleep 1
  done
  if [[ "$released" != "true" ]]; then
    echo "Packaged sidecars did not release their loopback ports after exit." >&2
    return 1
  fi
}

start_app

settings_json="$(/usr/bin/curl -fsS "http://127.0.0.1:$frontend_port/api/settings/ai-model")"
case "$settings_json" in
  *'"provider":"mock"'*) ;;
  *) echo "Settings API did not return the default Mock provider." >&2; exit 1 ;;
esac

project_json="$(/usr/bin/curl -fsS \
  -H 'Content-Type: application/json' \
  -d '{"name":"Packaged smoke project","project_code":"SMOKE-001","buyer_name":"Local buyer"}' \
  "http://127.0.0.1:$frontend_port/api/projects")"
case "$project_json" in
  *'"project_code":"SMOKE-001"'*) ;;
  *) echo "Packaged project creation failed." >&2; exit 1 ;;
esac

stop_app
assert_ports_released

start_app
projects_json="$(/usr/bin/curl -fsS "http://127.0.0.1:$frontend_port/api/projects")"
case "$projects_json" in
  *'"project_code":"SMOKE-001"'*) ;;
  *) echo "Workspace data did not survive a clean packaged-app restart." >&2; exit 1 ;;
esac

stop_app
assert_ports_released

echo "Desktop release smoke test passed: packaged services, settings, project creation, clean shutdown, and same-data restart."
