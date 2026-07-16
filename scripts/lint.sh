#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

python3 -m py_compile scripts/*.py
for script in scripts/*.sh; do
  bash -n "$script"
done
python3 scripts/validate_delivery.py

PYTHON="python3"
[[ -x backend/.venv/bin/python ]] && PYTHON="backend/.venv/bin/python"

if [[ -f backend/pyproject.toml ]]; then
  "$PYTHON" -m ruff check backend
  "$PYTHON" -m mypy backend/app backend/worker
elif [[ -d backend/app ]]; then
  echo "警告：后端没有 pyproject.toml，无法运行约定的 ruff/mypy。"
fi

if [[ -f frontend/package.json ]]; then
  (cd frontend && npm run lint && npm run typecheck)
else
  echo "警告：前端尚未创建，跳过 lint/typecheck。"
fi
