# BidEvidence 全产品终验 Orchestrator Brief

日期：2026-07-27
角色分工：ChatGPT Pro = Orchestrator / 产品终审；Codex = Executor / 仓库事实、实现、测试与封装
目标：把现有 BidEvidence 作品整理为适合 DeepSeek AGI 管培生申请评审的可核验作品包。

## 1. 本轮不是新功能批次

本轮只验收和封装现有产品主旅程，不新增页面、API、DTO、store、Agent 能力或第二套工作台：

1. 文件接收：`/projects/new`
2. 合规审阅：`/projects/[projectId]/requirements`
3. 企业材料：`/evidence`
4. 标书编制：`/projects/[projectId]/responses`
5. 整改任务：`/projects/[projectId]/tasks`
6. 交付包检查：`/projects/[projectId]/package`
7. 最终复核：`/projects/[projectId]/review`

Batch 01–05 均已分别取得 `PRODUCT_ACCEPT` 与 `TECH_ACCEPT`。本轮需要判断它们连接成一条完整任务链后是否仍然成立。

## 2. 求职作品评审任务

请从招聘评审者视角检查以下问题：

- 产品叙事：能否在较短时间内理解用户、痛点、主旅程、AI/规则/人工边界和作品价值。
- UI 与视觉：七个页面是否属于同一产品；是否仍有明显拼贴、AI 模板化、信息噪声或不自然文案。
- 信息架构：页面顺序、导航、回跳和当前阶段是否清楚。
- 交互闭环：主任务的输入、判断、异常、人工确认、成功反馈和后续动作是否真实可走通。
- Agent 边界：Agent 是否保持辅助能力，而没有重新成为主导航、主卖点或替代业务工作台。
- 技术架构：实现是否复用现有路由、组件、API、类型和测试锚点；是否出现平行实现或与产品叙事冲突的能力。
- 投递材料：README、案例说明、终验报告和截图是否足以让评审者独立判断；阅读顺序是否清晰。

## 3. 评审输出

请返回一个 ZIP，根目录至少包含：

- `FINAL_ACCEPTANCE.md`：总验收结论、P0/P1/P2、是否 `PRODUCT_ACCEPT`。
- `PORTFOLIO_REVIEW.md`：面向 DeepSeek AGI 管培生申请的作品优点、叙事缺口与最小修改建议。
- `PACKAGING_SPEC.md`：最终投递包的文件结构和评审者阅读顺序。
- `FILES.md`：ZIP 内容清单。

每条问题必须写明：

- 严重度：P0 / P1 / P2
- 所在页面或文档
- 可见证据
- 对用户或招聘评审的影响
- 最小修改建议

如果没有 P0/P1，请明确给出 `PRODUCT_ACCEPT`。P2 不阻止封装。

## 4. 判断约束

- 只基于仓库事实、测试证据和生产截图，不猜测不存在的接口或状态。
- 不虚构作者角色、团队规模、投入周期、客户、上线范围、真实业务指标或求职成果。
- 不把安全、部署、审计、性能、许可证、桌面封装或 Agent runtime 当作本轮新增工作。
- 不提出新路由、新业务页、新 API、新设计系统或大范围重构。
- 不因“作品完整”而扩张能力；只指出会阻止当前作品被理解、被验证或被演示的 P0/P1。
- Codex 对真实路径、接口、架构和测试结论保留技术否决权。

## 5. 已知事实

- 产品：标证通 BidEvidence，面向中国招投标材料接收、合规审阅、响应编制、整改与交付。
- 核心产品表面是项目工作台与合规矩阵，不是聊天 UI。
- 前端：Next.js App Router、TypeScript、Vitest、Playwright。
- 后端：FastAPI、Pydantic v2、SQLAlchemy 2、Alembic、pytest。
- 金额、日期、计数和最终合规结论由确定性规则处理；LLM 输出必须结构化并进入人工复核。
- 当前前端终验基线：lint、typecheck、production build 通过；19 个测试文件、106/106；E2E 7 passed、1 skipped。
- Batch 01–05 的逐批证据见随包 `docs/BATCH0*_EXECUTION_EVIDENCE.md`。

## 6. 本轮允许 Codex 修复的范围

仅允许：

- 现有七个页面中的 P0/P1 文案、导航、可见状态或交互收口。
- README、CASE_STUDY、终验报告、证据索引和投递包结构。
- 覆盖上述最小修复所必需的既有测试增量。

不允许：

- 新产品页面或“作品展示页”。
- 新 Agent 中心能力。
- 新业务状态、新接口或新的持久化层。
- 为封装方便复制一套应用。

## 7. 验收门槛

总验收通过需同时满足：

1. Pro：`PRODUCT_ACCEPT`，无未解决 P0/P1。
2. Codex：`TECH_ACCEPT`，真实仓库路径、复用边界、测试、production build 和浏览器主旅程证据成立。
3. 最终投递 ZIP 可解压，文件清单与 SHA-256 可复核。
4. 招聘评审者无需访问 Pro 对话即可理解作品、查看证据并找到运行方式。
