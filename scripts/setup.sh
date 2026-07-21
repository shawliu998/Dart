#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

command -v python3 >/dev/null || { echo "错误：需要 Python 3.12+" >&2; exit 1; }
command -v node >/dev/null || { echo "错误：需要 Node.js 20+" >&2; exit 1; }
command -v npm >/dev/null || { echo "错误：需要 npm" >&2; exit 1; }

if [[ -f backend/pyproject.toml ]]; then
  python3 -m venv backend/.venv
  backend/.venv/bin/python -m pip install --upgrade pip
  backend/.venv/bin/python -m pip install -r backend/requirements-dev.txt
elif [[ -f backend/requirements.txt ]]; then
  python3 -m venv backend/.venv
  backend/.venv/bin/python -m pip install --upgrade pip
  backend/.venv/bin/python -m pip install -r backend/requirements.txt
else
  echo "警告：未找到后端依赖清单，跳过后端安装。"
fi

PYTHON="$(command -v python3)"
[[ -x backend/.venv/bin/python ]] && PYTHON="${ROOT_DIR}/backend/.venv/bin/python"
"$PYTHON" scripts/generate_demo_assets.py
"$PYTHON" scripts/verify_demo.py
"$PYTHON" scripts/acceptance_mvp.py
"$PYTHON" scripts/validate_delivery.py

if [[ -f frontend/package-lock.json ]]; then
  (cd frontend && npm ci)
elif [[ -f frontend/package.json ]]; then
  (cd frontend && npm install)
else
  echo "警告：未找到 frontend/package.json，跳过前端安装。"
fi

echo "安装完成。使用 'make dev' 启动完整容器栈，或 'make dev-infra' 仅启动依赖服务。"
