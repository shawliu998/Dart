# BidEvidence 全产品终验输入索引

日期：2026-07-27

## 建议阅读顺序

1. `FINAL_ACCEPTANCE_ORCHESTRATOR_BRIEF.md`：本轮目标、边界和输出要求。
2. `ORCHESTRATOR_REPO_MANIFEST.md`：真实路径、接口、测试与批次状态。
3. `CURRENT_PRODUCT_PRIORITY.md` 与 `EXISTING_CAPABILITY_MAP.md`：产品阶段和复用约束。
4. `README.md` 与 `CASE_STUDY.md`：当前对外作品叙事。
5. `BATCH01_EXECUTION_EVIDENCE.md` 至 `BATCH05_EXECUTION_EVIDENCE.md`：逐批双钥匙验收。
6. `screenshots/01` 至 `08`：本轮 production 主旅程与移动端证据。
7. `frontend/features/**` 与 `frontend/tests/**`：关键实现和自动化证据。

## 截图与用户任务

| 编号 | 文件 | 用户任务 | 运行状态 |
|---|---|---|---|
| 01 | `01-file-intake.png` | 录入项目并整理招标文件包 | production build + 本地 API |
| 02 | `02-compliance-review.png` | 对照要求、原文和企业证据完成人工判断 | production build + 干净种子库 |
| 03 | `03-evidence-library.png` | 检查企业材料有效性、来源和复用状态 | production build + 干净种子库 |
| 04 | `04-response-workbench.png` | 基于要求和已接纳证据编制、复核响应 | production build + 干净种子库 |
| 05 | `05-remediation-tasks.png` | 负责人处理问题并交给复核人确认 | production build + 干净种子库 |
| 06 | `06-package-review.png` | 检查阻塞、警告、文件并生成交付包 | production build + 干净种子库 |
| 07 | `07-final-review.png` | 按优先级完成终审并提交人工结论 | production build + 干净种子库 |
| 08 | `08-mobile-final-review.png` | 在 390px 视口查看终审优先级和回跳入口 | production build + 干净种子库 |

## 本轮执行观察

- 干净临时 SQLite 种子库可生成 14 份文档、24 条要求、7 份材料、17 条 Claims、8 个匹配、14 个检查、7 个问题、7 个任务、9 个封装项和 24 条响应。
- production build、真实本地 API 与七条路由均可访问。
- 现有持久库重复执行 `/api/dev/seed` 会因稳定文档 ID 与已有不同哈希记录冲突；本轮通过新的临时种子库完成终验，没有删除或覆盖用户数据。
- 本轮需由 Pro 判断上述 seed 重入现象是否影响“求职作品封装”的 P0/P1；不得顺势扩张为发布加固任务。
- 生产截图只能证明可见布局与当前状态；键盘、焦点、读屏和完整 WCAG 结论仍以自动化与专项检查为准，截图本身不能替代无障碍测试。
