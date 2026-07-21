#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

PYTHON="$(command -v python3)"
[[ -x backend/.venv/bin/python ]] && PYTHON="${ROOT_DIR}/backend/.venv/bin/python"

"$PYTHON" scripts/generate_demo_assets.py
"$PYTHON" scripts/verify_demo.py
"$PYTHON" scripts/acceptance_mvp.py --artifacts-dir .data/demo-delivery --clean

stack_started=0
if [[ "${BIDEVIDENCE_DEMO_SKIP_STACK:-0}" != "1" ]]; then
  command -v docker >/dev/null || { echo "错误：完整一键演示需要 Docker Compose；仅生成fixtures可设置 BIDEVIDENCE_DEMO_SKIP_STACK=1。" >&2; exit 1; }
  docker compose up -d --build
  ready=0
  for _ in {1..60}; do
    if "$PYTHON" scripts/seed_running_api.py --probe >/dev/null 2>&1; then
      ready=1
      break
    fi
    sleep 2
  done
  [[ "$ready" == "1" ]] || { echo "错误：API在120秒内未就绪，请运行 docker compose logs api。" >&2; exit 1; }
  "$PYTHON" scripts/seed_running_api.py
  "$PYTHON" scripts/acceptance_api.py --artifacts-dir .data/service-acceptance --clean
  stack_started=1
else
  bash scripts/seed.sh
fi

cat <<'EOF'

BidEvidence 本地演示已准备：
  演示登录:  admin@demo.local / demo1234（仅development）
  租户头:    X-Tenant-ID: 00000000-0000-0000-0000-000000000001
  用户头:    X-User-ID: 00000000-0000-0000-0000-000000000002
  角色头:    X-Role: admin
  验收报告:  .data/demo-delivery/acceptance_report.json
  封装预览:  .data/demo-delivery/2026-ZHYY-001_智慧园区综合管理平台采购项目_V1.zip
EOF

if [[ "$stack_started" == "1" ]]; then
  cat <<'EOF'
  Web:       http://localhost:3000
  API:       http://localhost:8000/docs
  MinIO:     http://localhost:9001
  服务验收:  .data/service-acceptance/service_acceptance_report.json

`make demo` 已启动并 seed 完整容器栈。停止服务：make down
EOF
else
  cat <<'EOF'

已按 BIDEVIDENCE_DEMO_SKIP_STACK=1 生成并 seed 本地 SQLite 数据；未启动 Web、API 或 MinIO。
EOF
fi

echo "演示数据固定使用 MockLLMProvider，不调用任何真实模型 API。"
