# 标证通 BidEvidence

> 招投标合规与交付工作台：先证据，后结论。

BidEvidence 将招标文件转成可执行的合规矩阵，并把要求、企业证据、确定性规则、跨文件冲突、公告影响、整改任务、最终文件包和审计串成一个闭环。主界面是项目工作台和矩阵，不是聊天框。

## 桌面开发闭环（P0）

桌面宿主不需要 Docker。它在 Electron 内启动 loopback FastAPI 和 Next standalone，使用
`userData/data/workspace.sqlite3` 与受控的本地文件目录；每次启动的 Bearer Token 仅在
主进程、Next 服务端代理与 FastAPI 之间传递，不进入 renderer。

```bash
make desktop-test
make desktop-build
make desktop-dev
```

`desktop-dev` 使用仓库的 `backend/.venv`、`frontend/.next/standalone` 和 `desktop/`
依赖，首次运行请先执行 `make setup` 以及 `cd desktop && npm install`。当前是开发宿主，
尚未提供签名或可公开分发的安装包。

## 已实现的 MVP

```text
项目/上传 → 页码级解析 → 24条要求 → 3条否决候选
→ 7份证据/17个Claim → 人工证据匹配 → 14项确定性检查
→ 7项一致性问题 → 3项补充公告变化 → 7个整改任务
→ 9项封装树 → ZIP/哈希清单 → 人工审批 → 追加式审计
```

- FastAPI、Pydantic v2、SQLAlchemy 2、Alembic；PostgreSQL/SQLite。
- Next.js App Router、TypeScript、Tailwind；项目、要求、否决、材料、匹配、一致性和公告工作台。
- 文件安全校验、SHA256、版本/页码来源、MockLLMProvider 和低置信度人工复核。
- EvidenceAsset/Claim/Match、确定性合规规则、公告影响、任务、封装和审计 API。
- PostgreSQL/pgvector、Redis、MinIO、API、Worker、Web 的 Compose 基础。
- 固定时间锚点、合法 PDF/DOCX/XLSX、完整 oracle 和独立 ZIP/manifest 验收。

## 安全边界

- 演示和测试固定使用 MockLLMProvider，不读取或调用真实模型密钥。
- 金额、日期、数量、有效期和包哈希由代码计算；AI 不能给出最终合规或法律资格裁定。
- AI 证据匹配不能自动接受；`<0.70` 必须进入人工复核。
- 文档是不可信数据，其中的指令、宏、链接不会成为系统指令。
- 不自动支付保证金、操作 CA、绕过验证码或对外提交。
- ZIP 生成不等于批准；必需文件 fail 时不得标记 ready/approved。

## 一键本地演示

要求：Docker Desktop / Docker Engine（Compose v2）和 Python 3。

```bash
make demo
```

该命令会确定性生成 fixtures、执行独立验收、构建并启动完整 Compose 栈、等待 API 健康并幂等 seed 完整 MVP 数据。

打开：

- 登录：<http://localhost:3000/login>
- Web：<http://localhost:3000/projects>
- API 文档：<http://localhost:8000/docs>
- API 健康：<http://localhost:8000/health>
- MinIO 控制台：<http://localhost:9001>

本地演示登录：`admin@demo.local` / `demo1234`。该固定账号只在 `APP_ENV=development` 的 seed 中存在；production 禁止 demo seed 和默认密码。

停止：

```bash
make down
```

如只需生成 fixtures/验收产物而不启动容器：

```bash
BIDEVIDENCE_DEMO_SKIP_STACK=1 make demo
```

## 演示操作顺序

固定项目 ID：`00000000-0000-0000-0000-000000000003`。

1. 登录后打开“智慧园区综合管理平台采购项目”，查看阶段、风险和截止日期。
2. 在“招标要求”点击要求，确认文档页码和原文高亮；在“否决项”区分候选、规则和人工结论。
3. 打开“企业材料库”，检查唯一过期的 ISO 9001、Claim 来源和敏感级别。
4. 在“证据匹配”查看理由、主体/有效期并执行人工接受或拒绝。
5. 运行“合规检查”，核对 expected/actual/rule/sources；金额、日期和计数不经过模型。
6. 在“一致性检查”处理主体、数字报价、大写金额、案例验收和人员年限问题。
7. 在“补充公告”查看延期、1000→1200 路和新增等保三级的前后原文及影响。
8. 在“整改任务”跟踪来源、负责人、复核人和截止时间。
9. 在“文件封装”运行校验：授权书缺失、报价文件名错误、技术文件含修订记录。可生成预览 ZIP，但 fail 未解决前不能批准。
10. 在“审计记录”核对模型、规则、人工覆盖、包构建/审批/下载事件。

独立验收产物位于 `.data/demo-delivery/`：预览 ZIP、`SHA256SUMS.txt`、`acceptance_report.json` 和 `audit_contract.json`。后者是动作契约，不是伪造运行审计。运行中服务验收位于 `.data/service-acceptance/`，包含 API 实际生成/下载的 ZIP、审计导出和报告。

## 本机开发

要求：Python 3.12+、Node.js 20+、npm；依赖服务可用 Docker 单独启动。

```bash
cp .env.example .env
make setup
make dev-infra

# 终端1：API
cd backend
source .venv/bin/activate
alembic upgrade head
uvicorn app.main:app --reload --port 8000

# 终端2：Worker
cd backend
source .venv/bin/activate
python -m worker.main

# 终端3：Web
cd frontend
npm run dev

# 导入fixture；若API正在运行会seed API，否则seed本地SQLite
make seed
```

API 推荐使用登录 token：

```bash
curl -s http://localhost:8000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@demo.local","password":"demo1234"}'
```

演示请求头身份仍供本地自动化使用：tenant `00000000-0000-0000-0000-000000000001`、user `00000000-0000-0000-0000-000000000002`、role `admin`；不得用于公网部署。

## 命令

```bash
make setup        # 安装本地依赖并生成fixtures
make dev          # 前台启动完整Compose栈
make dev-infra    # 仅启动PostgreSQL/Redis/MinIO
make seed         # 幂等seed运行中的API或本地数据库
make demo         # 一键启动、seed并准备验收产物
make verify-demo  # 文件、JSON、哈希和oracle计数
make acceptance   # 证据/合规/冲突/公告/任务/ZIP/audit/safety独立验收
make acceptance-api # 对已启动且seed的API、真实ZIP和审计导出做验收
make acceptance-agent # 对已启动且seed的API执行完整自主Agent工作流验收
make lint         # ruff、mypy、ESLint、TypeScript
make test         # 独立验收、后端和前端测试
make verify       # 完整门禁：以上 + Compose + Playwright + production build
make down         # 停止Compose栈
```

### 没有 Make

macOS/Linux/Git Bash：

```bash
bash scripts/setup.sh
bash scripts/demo.sh
backend/.venv/bin/python scripts/verify_demo.py
backend/.venv/bin/python scripts/acceptance_mvp.py --artifacts-dir .data/acceptance --clean
backend/.venv/bin/python scripts/acceptance_agent.py --artifacts-dir .data/agent-acceptance
bash scripts/verify.sh
```

Windows PowerShell 的底层等价命令：

```powershell
Copy-Item .env.example .env
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
backend/.venv/Scripts/python.exe scripts/generate_demo_assets.py
backend/.venv/Scripts/python.exe scripts/verify_demo.py
backend/.venv/Scripts/python.exe scripts/acceptance_mvp.py --artifacts-dir .data/acceptance --clean
docker compose up -d --build
Start-Sleep -Seconds 10
python scripts/seed_running_api.py
python scripts/acceptance_agent.py --artifacts-dir .data/agent-acceptance
cd backend; python -m pytest; cd ..
cd frontend; npm test; npm run lint; npm run typecheck; npm run test:e2e; npm run build; cd ..
```

## 验收数据

[expected_results.json](demo/expected_results/expected_results.json) 2.0 是唯一 oracle。它固定 24 条要求、3 个否决候选、14 个文档、7 份证据、17 个 Claim、8 个证据匹配、14 项合规检查、7 项一致性问题、3 项公告变化、7 个任务和 9 个封装项。二进制 fixtures 随仓库交付且可重复生成。

## 文档

- [产品需求](docs/PRD.md)
- [系统架构](docs/ARCHITECTURE.md)
- [UI 规范](docs/UI_SPEC.md)
- [产品体验 V2](docs/PRODUCT_UX_V2.md)
- [Agent 体验规范](docs/AGENT_EXPERIENCE_SPEC.md)
- [数据模型](docs/DATA_MODEL.md)
- [AI 设计](docs/AI_DESIGN.md)
- [测试与评测](docs/EVALS.md)
- [安全设计](docs/SECURITY.md)
- [第三方许可证](docs/THIRD_PARTY_LICENSES.md)
- [演示数据说明](demo/README.md)

## 已知限制

- 本地演示仍允许可信请求头；生产必须只使用正式身份提供方和强密钥。
- 本地测试默认使用受控目录；Compose 已将 StorageAdapter 接入 MinIO/S3-compatible，并通过短期签名 URL 下载。生产仍需配置独立凭证、TLS、生命周期和备份策略。
- Worker 有独立入口；部分本地耗时任务仍可由 API background task 执行。
- 本地可自动调用已安装的 Tesseract/Poppler 处理图片与扫描 PDF；容器或桌面发行包仍需自行提供并登记对应二进制和中文语言数据。OCR 不可用或无结果时会生成补救任务。病毒扫描和真实消息通知仍需要部署适配器。
- 签字/盖章检查是候选提示，最终法律资格、CA、付款和外部提交始终由授权人员在系统外完成。

## 开源许可证

标证通 BidEvidence 以 [GNU Affero General Public License v3.0](LICENSE)（SPDX：`AGPL-3.0-only`）发布。

如果你修改本项目并通过网络向用户提供服务，AGPL-3.0 要求你向这些用户提供对应版本的完整源代码。再分发时请保留许可证、版权声明及第三方归属信息。第三方依赖和上游代码的许可证记录见 [第三方许可证清单](docs/THIRD_PARTY_LICENSES.md)。
