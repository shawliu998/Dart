# Batch 04 Orchestrator Brief：最终文件封装与交付检查

日期：2026-07-27

## 本批唯一用户任务

投标经理在最终交付前查看受控文件目录，运行确定性检查，逐项定位并处理阻塞/警告，预览交付包，并在满足人工门禁后生成最终 ZIP。

本批只优化 `/projects/[projectId]/package`。不延伸到最终复核页、外部投标平台提交、签章、版本历史或新的 Agent 工作流。

## 当前可见问题

- 页面功能齐全，但顶部三类指标、进度条、三组操作与下方三栏同时竞争注意力，交付任务顺序不够鲜明。
- 文件树、检查表和问题详情均可用，但视觉关系更像通用管理仪表盘，尚未形成竞品式的“检查问题 → 修复/确认 → 预览/生成”操作节奏。
- 桌面基线：`.data/page-audit/2026-07-21/baseline/16-package.jpg`。
- 移动端基线：`.data/page-audit/2026-07-21/baseline/mobile/package.jpg`。

## 真实复用锚点

- 路由：`frontend/app/projects/[projectId]/package/page.tsx`
- 主组件：`frontend/features/package/package-center.tsx`
- 样式：`frontend/app/globals.css` 中既有 `.package-*`、`.validation-*`、`.tree-*`
- 数据类型：`frontend/lib/phase-data/types.ts` 中既有 `PackageNode`、`PackageCheck`
- 数据映射与调用：`frontend/lib/api/phase2.ts`
- 演示数据：`frontend/lib/phase-data/demo.ts`
- 单测：`frontend/tests/phase-workbenches.test.tsx`
- E2E：`frontend/tests/e2e/phase2-5.spec.ts`

当前 `package-center.tsx` 有用户未提交改动，必须保留：

- `validate()` 成功后重新读取 `phaseApi.package(projectId)`，并更新文件树、检查项和当前选择；
- 刷新失败时保留检查前状态并给出错误反馈；
- 通过率只计算真正 `passed` 的确定性规则；
- 文件树副标题使用真实 `tree.length`，不得硬编码章节数。

## 已存在且可用的接口

- `phaseApi.package(projectId)`：读取文件树与检查清单。
- `phaseApi.validatePackage(projectId)`：运行确定性封装检查。
- `phaseApi.previewPackage(projectId)`：构建预览包。
- `phaseApi.bindPackageItem(itemId, documentId)`：将上传文件绑定到缺失封装项。
- `projectApi.uploadDocument(projectId, file, "bid_response")`：上传修复文件。
- `phaseApi.downloadPackage(packageId)`：下载预览包或最终包。
- `phaseApi.buildPackage(projectId, approved, approvalReason)`：经人工批准生成最终包。

后端真实路由：

- `GET /api/projects/{project_id}/package`
- `POST /api/projects/{project_id}/package/validate`
- `POST /api/projects/{project_id}/package/preview`
- `POST /api/projects/{project_id}/package/build`
- `PATCH /api/package-items/{item_id}`
- `GET /api/submission-packages/{package_id}/download`
- `POST /api/projects/{project_id}/documents`

## 必须保留的业务门禁

- 仍有 `failed` 检查时，最终 ZIP 按钮必须保持不可批准。
- 无阻塞后仍需人工确认警告并填写审批原因，才能生成最终 ZIP。
- 警告确认不能静默覆盖原始警告。
- 修复文件上传后必须重新校验并刷新真实后端状态。
- 预览和最终生成必须继续使用既有真实下载链路；演示模式仍可生成本地 ZIP。
- 结论必须保留来源要求链接。

## Pro 需要完成的决策

1. 先从公开官方来源中选择一个最适合本任务的主竞品，不得拼贴多个竞品。
2. 明确只复刻该竞品的哪一个工作流/页面区域，以及它如何服务“最终交付前检查并生成包”。
3. 给出桌面和 390px 移动端的具体结构、视觉密度、主次动作和状态表现。
4. 检查 UI、设计、交互、信息架构与 Agent 边界；Agent 不得成为页面卖点。
5. 生成一个 ZIP，至少包含：
   - `EXECUTION_BRIEF.md`
   - `REFERENCE_MAP.md`
   - `ACCEPTANCE.md`
   - `FILES.md`

## 允许修改

- `frontend/features/package/package-center.tsx`
- `frontend/app/globals.css` 中与 Batch 04 相关的既有选择器或必要的新语义选择器
- `frontend/tests/phase-workbenches.test.tsx`
- `frontend/tests/e2e/phase2-5.spec.ts`
- Batch 04 的证据文档与截图

只有在现有映射或演示数据无法表达竞品可见能力时，才可建议修改 `frontend/lib/api/phase2.ts`、`frontend/lib/phase-data/types.ts` 或 `frontend/lib/phase-data/demo.ts`，且必须标记为待 Codex 技术核验；默认不改。

## 禁止范围

- 不新增路由、API、DTO、数据库表、全局 store、第二套封装工作台或 `V2/new/replacement` 文件。
- 不修改 `frontend/features/review/final-review.tsx`。
- 不伪造外部平台提交、电子签章、批量下载、版本历史、评论、通知、审批流或文件预览器。
- 不增加无真实动作的按钮或占位页面。
- 不将聊天、Agent、审计、安全、部署、本地演示作为主导航或页面卖点。
- 不覆盖本批前已存在的用户改动。

## 执行包验收格式

`ACCEPTANCE.md` 必须列出可见 P0/P1 标准、同视口截图要求、390px 响应式标准、真实交互标准和明确的 `PRODUCT_ACCEPT` 条件。若设计建议依赖仓库中不存在的能力，必须标注“待 Codex 核验”，不得作为事实。
