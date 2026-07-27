# Batch 05 Orchestrator Brief：最终人工复核

日期：2026-07-27

## 本批唯一用户任务

投标负责人进入统一终审入口，按风险优先级查看仍需人工关注的要求、否决风险、证据匹配、投标响应和整改任务，回到对应工作台处理或确认，并在阅读当前工作包状态后填写复核说明，完成现有最终工作包人工复核请求。

本批只优化 `/projects/[projectId]/review`。不重复 Batch 04 的文件树、文件上传、封装检查、预览包或 ZIP 生成。

## 当前可见问题

- 首屏标题是“自主草稿工作包”，Agent 运行状态和“查看 Agent”抢占产品中心，不符合当前投标终审任务。
- 六个等权指标块形成 Dashboard/AI 模板感，但没有告诉负责人先处理哪一项。
- “人工复核入口”和“导出文件”是两列链接集合，用户需要自行推断终审顺序。
- 存在待处理最终工作包请求时，复核说明与完成按钮出现在上下文之前，负责人尚未浏览问题就先看到批准动作。
- 移动端把桌面指标网格直接压成两列，首屏仍看不到真正的终审问题主线。
- 桌面基线：`.data/page-audit/2026-07-21/baseline/17-review.jpg`。
- 移动基线：`.data/page-audit/2026-07-21/final/mobile/review.jpg`。

## 真实复用锚点

- 路由：`frontend/app/projects/[projectId]/review/page.tsx`
- 主组件：`frontend/features/review/final-review.tsx`
- 当前页面样式：`frontend/features/review/final-review.module.css`
- 单测：`frontend/tests/final-review.test.tsx`
- Agent 数据与审批调用：`frontend/lib/api/agent.ts`、`frontend/lib/agent/types.ts`
- 既有工作台数据：
  - `projectApi.requirements`
  - `projectApi.disqualifications`
  - `phaseApi.evidenceMatches`
  - `phaseApi.tasks`
  - `responseApi.list`
  - `phaseApi.package`
  - `agentApi.getRun`
- 现有完成动作：`agentApi.approve(finalApproval.id, { reason })`

`final-review.tsx` 和 `final-review.module.css` 当前没有用户未提交改动；本批可在原文件上增量实现，不得新建第二终审页。

## 已有数据与可表达状态

- 招标要求：总数、`review`、`missing`、置信度、来源页码与现有工作台链接。
- 否决风险：未解决、规则命中/已确认、现有工作台链接。
- 证据匹配：已选择证据数量、pending candidates、现有工作台链接。
- 投标响应：`approved`、`needs_review`、`missing_evidence`、`excluded`，现有工作台链接。
- 整改任务：`todo`、`in_progress`、`review`、`done`，现有工作台链接。
- 文件封装：`PackageNode` 文件状态和现有封装页链接。
- Agent：当前 run、outputs、pending `final_work_package_review` approval。
- API 读取失败：已有 `errors` 显式呈现，禁止用演示数据替换。

## 必须保留的真实行为

- 最终完成动作只能提交当前 pending `final_work_package_review`。
- 复核说明必须非空。
- 调用成功后反馈并 `router.refresh()`。
- 调用失败必须保留错误反馈。
- 所有问题只能链接到现有业务工作台处理，不在本页伪造编辑、接受、修复或文件操作。
- 部分接口失败时继续显式显示失败，不伪造完整状态。
- Agent 运行信息可以作为辅助来源或状态说明，但不得成为页面标题、首屏卖点或主要导航。

## Pro 需要完成的决策

1. 从官方公开来源中选择一个最适合“最终工作包人工复核与批准”的单一主竞品，不得拼贴多个竞品。
2. 明确只复刻该竞品的哪一个 Review / Approval 工作流区域，以及如何映射现有数据。
3. 给出桌面和 390px 的终审顺序、问题优先级、回跳处理方式和完成动作位置。
4. 检查 UI、视觉设计、交互、信息架构与 Agent 产品边界。
5. 生成一个 ZIP，至少包含：
   - `EXECUTION_BRIEF.md`
   - `REFERENCE_MAP.md`
   - `ACCEPTANCE.md`
   - `FILES.md`

## 允许修改

- `frontend/features/review/final-review.tsx`
- `frontend/features/review/final-review.module.css`
- `frontend/tests/final-review.test.tsx`
- `frontend/tests/e2e/phase2-5.spec.ts`
- Batch 05 的证据文档和截图

默认不修改路由 loader、API、类型、演示数据或其他工作台。若竞品建议依赖现有数据无法表达的能力，必须删减或标记“待 Codex 技术核验”。

## 禁止范围

- 不新增路由、API、DTO、数据库表、store、审批类型、工作流状态、第二终审组件或 `V2/new/replacement`。
- 不修改 Batch 04 `package-center.tsx`，不复制文件树、上传、预览或 ZIP 生成。
- 不在本页伪造要求编辑、证据接受、响应批准、任务完成、签章或外部提交。
- 不新增评论、通知、@提及、版本历史或文件预览器。
- 不把聊天、Agent、审计、安全、部署、本地演示作为标题、主导航或卖点。
- 不增加无真实动作的按钮或死路由。

## 执行包验收格式

`ACCEPTANCE.md` 必须列出 P0/P1/P2、1440×900、1280×720、390×844 同视口截图要求、真实交互标准、测试命令和明确的 `PRODUCT_ACCEPT` 条件。
