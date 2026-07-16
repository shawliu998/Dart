#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

python3 scripts/generate_demo_assets.py
python3 scripts/verify_demo.py
python3 scripts/acceptance_mvp.py

PYTHON="$(command -v python3)"
[[ -x backend/.venv/bin/python ]] && PYTHON="${ROOT_DIR}/backend/.venv/bin/python"

if python3 scripts/seed_running_api.py --probe >/dev/null 2>&1; then
  echo "检测到运行中的 BidEvidence API，正在导入完整 MVP fixtures。"
  python3 scripts/seed_running_api.py
  exit 0
fi

if [[ -f backend/alembic.ini ]] && "$PYTHON" -c 'import alembic' >/dev/null 2>&1; then
  (cd backend && "$PYTHON" -m alembic upgrade head)
fi

if [[ -f backend/scripts/seed.py ]]; then
  (cd backend && PYTHONPATH=. "$PYTHON" scripts/seed.py)
elif [[ -f backend/scripts/seed_demo.py ]]; then
  "$PYTHON" backend/scripts/seed_demo.py --fixtures demo
elif [[ -f backend/app/seed.py ]]; then
  (cd backend && "$PYTHON" -m app.seed --fixtures ../demo)
else
  echo "演示文件已生成；后端未提供 seed 入口，应用可直接读取 demo/expected_results/expected_results.json。"
fi
