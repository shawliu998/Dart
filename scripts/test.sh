#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

python3 scripts/verify_demo.py
python3 scripts/acceptance_mvp.py
python3 scripts/validate_delivery.py

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
