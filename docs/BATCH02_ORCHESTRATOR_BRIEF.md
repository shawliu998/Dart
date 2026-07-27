# Batch 02 Orchestrator 真实仓库简报

更新时间：2026-07-27

## 目标

请先调研并只选择一个可独立验收的竞品能力切片，再输出 Codex 可直接执行的 ZIP 包。不要先写代码，也不要把多个竞品的页面结构混在一起。

## 当前优先级判断

已完成并双钥匙验收：

1. 响应编制：Loopio Project List View。
2. 合规审阅：GovDash Compliance Matrix / Review Mode。
3. 项目与文件接收：Loopio Source Documents / Project Import。

按 `docs/CURRENT_PRODUCT_PRIORITY.md`，下一候选区域是企业材料库。仓库蓝图将“项目协作、任务与材料库”指向 Loopio，并明确材料库需要覆盖内容新鲜度、来源、版本、使用项目和人工接纳。

## 当前页面与可见现状

- 路由：`/evidence`
- 页面：`frontend/app/evidence/page.tsx`
- 主组件：`frontend/features/evidence/evidence-library.tsx`
- 现有局部样式：`frontend/features/evidence/evidence-library-v2.module.css`
- 公共样式：`frontend/app/globals.css`
- 当前截图：`.data/page-audit/2026-07-21/baseline/04-evidence.jpg`

当前桌面结构：

```text
页头与上传/导出
→ 六项提醒数字条
→ 左侧类型/状态筛选
→ 中间材料表格
→ 右侧预览 / Claims / 使用项目 / 版本
```

当前可见问题候选：

- 六项提醒平均占位，容易呈现 Dashboard/KPI 模板感，而不是明确的材料维护任务。
- 左、中、右三栏全部常驻，表格和详情文字偏小，主任务焦点不够稳定。
- “上传材料 → 开始解析 → 完成演示解析”是组件内本地演示队列，不是后端持久化链路；不应把它作为下一批的核心竞品能力。
- 页面已有内容新鲜度、有效期、主体、验证状态、Claims、使用项目和版本信息，但缺少一个由竞品任务驱动的清晰复核路径。
- 当前只有 API 读取 `/api/evidence`；没有材料库上传、版本发布、人工验证或内容插入的既有 mutation API。不得让 Codex猜测或新建这些契约。

## 真实数据与接口边界

- 数据读取：`phaseApi.evidence()` → `GET /api/evidence`
- 类型：`EvidenceAsset`、`EvidenceClaim`
- 现有字段：
  - 文件名、类型、主体、状态、有效期和剩余天数
  - Claim 数、使用项目数、负责人、部门、最近复核时间
  - 标签、页数、大小、版本、Claims、已使用项目
- 状态：`verified | review | expired | conflict`
- 当前没有可复用的材料上传、人工验证、版本发布或内容插入 mutation。

## 允许复用

- 原 `/evidence` 路由和 `EvidenceLibrary`
- `phaseApi.evidence()` 与现有 `EvidenceAsset` / `EvidenceClaim`
- `DocumentViewer`
- 当前筛选、选中材料、详情 tab、CSV 导出
- 既有 Dart 应用壳层、语义样式和图标
- 现有 API 错误态测试与 Playwright `/evidence` smoke

## 禁止

- 不新增第二个材料库路由或工作台。
- 不新增 V2/New/Replacement 组件、API、DTO、全局 store 或上传状态模型。
- 不伪造发布、批准、版本比较、上传成功或插入响应等没有真实契约的动作。
- 不把 Agent、AI 置信度、审计、安全或本地演示作为页面卖点。
- 不混合 Loopio、Responsive、GovDash 等多个竞品的视觉结构。
- 不以“更现代”“更完整”作为实施理由。

## Pro 必须交付的六项选择

1. 单一主竞品及可访问的公开页面或截图。
2. 投标经理要完成的一个具体材料库任务。
3. 当前页面缺少的可见能力。
4. 完成后用户能看到或做到什么。
5. 同视口截图、交互和测试验收条件。
6. 复用哪些现有锚点、精确缺少哪一层、为什么每个允许修改的文件有必要。

## 执行包格式

ZIP 中至少包含：

- `PLAN.md`
- `ACCEPTANCE.md`
- `REFERENCE.md`
- `FILES.md`

文件范围必须尽量收敛到：

- `frontend/features/evidence/evidence-library.tsx`
- `frontend/features/evidence/evidence-library-v2.module.css`
- 已有或新增的直接组件测试（仅在证明行为所必需时）
- `docs/COMPETITOR_UI_AUDIT_2026-07-19.md`
- `docs/CASE_STUDY.md`

如果方案需要新接口、后端契约、第二个页面或无法由现有数据完成，必须停止并更换为更小的竞品能力切片。
