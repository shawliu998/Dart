#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PYTHON="$(command -v python3)"
[[ -x backend/.venv/bin/python ]] && PYTHON="${ROOT_DIR}/backend/.venv/bin/python"

"$PYTHON" scripts/generate_demo_assets.py
"$PYTHON" scripts/verify_demo.py
"$PYTHON" scripts/acceptance_mvp.py --artifacts-dir .data/acceptance --clean
"$PYTHON" scripts/validate_delivery.py
bash scripts/lint.sh
bash scripts/test.sh

RUNTIME_DIR="${ROOT_DIR}/.data/verify-runtime"
rm -rf "$RUNTIME_DIR"
mkdir -p "$RUNTIME_DIR/uploads"
(
  cd backend
  export APP_ENV=development
  export AUTH_SECRET=verify-only-development-secret
  export DATABASE_URL="sqlite:///${RUNTIME_DIR}/verify.db"
  export UPLOAD_DIR="${RUNTIME_DIR}/uploads"
  "$PYTHON" -m alembic upgrade head
  exec "$PYTHON" -m uvicorn app.main:app --host 127.0.0.1 --port 18080
) >"${RUNTIME_DIR}/api.log" 2>&1 &
api_pid=$!
cleanup_api() {
  kill "$api_pid" >/dev/null 2>&1 || true
  wait "$api_pid" >/dev/null 2>&1 || true
}
trap cleanup_api EXIT
api_ready=0
for _ in {1..30}; do
  if "$PYTHON" scripts/seed_running_api.py --base-url http://127.0.0.1:18080 --probe >/dev/null 2>&1; then
    api_ready=1
    break
  fi
  sleep 1
done
if [[ "$api_ready" != "1" ]]; then
  cat "${RUNTIME_DIR}/api.log"
  echo "错误：验收API未就绪。" >&2
  exit 1
fi
"$PYTHON" scripts/seed_running_api.py --base-url http://127.0.0.1:18080
"$PYTHON" scripts/acceptance_api.py --base-url http://127.0.0.1:18080 --artifacts-dir .data/verify-runtime/service-acceptance --clean
"$PYTHON" scripts/acceptance_agent.py --base-url http://127.0.0.1:18080 --artifacts-dir .data/verify-runtime/agent-acceptance
cleanup_api
trap - EXIT

if command -v docker >/dev/null 2>&1; then
  docker compose config --quiet
else
  echo "警告：未安装Docker，跳过Compose配置验证。"
fi

if [[ -f frontend/package.json ]]; then
  BIDEVIDENCE_E2E_PORT="${E2E_PORT:-}"
  if [[ -z "$BIDEVIDENCE_E2E_PORT" ]]; then
    BIDEVIDENCE_E2E_PORT="$($PYTHON -c 'import socket; sock = socket.socket(); sock.bind(("127.0.0.1", 0)); print(sock.getsockname()[1]); sock.close()')"
  fi
  (cd frontend && E2E_PORT="$BIDEVIDENCE_E2E_PORT" npm run test:e2e && npm run build)
fi

echo "BidEvidence 完整交付门禁通过。"
