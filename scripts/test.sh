#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PYTHON="$(command -v python3)"
[[ -x backend/.venv/bin/python ]] && PYTHON="${ROOT_DIR}/backend/.venv/bin/python"

"$PYTHON" scripts/verify_demo.py
"$PYTHON" scripts/acceptance_mvp.py
"$PYTHON" scripts/validate_delivery.py

if [[ -x backend/.venv/bin/python ]]; then
  (cd backend && .venv/bin/python -m pytest)
elif [[ -f backend/pyproject.toml || -f backend/requirements.txt ]]; then
  (cd backend && python3 -m pytest)
else
  echo "警告：后端尚未创建，跳过 pytest。"
fi

if [[ -f frontend/package.json ]]; then
  (cd frontend && npm test)
else
  echo "警告：前端尚未创建，跳过前端测试。"
fi
