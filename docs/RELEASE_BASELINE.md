# BidEvidence 发布基线

## 当前基线

- 发布版本：`v0.1.2`
- 基线类型：DeepSeek AGI 求职作品与可运行源码
- 默认分支：`main`
- 精确源码：以 Git tag `v0.1.2` 指向的提交为准
- 上一可回退基线：`v0.1.1`
- 发布资产：`BidEvidence-DeepSeek-AGI-Portfolio-Final-R10.zip`
- 资产摘要：以 GitHub Release 中记录的 SHA-256 digest 为准

本文件只描述已经验收并允许进入发布的范围。未列入的后续规划、临时截图、数据库、上传物、构建缓存和本地环境不属于发布基线。

## 本批纳入范围

### 产品展示

- README 和 GitHub About 以要求、证据、响应编制与人工复核为主叙事。
- Agent loop 只作为受限运行机制与架构证据，不作为介绍页主口号或独立产品中心。
- 默认英文界面、中英切换和中文招标业务原文保护保持不变。

### 响应版本历史

- `ResponseItem.revision_number` 作为用户可见内容版本号。
- 不可变 `ResponseRevision` 保存 baseline、generated、edited 和 approved 快照。
- Alembic `0012_response_revisions` 为旧响应回填真实基线。
- 编辑与批准在原事务中追加快照；相同正文保存不生成伪版本。
- 原响应工作台内提供按需加载的版本历史、From / To 选择和本地差异比较。
- 审批事件未改变正文时显示明确中性说明。
- 不包含恢复、回滚、评论、分派、平行响应 API、第二工作台或 Agent UI。

## 验收证据

- ChatGPT Pro 复审：`RESPONSE_VERSION_ACCEPT`，P2 修正后为 `P2_RESOLVED_ACCEPT`。
- 本地 `make lint`：通过。
- 本地 `make test`：后端 126 项、前端 113 项全部通过。
- Next.js production build：通过。
- GitHub CI：backend-and-fixtures 与 frontend 全部通过。
- 迁移回填：模拟旧库中的 ResponseItem 升级后得到且只得到一个一致 baseline。
- 真实交互：`generated v1 → edited v2 → edited v3 → approved v4`，刷新后历史仍存在。
- 视觉证据：默认审批比较与真实文本差异两张截图已进入发布资产。

详细契约与执行记录见 `docs/RESPONSE_VERSION_HISTORY_EXECUTION_BRIEF.md`。

## 发布门禁

发布 `v0.1.2` 前必须同时满足：

1. 工作树只包含本批发布文档变更。
2. `make lint`、`make test` 和 production build 通过。
3. PR 合入 `main` 且 GitHub CI 全绿。
4. Git tag `v0.1.2` 指向合入后的 `main` 提交。
5. R10 ZIP 由该 tag 对应源码重建，ZIP 完整性校验通过。
6. GitHub Release 附带 R10 ZIP，并在发布说明中记录 SHA-256。

满足以上条件后，本批状态为 `RELEASE_BASELINE_ACCEPT`。
