# BidEvidence Orchestrator 仓库事实清单

更新时间：2026-07-27

## 运行事实

- 仓库根目录：`/Users/a1-6/Documents/投标`
- 当前分支：`codex/autonomous-draft-agent`
- Node.js：`v22.23.1`
- npm：`10.9.8`
- 前端：Next.js App Router、TypeScript、Tailwind/全局语义样式、Vitest、Playwright
- 后端：FastAPI、Pydantic v2、SQLAlchemy 2、Alembic、pytest
- 工作树已有其他用户变更；任何批次只能修改明确允许的现有文件，不能清理或覆盖无关改动。

## 产品阶段与硬约束

- 当前阶段：竞品工作流与 UI 能力对齐。
- 必读：`AGENTS.md`、`docs/CURRENT_PRODUCT_PRIORITY.md`、`docs/EXISTING_CAPABILITY_MAP.md`、`docs/MODEL_DELEGATION_POLICY.md`。
- 禁止新增 `V2`、`new`、`replacement`、平行适配器或重复工作台。
- UI 批次必须指定单一主竞品、具体用户任务、可见差距、复用决定和浏览器证据。
- 不把聊天、Agent、审计、安全、部署或本地运行信息作为核心页面卖点。

## 已完成且不可重复规划

- 响应编制：`frontend/features/responses/response-workbench.tsx`
  - 母版：Loopio Project List View
  - 已完成项目大纲、连续响应行、原位展开、保存/批准门禁和键盘复核。
- 合规审阅：`frontend/features/requirements/requirements-workbench.tsx`
  - 参考：GovDash Compliance Matrix / Review Mode、Responsive Source View
  - 已完成三栏、矩阵、来源真实视图，保存筛选与视图，批量选择和移动模式。
- 项目与文件接收 Batch 01：`frontend/features/projects/project-wizard.tsx`
  - 参考：Loopio Source Documents / Project Import
  - 已完成逐文件真实状态、`projectId` 续传、单文件重试/移除和 Agent 启动门禁。
- 企业材料库 Batch 02：`frontend/features/evidence/evidence-library.tsx`
  - 母版：Loopio Library
  - 已完成紧凑搜索/筛选、材料清单、确定性复用提示、Claims/来源/使用项目/当前版本详情和移动列表-详情切换。
- 整改任务 Batch 03：`frontend/features/tasks/task-center.tsx`
  - 母版：Loopio Projects / My Tasks
  - 已完成工作清单、流程视图、负责人→复核人交接、来源详情、顺序状态动作和移动列表-详情切换。

## Batch 03 实现事实

- 本批限定为既有整改任务页，没有修改文件封装或最终复核。
- 路由：`/projects/[projectId]/tasks`、`/tasks`。
- 组件：`frontend/features/tasks/task-center.tsx`。
- 类型：`frontend/lib/phase-data/types.ts` 中既有 `RemediationTask`。
- 现有前端调用：`phaseApi.tasks`、`createTask`、`updateTask`、`completeTask`、`reviewTask`。
- 现有后端接口：项目任务 GET/POST、单任务 PATCH、complete 和 review。
- 当前状态仅有 `todo`、`in_progress`、`review`、`done`，必须保持顺序流转。
- 当前 UI 以工作清单为默认视图，流程看板为第二视图；390px 使用任务列表/详情切换，流程纵向排列。
- 不存在评论写入、附件上传、通知、@提及、批量分派、活动日志或负责人目录契约；本批不得伪造。
- 基线截图：`.data/page-audit/2026-07-21/baseline/15-project-tasks.jpg`。
- 完整输入见 `docs/BATCH03_ORCHESTRATOR_BRIEF.md`。

## Batch 04 候选实现事实

- 本批唯一候选页面：`/projects/[projectId]/package`，用户任务是最终交付前检查文件、处理阻塞/警告、预览并生成 ZIP。
- 路由：`frontend/app/projects/[projectId]/package/page.tsx`。
- 主组件：`frontend/features/package/package-center.tsx`。
- 当前组件已有用户未提交改动，必须保留检查成功后的真实数据刷新、刷新失败反馈、确定性通过率和真实封装项数量。
- 类型：`frontend/lib/phase-data/types.ts` 中既有 `PackageNode`、`PackageCheck`。
- 前端调用：`phaseApi.package`、`validatePackage`、`previewPackage`、`bindPackageItem`、`downloadPackage`、`buildPackage`，以及 `projectApi.uploadDocument`。
- 后端接口：项目封装 GET、validate、preview、build，封装项 PATCH、提交包 download、项目文件 upload；本批不需要新接口。
- 现有业务门禁：`failed` 阻止最终包；无阻塞后仍需人工确认警告并填写审批原因；警告确认保留原始记录。
- 基线截图：`.data/page-audit/2026-07-21/baseline/16-package.jpg` 与 `.data/page-audit/2026-07-21/baseline/mobile/package.jpg`。
- 当前测试锚点：`frontend/tests/phase-workbenches.test.tsx` 和 `frontend/tests/e2e/phase2-5.spec.ts`。
- 禁止触及 `frontend/features/review/final-review.tsx`，不新增路由、API、DTO、store、第二套工作台或外部提交/签章/版本历史等虚构能力。
- 完整输入见 `docs/BATCH04_ORCHESTRATOR_BRIEF.md`。

## Batch 01 真实接口与状态

- `projectApi.create(input)`
  位置：`frontend/lib/api/projects.ts`
  作用：创建一次项目并返回项目对象。
- `projectApi.uploadDocument(projectId, file, documentType)`
  位置：`frontend/lib/api/projects.ts`
  作用：向既有项目上传一份文件。
- `agentApi.createRun(projectId)`
  位置：`frontend/lib/api/agent.ts`
  作用：全部文件成功后启动现有分析流程。
- 组件内部状态：`files`、`createdProjectId`、`starting`、`workflowError`。
- 不存在也不允许为本批新增：上传 V2 API、上传 DTO、全局 upload store、第二套文件工作台。

## 当前验证命令

```bash
cd /Users/a1-6/Documents/投标/frontend
npm run lint
npm run typecheck
npm test -- --run tests/phase-workbenches.test.tsx
npm test -- --testTimeout=15000
E2E_PORT=3119 npm run test:e2e
NEXT_PUBLIC_DEMO_MODE=true npm run build
```

`E2E_PORT=3119` 是本机本轮使用的隔离端口。

## 当前验收状态

- lint：通过
- TypeScript：通过
- Phase 3–5 聚焦测试：8/8
- 前端全量单测：19 个文件、106/106
- E2E：7 项通过、1 项按环境跳过
- production build：通过
- 生产截图：
  - `.data/ui-package-procore/bidevidence-package-procore-1440-prod.png`
  - `.data/ui-package-procore/bidevidence-package-procore-1280-prod.png`
  - `.data/ui-package-procore/bidevidence-package-procore-390-checks-prod.png`
  - `.data/ui-package-procore/bidevidence-package-procore-390-files-prod.png`
  - `.data/ui-package-procore/bidevidence-package-procore-390-blocked-dialog-prod.png`

## Batch 04 Executor R1 状态

- 主竞品：Procore Submittals Package Review。
- 当前桌面结构：左侧辅助文件目录 + 右侧主检查工作区；检查详情在当前行原位展开。
- 当前移动结构：检查/文件单页切换，390px 无横向溢出。
- 新增可见能力只使用既有数据：全部/待处理/已通过筛选。
- 原有真实动作和门禁全部保留；无新路由、API、DTO、store、状态或第二工作台。
- Codex：`TECH_ACCEPT`。
- Pro：`PRODUCT_ACCEPT`，UI/视觉、交互、移动、Agent 产品边界、架构复用与测试证据均无 P0/P1。
- 完整证据见 `docs/BATCH04_EXECUTION_EVIDENCE.md`。

## Batch 05 候选实现事实

- 本批唯一候选页面：`/projects/[projectId]/review`，用户任务是查看未完成项、回到真实工作台处理或确认，并完成现有最终工作包人工复核请求。
- 路由：`frontend/app/projects/[projectId]/review/page.tsx`。
- 主组件：`frontend/features/review/final-review.tsx`；独立样式：`frontend/features/review/final-review.module.css`。
- 当前组件和样式没有用户未提交改动，可在原锚点增量修改。
- 现有 loader 并行读取要求、否决风险、证据匹配、整改任务、投标响应、封装数据和 Agent run；部分失败显式进入 `errors`，不使用演示数据替换。
- 现有真实完成动作只有 pending `final_work_package_review` 的 `agentApi.approve(id, { reason })`，并要求非空复核说明、成功刷新、失败反馈。
- 当前可见差距：Agent 标题/状态抢占首屏，六指标 Dashboard 不指示终审顺序，两列链接集合与提前出现的完成表单割裂。
- 基线：`.data/page-audit/2026-07-21/baseline/17-review.jpg` 与 `.data/page-audit/2026-07-21/final/mobile/review.jpg`。
- 当前测试锚点：`frontend/tests/final-review.test.tsx`；E2E 可在 `frontend/tests/e2e/phase2-5.spec.ts` 增量覆盖。
- 禁止复制 Batch 04 的文件树、上传、预览和 ZIP 动作；禁止新路由/API/DTO/store/审批类型/第二终审页。
- 完整输入见 `docs/BATCH05_ORCHESTRATOR_BRIEF.md`。

## Batch 05 Executor R1 状态

- 主竞品：Loopio Project Review / Task Review。
- 当前桌面结构：终审清单主区 + 工作包状态/人工结论辅助区。
- 当前移动结构：终审清单 → 当前工作包 → 提交人工结论；390px 无横向溢出且结论区不被底部导航遮挡。
- Agent 标题、主入口、notice 和六指标 Dashboard 已移除；Agent 仅作为工作包状态来源。
- 所有问题只回跳现有业务工作台；唯一完成动作仍是 pending final approval 的 `agentApi.approve(id, { reason })`。
- 聚焦测试 3/3；全量 106/106；E2E 7 passed、1 skipped；lint、typecheck、production build 通过。
- Codex：`TECH_ACCEPT`。
- Pro：`PRODUCT_ACCEPT`，UI/视觉、信息架构、交互、移动、Agent 边界、架构复用与测试证据均无 P0/P1。
- 完整证据见 `docs/BATCH05_EXECUTION_EVIDENCE.md`。

## 双钥匙结论

- Pro：`PRODUCT_ACCEPT`（2026-07-27），Loopio Project Review / Task Review 竞品任务、UI、信息架构、交互、移动和 Agent 产品边界无 P0/P1。
- Codex：`TECH_ACCEPT`（2026-07-27），真实路径、接口、架构、测试和 production 浏览器状态通过。
- Batch 05 双钥匙已齐备，批次关闭。

## 全产品终验候选

- 终验范围：Batch 01–05 与既有响应编制、合规审阅连接成七步主旅程。
- 终验路由：`/projects/new` → requirements → `/evidence` → responses → tasks → package → review。
- 终验不新增产品能力，只检查页面一致性、信息架构、真实交互闭环、Agent 边界、求职作品叙事和投递包可验证性。
- Pro 输入：`docs/FINAL_ACCEPTANCE_ORCHESTRATOR_BRIEF.md`、本清单、逐批执行证据、README、CASE_STUDY、当前 production 截图和关键实现/测试锚点。
- Codex 只执行 Pro 指出的 P0/P1 最小修复；P2 记录但不阻止封装。
- 最终双钥匙仍为：Pro `PRODUCT_ACCEPT` + Codex `TECH_ACCEPT`。
