# Batch 03 Orchestrator Brief

更新时间：2026-07-27

## 本批候选与优先级

按 `docs/CURRENT_PRODUCT_PRIORITY.md`，响应编制、合规审阅、文件接收和企业材料库的主要可见差距已分别在既有锚点中完成对标。下一优先级是协作能力，因此本批只允许在现有整改任务页中选择一个紧密、可独立验收的协作任务，不提前进入文件封装或最终复核。

## 当前真实锚点

- 路由：
  - `/projects/[projectId]/tasks`
  - `/tasks`
- 组件：`frontend/features/tasks/task-center.tsx`
- 现有样式：`frontend/app/globals.css` 中 `.task-*` / `.kanban-*`
- 类型：`frontend/lib/phase-data/types.ts` 中 `RemediationTask`
- 前端 API：`frontend/lib/api/phase2.ts`
  - `phaseApi.tasks(projectId)`
  - `phaseApi.createTask(projectId, task, sourceId)`
  - `phaseApi.updateTask(id, patch, reason)`
  - `phaseApi.completeTask(id)`
  - `phaseApi.reviewTask(id)`
- 后端既有接口：
  - `GET /api/projects/{project_id}/tasks`
  - `POST /api/projects/{project_id}/tasks`
  - `PATCH /api/tasks/{task_id}`
  - `POST /api/tasks/{task_id}/complete`
  - `POST /api/tasks/{task_id}/review`
- 直接测试锚点：`frontend/tests/phase-workbenches.test.tsx`
- 基线截图：`.data/page-audit/2026-07-21/baseline/15-project-tasks.jpg`

## 已有真实能力

- 任务搜索和优先级筛选。
- 看板和表格视图切换。
- 任务选择及来源链跳转。
- 负责人、复核人、截止日期、原因、建议步骤、附件数和评论数展示。
- 严格顺序状态流转：待处理 → 进行中 → 待复核 → 已完成。
- 开始处理、提交复核、复核完成和重新打开均调用现有 API。
- 人工新建任务调用现有 `createTask`。
- API 失败状态不会回退成演示记录。

## 当前可见差距

- 首屏是“三个数字摘要 + 工具条 + 四列卡片看板 + 详情栏”，任务结构泛化，类似常见 AI 生成的后台/项目管理模板。
- 看板卡片把优先级、来源、负责人、日期拆成重复小元素，用户很难围绕“我现在应处理或复核什么”快速排序。
- 右侧状态链使用四个编号 chip；详情标题只有 11px，重要信息层级偏弱。
- 390px 仍使用最小宽度 660px 的看板并依赖横向滚动，不是可完成核心任务的移动结构。
- “评论”和“附件”目前只有既有数量，接口没有创建评论或上传附件能力；不得把它们做成假按钮。
- 创建接口只支持现有 `TaskCreate` 字段；不得凭空增加分配弹窗、评论、提醒、订阅、批量更新或新协作模型。

## Pro 必须完成的选择

先调研官方公开竞品资料，只能选择：

1. 一个主竞品；
2. 一个具体用户任务；
3. 一个本页可见差距；
4. 一套任务结构，不混合第二竞品视觉；
5. 一个严格复用现有 API/DTO/状态的实现切片；
6. P0/P1/P2 验收标准。

本批优先复刻成熟投标/RFP 产品的任务分派与复核工作流；若官方资料不足，可选择成熟协作产品，但必须说明该结构如何直接服务“整改负责人处理任务、复核人复核任务”。

## 允许范围

默认允许修改：

- `frontend/features/tasks/task-center.tsx`
- `frontend/app/globals.css`
- `frontend/tests/phase-workbenches.test.tsx`
- `frontend/tests/e2e/phase2-5.spec.ts`
- 本批执行证据与作品集文档/截图

如确有必要增加专属 CSS module，必须先证明继续扩展全局 `.task-*` 会造成职责冲突，并在执行包中列明新文件的唯一必要性。不得新建 V2/New/Replacement 组件。

## 禁止范围

- 不新增路由、API、DTO、数据库迁移、状态枚举或全局 store。
- 不创建第二套任务系统、通用协作平台或 Agent 任务页。
- 不伪造评论、附件、通知、@提及、批量分派、负责人选择、提醒或活动日志。
- 不改变既有顺序状态流转和人工复核边界。
- 不修改文件封装、最终复核或其他页面来扩大本批。
- 不把 Agent、安全、审计、运行环境或演示状态作为页面卖点。

## 验收证据

- 1440 × 900、1280 × 720、390 × 844 production 浏览器截图。
- 390px 核心任务不得依赖横向页面滚动。
- 搜索、优先级筛选、任务选择、表格/目标视图切换、来源跳转和下一步状态动作必须真实可达。
- 测试必须覆盖至少：筛选、选择后详情变化、顺序状态流转、非法跨状态阻止和移动核心视图。
- `npm run lint`
- `npm run typecheck`
- 聚焦测试、前端全量测试、E2E、production build。

只有产品任务、UI/设计、交互、Agent 边界和架构复用都没有 P0/P1 时才可回复 `PRODUCT_ACCEPT`。
