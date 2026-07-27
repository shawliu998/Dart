# Batch 03 v1.0 执行证据

执行包：`BidEvidence-Batch03-Execution-Package-v1.0`

主竞品：Loopio Projects / My Tasks

## 单一用户任务

整改负责人查看任务来源、原因和处理步骤，开始处理并提交复核；复核人沿同一任务链完成复核。

## 复用决定

复用：

- `/projects/[projectId]/tasks` 与 `/tasks`
- `TaskCenter`
- `RemediationTask`
- `phaseApi.tasks()`
- `phaseApi.createTask()`
- `phaseApi.updateTask()`
- `phaseApi.completeTask()`
- `phaseApi.reviewTask()`
- 既有 `todo → in_progress → review → done` 状态链

本批修改：

- `frontend/features/tasks/task-center.tsx`
- `frontend/app/globals.css`
- `frontend/tests/phase-workbenches.test.tsx`
- `frontend/tests/e2e/phase2-5.spec.ts`
- 本批执行证据、竞品审计与作品集截图

没有新增路由、API、DTO、数据库迁移、全局 store、状态枚举、V2 文件或第二套任务系统。

## 可见变化

- 删除三个等权 KPI 数字块，不再以 Dashboard 摘要作为任务页主结构。
- 默认视图改为高密度工作清单；每行直接显示状态、负责人到复核人的交接、截止日期和下一步动作。
- 流程看板保留为第二视图，继续支持现有顺序拖放；非法跨状态拖放会显示明确阻止原因。
- 详情把任务状态、负责人、复核人、截止日期、来源、整改原因、处理步骤和下一动作收敛到同一检查路径。
- 附件数和评论数仅作为既有只读记录，不提供当前契约不存在的写入按钮。
- 390px 使用“任务列表 / 任务详情”切换；流程视图改为纵向分组，不再依赖 660px 横向看板。
- 移动详情固定呈现真实下一动作，负责人和复核人均可在窄屏完成开始处理、提交复核或复核完成。

## 浏览器证据

- 旧版基线：`.data/page-audit/2026-07-21/baseline/15-project-tasks.jpg`
- 1440 × 900 production：`.data/ui-tasks-loopio/bidevidence-tasks-loopio-1440-prod.png`
- 1280 × 720 清单：`.data/ui-tasks-loopio/bidevidence-tasks-loopio-1280-prod.png`
- 1280 × 720 流程：`.data/ui-tasks-loopio/bidevidence-tasks-loopio-1280-flow-prod.png`
- 390 × 844 列表：`.data/ui-tasks-loopio/bidevidence-tasks-loopio-390-list-prod.png`
- 390 × 844 待复核详情：`.data/ui-tasks-loopio/bidevidence-tasks-loopio-390-detail-prod.png`

实际浏览器已验证：

- 1440px：`scrollWidth = clientWidth = 1440`
- 1280px：`scrollWidth = clientWidth = 1280`
- 390px 列表与详情：`scrollWidth = clientWidth = 390`
- 搜索、优先级/状态筛选、任务选择、清单/流程切换和来源链接可操作。
- 390px 选择 `补充有效 ISO 27001 续证证明` 后进入详情，底部直接显示真实 `复核并完成` 动作。

## 自动化验证

- `npm test -- --run tests/phase-workbenches.test.tsx`：7/7 通过
- `npm test -- --testTimeout=15000`：19 个测试文件、105/105 通过
- `E2E_PORT=3119 npm run test:e2e`：7 项通过、1 项按环境跳过
- `npm run lint`：通过
- `npm run typecheck`：通过
- `NEXT_PUBLIC_DEMO_MODE=true npm run build`：通过

## 双钥匙验收

- Pro：`PRODUCT_ACCEPT`（2026-07-27）。已复审 Loopio Projects / My Tasks 单一任务结构、UI/视觉、清单/流程交互、390px 移动操作、Agent/协作边界、架构复用和测试证据；无 P0/P1。
- Codex：`TECH_ACCEPT`（2026-07-27）。现有路由、`RemediationTask`、五个任务 API 与顺序状态链复用成立；lint、TypeScript、105/105 单测、7 项通过 + 1 项跳过 E2E、production build 和 1440/1280/390 浏览器验证均通过。

Pro 仅保留两个非阻断 P2 观察：详情纵向信息后续可继续压缩，流程视图后续可继续提高状态阅读效率。它们不影响本批“负责人处理并提交复核、复核人完成复核”的任务，Batch 03 双钥匙已齐备。
