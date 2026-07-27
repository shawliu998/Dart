# Batch 01 v1.1 执行证据

执行包：`BidEvidence-Batch01-Execution-Package-v1.1`

主竞品：Loopio Source Documents / Project Import

## 复用与变更

复用：

- `ProjectWizard`
- `projectApi.create`
- `projectApi.uploadDocument`
- `agentApi.createRun`
- 既有项目入口、应用壳层、表格样式和测试框架

变更：

- `frontend/features/projects/project-wizard.tsx`
- `frontend/tests/project-wizard.test.tsx`
- `frontend/app/globals.css`
- `docs/COMPETITOR_UI_AUDIT_2026-07-19.md`
- `docs/CASE_STUDY.md`
- `docs/assets/portfolio/project-intake-recovery.jpg`

没有新增路由、API、DTO、全局状态模型、V2 文件或平行工作台。

## P0 对照

| 条件 | 证据 |
| --- | --- |
| 独立文件状态 | 每行真实呈现待上传、上传中、已上传、上传失败和重试中 |
| 项目只创建一次 | 组件保存首次 `create` 返回的 `projectId`；回归测试断言 `create` 只调用一次 |
| 失败续传 | 单文件重试只调用既有 `uploadDocument(projectId, file, documentType)` |
| 成功文件不重复提交 | 批次只选择 `status !== "uploaded"` 的文件；回归测试保留首个成功文件 |
| Agent 门禁 | 任一上传结果失败即返回；只有全部上传成功后调用 `createRun` |
| 永久失败恢复 | 失败行同时提供真实“重试”和“移除失败文件” |
| 项目绑定稳定 | 项目创建后基本信息锁定；仍可新增待上传附件和续传失败文件 |
| 批量重试语义 | “重试失败文件”只处理 `failed`；成功后由“上传并继续”显式处理后来添加的 `pending` 文件 |

## P1 浏览器证据

- 1440 × 900 production：`.data/ui-project-intake-loopio/bidevidence-project-intake-failure-1440-prod.png`
- 1280 × 720 production：`.data/ui-project-intake-loopio/bidevidence-project-intake-failure-1280-prod.png`
- 390 × 844 production：`.data/ui-project-intake-loopio/bidevidence-project-intake-failure-390-prod.png`
- R2 批量重试语义：`.data/ui-project-intake-loopio/bidevidence-project-intake-batch-retry-r2-1280-prod.png`
- 1440px：`scrollWidth = clientWidth = 1440`
- 390px：`scrollWidth = clientWidth = 390`
- production 页面损坏图片：0

浏览器使用仓库合成 `demo/tender/招标文件.pdf` 与一份文件签名无效的临时 PDF，真实得到“一份已上传、一份 API_422 上传失败”的并存状态。失败文件的重试和移除按钮均可触达。

## 验证

- `npm run lint`：通过
- `npm run typecheck`：通过
- `npm test -- --run tests/project-wizard.test.tsx`：7/7 通过
- `npm test -- --testTimeout=15000`：19 个测试文件、100/100 通过
- `E2E_PORT=3117 npm run test:e2e`：7 项通过、1 项按环境跳过
- `NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:18081 npm run build`：通过
- `git diff --check`：通过

全量 E2E 首轮还发现上一批合规矩阵把第二个 `td` 改成 `display: grid` 后造成表格行点击命中异常；已恢复为合法 `table-cell` 布局，并以 3/3 smoke E2E 和全量 E2E 复验通过。该修正没有改变页面能力或扩大 Batch 01 范围。

Pro 的第二道 UI/设计/交互/Agent/架构复审指出一个 P1：主按钮“重试失败文件”原先同时处理 `failed` 与后来新增的 `pending` 文件。现已收敛为严格两步：批量重试只处理失败文件并停止；全部失败文件恢复后，按钮改为“上传并继续”，再显式上传待上传文件并进入要求提取。新增测试覆盖失败、后添加文件、批量重试、pending 保持、继续上传和项目不重复创建。

R2 production 浏览器复验在“一份已上传、一份失败、一份后来新增待上传”的状态下点击“重试失败文件”；失败文件重新请求后仍返回真实 `API_422`，后来新增文件保持“待上传”，证明批量重试没有夹带 pending 文件。1280px 下 `scrollWidth = clientWidth = 1280`。

## 双钥匙验收

- `PRODUCT_ACCEPT`：2026-07-27，ChatGPT Pro 复核源码、测试清单与 production 截图后确认 UI/设计、交互、Agent 产品边界和架构均无 P0/P1。
- `TECH_ACCEPT`：2026-07-27，Codex 复核真实仓库路径、既有接口复用、专项与全量测试、E2E、production build 和真实浏览器状态后通过。
- 非阻断观察：390px 文件表格信息密度偏高，当前无横向溢出且任务可完成；为保持 Loopio 单一任务结构，本批不引入另一套移动端组件。

Batch 01 已关闭。
