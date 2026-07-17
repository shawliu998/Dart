#!/usr/bin/env bash
set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
backend_python="$root_dir/backend/.venv/bin/python"
node_bin="$(command -v node || true)"

if [[ ! -x "$backend_python" ]]; then
  echo "Missing backend virtual environment. Run make setup first." >&2
  exit 1
fi
if [[ -z "$node_bin" ]]; then
  echo "Node.js is required for the development host." >&2
  exit 1
fi
if [[ ! -f "$root_dir/frontend/.next/standalone/server.js" ]]; then
  (cd "$root_dir/frontend" && npm run build)
fi

find_free_port() {
  "$backend_python" -c 'import socket; sock = socket.socket(); sock.bind(("127.0.0.1", 0)); print(sock.getsockname()[1]); sock.close()'
}

backend_port="${BIDEVIDENCE_DESKTOP_BACKEND_PORT:-$(find_free_port)}"
frontend_port="${BIDEVIDENCE_DESKTOP_FRONTEND_PORT:-$(find_free_port)}"

export BIDEVIDENCE_DESKTOP_BACKEND_COMMAND="$backend_python"
export BIDEVIDENCE_DESKTOP_BACKEND_ARGS='["-m","app.desktop_entry"]'
export BIDEVIDENCE_DESKTOP_BACKEND_CWD="$root_dir/backend"
export BIDEVIDENCE_DESKTOP_BACKEND_HOST=127.0.0.1
export BIDEVIDENCE_DESKTOP_BACKEND_PORT="$backend_port"
export BIDEVIDENCE_DESKTOP_BACKEND_HEALTH_PATH=/health
export BIDEVIDENCE_DESKTOP_FRONTEND_COMMAND="$node_bin"
export BIDEVIDENCE_DESKTOP_FRONTEND_ARGS='["server.js"]'
export BIDEVIDENCE_DESKTOP_FRONTEND_CWD="$root_dir/frontend/.next/standalone"
export BIDEVIDENCE_DESKTOP_FRONTEND_HOST=127.0.0.1
export BIDEVIDENCE_DESKTOP_FRONTEND_PORT="$frontend_port"
export BIDEVIDENCE_DESKTOP_FRONTEND_HEALTH_PATH=/health
export PORT="$frontend_port"

cd "$root_dir/desktop"
npm run start
