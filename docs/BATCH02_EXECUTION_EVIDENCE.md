# Batch 02 v1.0 执行证据

执行包：`BidEvidence-Batch02-Execution-Package-v1.0`

主竞品：Loopio Library

## 单一用户任务

投标经理选择一份已有企业材料，查看验证状态、有效期、最近复核、Claims 和已使用项目，判断它是否适合作为当前投标的候选材料。

## 复用决定

复用：

- `/evidence`
- `EvidenceLibrary`
- `phaseApi.evidence()` / `GET /api/evidence`
- `EvidenceAsset` / `EvidenceClaim`
- `DocumentViewer`
- 现有搜索、筛选、材料选择、详情 tabs 与 CSV 导出

本批修改：

- `frontend/features/evidence/evidence-library.tsx`
- `frontend/features/evidence/evidence-library-v2.module.css`
- `frontend/tests/evidence-error-state.test.tsx`
- `frontend/tests/e2e/phase2-5.spec.ts`
- `docs/COMPETITOR_UI_AUDIT_2026-07-19.md`
- `docs/CASE_STUDY.md`
- `docs/assets/portfolio/evidence-library-loopio.jpg`

没有新增路由、API、DTO、全局 store、状态模型或第二个材料库工作台。

## 可见变化

- 删除六项等权 KPI 提醒条，避免材料维护页呈现 Dashboard 模板感。
- 删除“上传材料 → 开始解析 → 完成演示解析”的组件内假队列；当前页面只展示真实已有数据和真实可执行操作。
- 将左侧筛选、中间表格、右侧详情三栏收敛为“紧凑筛选条 → 材料列表 → 复核详情”。
- 详情使用现有状态确定性显示候选、待验证、过期和冲突提示，不生成新的批准或发布动作。
- Claims、来源预览、使用项目和版本都绑定当前选中材料。
- 版本页只显示接口提供的当前版本，并明确不伪造历史快照。
- 390px 使用“材料列表 / 材料详情”切换；选择材料后自动进入详情，核心任务不依赖横向滚动。

## 浏览器证据

- 旧版基线：`.data/page-audit/2026-07-21/baseline/04-evidence.jpg`
- 1440 × 900 production：`.data/ui-evidence-loopio/bidevidence-evidence-loopio-1440-prod.png`
- 1280 × 720 production：`.data/ui-evidence-loopio/bidevidence-evidence-loopio-1280-prod.png`
- 390 × 844 列表：`.data/ui-evidence-loopio/bidevidence-evidence-loopio-390-list-prod.png`
- 390 × 844 过期材料详情：`.data/ui-evidence-loopio/bidevidence-evidence-loopio-390-detail-prod.png`

实际浏览器已验证：

- 1440px：`scrollWidth = clientWidth = 1440`
- 1280px：`scrollWidth = clientWidth = 1280`
- 390px：`scrollWidth = clientWidth = 390`
- 搜索、类型/状态筛选、材料选择、Claims 页码、来源预览、使用项目、版本和清除筛选均可操作。
- 移动端选择 `ISO27001证书.pdf` 后进入详情，显示“已过期，不应直接复用”、有效期和冲突 Claim。

## 自动化验证

- `npm test -- --run tests/evidence-error-state.test.tsx`：4/4 通过
- `npm test -- --testTimeout=15000`：19 个测试文件、102/102 通过
- `E2E_PORT=3118 npm run test:e2e`：7 项通过、1 项按环境跳过
- `npm run lint`：通过
- `npm run typecheck`：通过
- `NEXT_PUBLIC_DEMO_MODE=true npm run build`：通过

## 双钥匙验收

- Pro：`PRODUCT_ACCEPT`（2026-07-27）。已复审 Loopio Library 单一任务结构、UI/设计、真实交互、Agent 产品边界、架构复用和多端证据；无 P0/P1。
- Codex：`TECH_ACCEPT`（2026-07-27）。现有路由、接口与类型复用成立；lint、TypeScript、102/102 单测、7 项通过 + 1 项跳过 E2E、production build 和 1440/1280/390 浏览器验证均通过。

Pro 仅保留两个非阻断 P2 观察：后续可继续压缩详情 tabs 的信息密度和移动详情间距。它们不影响本批“选择材料并判断是否可作为投标候选材料”的任务完成，Batch 02 双钥匙已齐备。
