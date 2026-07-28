# 已有能力地图与复用边界

## 1. 用途

本文件是新任务开始前的复用清单。目标是避免因为参考竞品而重写已经可用的页面、交互、API、状态模型或设计系统。

任务开始前必须先判断：

- **已有可用**：保持不动，只允许修复明确缺陷。
- **已有但缺一层**：在原组件、原 API 和原状态模型上增量补齐。
- **确实缺失**：确认没有相同职责的实现后，才允许新建。

不得把视觉风格更新解释为重写业务链路的理由。

## 2. 已有产品能力

| 产品区域 | 已有能力 | 主要实现锚点 | 复用决定 |
|---|---|---|---|
| 应用壳层 | 双层导航、项目上下文、全局搜索、通知、用户菜单、响应式布局 | `frontend/components/layout/app-shell.tsx`、`frontend/app/globals.css` | 保留壳层和 tokens，不新建第二套导航/设计系统 |
| 项目目录 | 保存视图、搜索、阶段/风险筛选、项目表格、进度、截止时间、新建入口 | `frontend/features/projects/project-list.tsx`、`project-views.ts` | 已有可用，只做增量交互或视觉校准 |
| 新建项目与文件接收 | 项目信息、文件添加/移除、文件用途分类、创建、上传、解析、要求提取、任务进度与失败反馈 | `frontend/features/projects/project-wizard.tsx`、`frontend/lib/api/projects.ts` | 已有完整链路，不重做上传向导 |
| 项目总览 | 项目阶段、风险、任务、文档分析入口和工作区导航 | `frontend/app/projects/[projectId]/overview/`、`document-analysis-panel.tsx` | 保持结构，按竞品能力增量扩展 |
| 合规审阅 | 要求列表、筛选、选中态、三栏审阅、原文页码、文档预览、人工确认、来源证据 | `frontend/features/requirements/requirements-workbench.tsx`、`frontend/components/documents/document-viewer.tsx` | 已接近竞品核心形态，不得另建合规页面 |
| 否决项 | 候选检测、风险状态、人工确认/拒绝和处理信息 | `frontend/features/disqualifications/disqualification-center.tsx` | 复用现有状态和 API |
| 企业材料库 | 分类/状态筛选、材料列表、有效期、主体、Claim、使用项目、版本和详情侧栏 | `frontend/features/evidence/evidence-library.tsx` | 已有高密度工作台，不另建知识库 |
| 证据匹配 | 要求—候选证据、来源、置信度、人工接受/拒绝和原因 | `frontend/features/evidence/evidence-matching-workbench.tsx`、`frontend/lib/api/phase2.ts` | 复用人工决策链路，不增加平行匹配状态 |
| 一致性检查 | 多来源值比较、标准值/合理差异处理、来源和整改信息 | `frontend/features/consistency/consistency-workbench.tsx` | 已有可用 |
| 补充公告 | 前后文差异、影响对象、应用变更和重新计算入口 | `frontend/features/amendments/amendment-workbench.tsx` | 已有可用 |
| 整改任务 | 来源驱动任务、负责人、优先级、截止、状态、完成和复核 | `frontend/features/tasks/task-center.tsx` | 复用现有协作状态，不另造通用任务系统 |
| 文件封装 | 文件树、确定性校验、缺件处理、文件绑定、预览、构建和下载 | `frontend/features/package/package-center.tsx`、`frontend/lib/api/phase2.ts` | 已有端到端链路，后续只补竞品可见能力 |
| 最终复核 | 要求、风险、证据、响应、任务和封装的统一复核入口 | `frontend/features/review/final-review.tsx` | 保留，不新建第二个终审页 |
| 审计 | 项目/全局记录、筛选、导出、追加式后端事件 | `frontend/features/audit/audit-center.tsx`、后端 audit service | 已有基础设施；当前阶段不主动扩张 |
| Agent | 运行、步骤、产物、审批和失败状态 | `frontend/components/agent/`、`backend/app/services/agent_runtime.py` | 已有辅助能力；当前阶段不提升为产品中心 |
| 模型设置 | 工作区级 Mock/DeepSeek 选择、结构化连接测试、密钥引用、持久化状态和无重启切换 | `frontend/features/settings/ai-settings.tsx`、`backend/app/services/ai_settings.py`、`backend/app/agents/provider.py` | 复用原 provider 接口和抽取链路；后续提供商必须用 capability profile 扩展，不新建平行模型网关 |
| 桌面运行时 | Electron 壳层、内嵌 FastAPI/Next sidecar、同源代理、服务监督、本地身份、品牌图标、unsigned DMG/ZIP 和隔离烟测 | `desktop/src/`、`backend/app/desktop_entry.py`、`scripts/build_desktop_release.sh`、`scripts/smoke_macos_dmg.sh` | macOS arm64 下载运行闭环已具备；签名、公证、自动更新和其他平台单独排期 |

## 3. 投标响应编制：当前复用结论

响应编制不是空白功能，以下能力已经存在：

### 前端已有

- 响应条目列表、搜索、选中状态和状态标签；
- `J/K`、方向键和 `Esc` 复核模式；
- 草稿正文编辑、修改原因、保存和批准；
- 缺材料阻止批准；
- API 失败与空列表区分；
- 用户可见内容版本号、不可变版本历史、任意版本比较、置信度、风险提示和证据 Claim ID；
- 对应实现：`frontend/features/responses/response-workbench.tsx`、`frontend/lib/api/responses.ts`。

### 后端已有

- 项目响应列表、人工编辑、人工批准 API；
- 编辑后重新进入复核、内容版本递增、理由和人工动作审计；
- `ResponseItem`、不可变 `ResponseRevision`、`ResponseEvidenceLink` 和确定性草稿生成服务；
- Requirement、Source、Document、EvidenceClaim 与 ResponseEvidenceLink 已有底层关系，可供原响应列表端点聚合；基线响应 DTO 只暴露 Claim ID，尚未完整暴露要求原文和证据来源；
- 对应实现：`backend/app/api/domain_routes.py`、`backend/app/schemas/domain.py`、`backend/app/services/responses.py`。

### 本批只允许增量补齐

- 在现有响应列表端点和 DTO 上增量补充 requirement/source/evidence projection，并映射到前端；不得新建平行端点；
- 在原 `ResponseWorkbench` 内形成左侧大纲、中间正文、右侧来源/证据的高密度布局；
- 增加状态筛选和窄屏面板切换；
- 让确定性演示展示已有响应状态，而不是在前端另造一套数据；
- 对参考图做同视口视觉比较。

### 本批禁止重复建设

- 不新建第二个 response workbench 路由或组件体系；
- 不新建平行 response API、DTO、状态枚举或审批流程；
- 不重写现有保存、批准、键盘复核和错误反馈；
- 不新建通用富文本编辑器、聊天侧栏或第二套文档查看器；
- 不新增恢复/回滚或平行版本端点；现有只读历史继续复用 `ResponseRevision` 与原工作台内的版本面板。

## 4. 尚未完整具备的竞品能力

以下能力可以进入后续差距清单，但必须继续优先复用现有模型：

1. 响应编制的连续文档大纲、章节级负责人和复核人。
2. 章节评论、@协作和复核队列。
3. 从企业材料/历史响应中检索并插入已批准内容。
4. 响应内容的 DOCX 预览、样式模板和独立导出入口。
5. 大批量响应的批量分派、批量状态更新和批量复核。

这些是“缺失或部分缺失”，不是当前页面全部推倒重建的理由。

## 5. 新代码准入规则

新增文件或模块前必须提供：

1. `rg` 结果证明没有相同职责的实现；
2. 说明为什么不能扩展表格中的主要实现锚点；
3. 与现有 API、状态和组件的复用关系；
4. 删除或迁移旧实现的计划（如果新实现会替代旧实现）；
5. 针对重复路由、重复状态和死按钮的验收检查。

若现有实现覆盖目标的大部分能力，默认在原文件中增量修改。不要通过添加 `V2`、`New`、`Replacement`、`Enhanced` 等命名绕过复用门禁。
