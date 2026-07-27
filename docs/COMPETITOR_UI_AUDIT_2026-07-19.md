# 标证通竞品 UI 审阅与复刻决策

日期：2026-07-19
范围：项目目录、合规矩阵、要求—证据—原文联动

## 结论

标证通不需要复制 GovDash 的美国政府投标功能结构，但适合高保真借鉴其桌面产品视觉：窄侧栏、白底低圆角、紧凑工具条、稳定表格列、克制状态色和原文联动。生产合规页已于 2026-07-27 将该结构落入既有工作台；OpenDesign 原型继续作为设计回归基线。

## 对标产品

### GovDash

- [Proposal 产品页](https://www.govdash.com/proposal)：强调完整招标文件解析、sentence-level shreds、要求映射、outline 与 Word 协同。
- [Compliance Matrix and Review Mode](https://support.govdash.com/docs/compliance-matrix-and-review-mode)：章节映射要求，点击 citation 定位原文，并支持文档、引用类型、章节筛选与 Excel 导出。
- [Agent 日志与人工审批](https://www.govdash.com/blog/ai-agents-built-for-the-way-govcon-works)：操作保留人工审批，输入、工具调用、输出与错误可追溯。

适合复用：项目表格、矩阵层级、过滤器、原文定位、克制状态表达。
不直接复制：美国政府采购专用阶段、英文术语、品牌色和信息字段。

### Loopio

- [RFP automation](https://loopio.com/rfp-automation-software/)：项目管理、SME 协同、SmartScan 与内容库整合。
- [Confident Answers](https://loopio.com/platform/confident-answers/)：受控知识库、内容新鲜度、来源与置信提示。

适合复用：企业材料的受控复用、来源和更新状态。
不直接复制：以回答库为中心的页面结构；标证通仍以项目、要求和证据为中心。

## 当前界面检查

### 生产项目目录

- 指标卡高度偏大，页面首屏有效数据密度低。
- 侧栏企业卡和分组视觉权重偏高。
- 风险、阶段、来源等状态同时使用大面积徽标，容易形成“胶囊墙”。
- 表格基本信息完整，但筛选区、指标区与数据区之间的层级还不够连续。

### 生产合规工作台

- 三栏结构方向正确，是当前最接近目标的页面。
- 页面标题、行动区和警示区偏高，挤压核心审阅区域。
- 要求列表、详情与文档已经形成任务闭环，但边框和状态块略多。
- 原文高亮需要成为视觉焦点，AI 置信度只能作为提示，不能代替复核结论。

## OpenDesign 复刻方案

| 页面 | 采用结构 | 核心交互 | 视觉约束 |
| --- | --- | --- | --- |
| 项目目录 | 224px 侧栏、64px 顶栏、指标条、筛选条、密集表格 | 项目搜索、项目进入、分页展示 | 6–8px 圆角，单一蓝色主操作，状态色克制 |
| 合规审阅 | 要求列表、详情、原文三栏 | 要求搜索、要求切换、证据定位、复核选择与保存 | 原文与证据优先，警告色只表示需处理状态 |

## 验收证据

- 项目页截图：`.data/ui-audit/2026-07-19/opendesign/02-project-directory-1440.png`
- 合规页截图：`.data/ui-audit/2026-07-19/opendesign/03-compliance-1440.png`
- 项目页参考对比：`.data/ui-audit/2026-07-19/opendesign/04-project-comparison.png`
- 合规页参考对比：`.data/ui-audit/2026-07-19/opendesign/05-compliance-comparison.png`

## 迁移顺序

1. 将 OpenDesign token 映射到现有 `frontend/app/globals.css` 语义变量。
2. 迁移项目目录的指标条、筛选条与密集表格，保留现有 React 状态和 API。
3. 迁移合规页三栏骨架与原文高亮，不改变后端确定性规则。
4. 对 1440×900、1366×768 和桌面应用窗口进行视觉回归。
5. 用户确认后再删除隔离原型或将其保留为设计回归基线。

## 公开流程深测补充

### 新建项目与文件接收

GovDash 的公开帮助中心显示，新建 Proposal 时先建立草稿，再加入 RFP/RFQ、PWS/SOW、附件和更正文件；每份文件需要有明确类型，完成后才生成 compliance matrix 与 annotated outline。Responsive 的 Requirements Analysis 同样先建立 workspace，再从文档生成可配置矩阵，并允许继续 shred 新文档、增补字段、定制列和打开 Source View。

标证通采用以下匹配方式：

- 移除三步向导，把项目基本信息和文件接收合并为单页任务流；创建前不再插入装饰性成功页或确认卡片。
- 文件接收改为“过滤器在左、添加操作在右、文件表格在下”的 GovDash 式信息结构，优先展示业务信息。
- 每份文件可明确选择“招标主文件 / 招标附件 / 更正补遗 / 答疑澄清”，并把所选类型传给现有上传接口。
- 文件状态使用圆点与文本，不为每行重复放置文件图标或成功图标。
- 文件名使用可识别的链接色，格式、大小和移除动作保持低强调；移动端隐藏次要元数据，保留文件名、状态、用途和删除操作。
- “创建并开始分析”完成项目创建、逐文件上传、启动一次分析并进入项目总览，不再把用户送到通用 Agent 中心。

### 当前账号访问边界

- GovDash：公开帮助中心可完整查看上传、分类、合规矩阵、outline、citation 与设置流程；产品后台为登录入口，深度实测需要供应商开通或演示账号。
- Responsive：Requirements Analysis 的公开文档可查看完整操作结构，但官方明确标注该功能需要联系支持启用。
- Loopio：公开帮助中心可查看项目、导入、分派、复核与导出流程；产品实例通常由企业组织开通。

因此，本轮没有创建竞品空账号，也没有向外部上传任何私有项目数据；交互验证只使用仓库内的合成招标文件。公开材料已经足够完成上传流程的首轮高保真改造。后续若要验证真实处理动画、解析队列、错误恢复、设置保存和角色权限，需要分别申请受控产品访问，并在上传前再次确认测试文件范围。

## 2026-07-27 响应编制单一母版

响应编制页不再混用合规审阅、纸张编辑器或 AI 助手侧栏。本轮只采用 Loopio 官方帮助中心的 [Project List View](https://support.loopio.com/hc/en-us/articles/360046156333-How-Can-I-Configure-the-View-of-the-Questions-I-Am-Working-On) 及其[官方界面截图](https://support.loopio.com/hc/article_attachments/360065457153/mceclip0.png)作为母版。

- 用户任务：按章节浏览响应，读取各条状态，在当前条目原位编写正文，同时核对要求来源与已接纳证据，最后保存或人工批准。
- 可见结构：项目顶栏与状态轨 → 左侧章节树 → 右侧连续响应列表 → 单条原位展开；章节和答案都可真实收起，筛选后章节编号保持稳定。
- 明确删除：三栏常驻面板、A4 纸张画布、AI 助手入口、卡片阵列、假格式工具栏、头像和无真实契约的分派/内容库按钮。
- 复用决定：继续使用原 `ResponseWorkbench`、响应 API、草稿缓存、筛选、`J/K/Esc`、保存、批准和缺材料门禁；新增的只是组件内披露状态与紧凑排版，没有新增路由、API、DTO、viewer 或第二套工作台。
- 行为门禁：正文一旦产生未保存修改，批准入口立即禁用；必须先保存并进入既有复核契约，避免旧版本被批准。
- 验收证据：`docs/assets/portfolio/hero-response-workbench.jpg`；1280 × 720 首屏可看到复核意见、保存与批准动作，无横向溢出；聚焦测试覆盖答案收起、章节收起和未保存批准门禁。

## 2026-07-27 合规审阅竞品能力对齐

本轮以 GovDash 的 Compliance Matrix / Review Mode 和 Responsive 的 Source View 为同一工作流的能力参考，不混入聊天、纸张编辑器或装饰性 AI 面板。

- 用户任务：筛选并逐条选择要求，联动查看来源页，核对要求详情、证据和判断，批量分配后导出矩阵。
- 参考证据：`.data/ui-audit/2026-07-19/competitors/govdash-compliance-review.png`、`.data/ui-audit/2026-07-19/competitors/govdash-document-viewer.png`。
- 可见差距：旧页正文仅 8–9px、矩阵关键列被长期隐藏、图标按钮缺少任务文案、“保存视图”没有恢复状态、三栏不能切换为真正的矩阵或来源聚焦。
- 复刻结果：保留三栏审阅，同时提供真实的“矩阵聚焦”和“来源聚焦”；保存并恢复搜索、筛选与视图；批量勾选出现可操作的选择条；枚举类别改为中文；来源位置不再伪装成可切换文档的无效控件。
- 复用决定：继续扩展既有 `RequirementsWorkbench`、`DocumentViewer`、要求 API、筛选状态与测试，没有新增路由、DTO、API、状态模型或第二套工作台。
- 桌面验收：`.data/ui-requirements-govdash/bidevidence-requirements-1440-final.png`；1440 × 900 下页面 `scrollWidth = clientWidth = 1440`，损坏图片为 0。
- 响应式验收：1024px 仍显示三栏；390px 按视图只呈现当前任务面板，矩阵视图无页面级横向溢出。
- 自动化证据：合规工作台 5 项聚焦测试通过；前端全量 19 个测试文件、98 项测试通过；lint、TypeScript 和 Next.js production build 通过。

## 2026-07-27 项目与文件接收能力对齐

本轮执行包由 GPT Web Pro 作为 Orchestrator 调研并收敛，Codex 作为 Executor 在本地实现、测试和回传验收。执行包版本为 `BidEvidence-Batch01-Execution-Package-v1.1`，唯一主竞品是 Loopio Source Documents / Project Import。

- 官方参考：[Using Source Documents in Projects](https://support.loopio.com/hc/en-us/articles/360020261754-Using-Source-Documents-in-Projects)、[Import Questions from Source Documents](https://support.loopio.com/hc/en-us/articles/360036305333-How-Do-I-Import-Questions-from-my-Source-Documents-to-a-Project)。
- 用户任务：创建项目，接收 RFP 主文件与附件，逐份查看真实上传状态，失败时续传或移除，全部成功后再启动要求提取。
- 可见差距：旧页所有文件长期显示“待上传”；任一失败只给页级错误；重试会重新走完整 `create → upload → run`，没有防止重复创建项目和重复上传成功文件的界面契约。
- 参考边界：Loopio 官方公开资料没有可稳定下载的完整产品截图，因此不声称像素级复刻；本轮只对齐官方任务结构、信息密度、文件—项目绑定和上传反馈。
- 复用决定：只扩展既有 `ProjectWizard`、`projectApi.create`、`projectApi.uploadDocument`、`agentApi.createRun`、直接测试与现有样式；没有新增路由、API、DTO、全局状态模型、V2 文件或平行工作台。
- 真实状态：每份文件独立呈现“待上传 / 上传中 / 已上传 / 上传失败 / 重试中”；成功文件锁定用途且不重复提交，失败文件可以单独重试或移除。
- 续传门禁：组件保留首次创建得到的 `projectId`；失败重试只调用该项目的 `uploadDocument`；全部文件成功前不会调用 `createRun`。
- 浏览器证据：`.data/ui-project-intake-loopio/bidevidence-project-intake-failure-1440-prod.png`、`.data/ui-project-intake-loopio/bidevidence-project-intake-failure-390-prod.png`；使用一份仓库合成 PDF 和一份签名无效的临时 PDF 验证成功/失败并存，1440px 与 390px 均满足 `scrollWidth = clientWidth`，损坏图片为 0。
- 自动化证据：聚焦测试覆盖“一个成功、一个失败、单文件重试、批量重试不夹带待上传文件、项目只创建一次、全部成功后继续要求提取”；前端全量 19 个测试文件、100 项测试通过；E2E 7 项通过、1 项按环境跳过；lint、TypeScript 和 production build 通过。浏览器失败态同时提供真实重试和移除动作。

## 2026-07-27 企业材料库能力对齐

本轮由 GPT Web Pro 先读取真实仓库上下文并调研，只选择 Loopio Library 作为主竞品。执行包版本为 `BidEvidence-Batch02-Execution-Package-v1.0`。

- 官方参考：[What is the Library?](https://support.loopio.com/hc/en-us/articles/360020607753-What-is-the-Library)、[Getting Started: Library](https://support.loopio.com/hc/en-us/articles/360023922353-Getting-Started-Library)。
- 用户任务：选择一份已有材料，核对验证状态、有效期、最近复核、Claims 和已使用项目，判断它是否适合作为当前投标的候选材料。
- 可见差距：旧页面首屏由六项等权 KPI、左筛选、中表格和右详情组成，更像 Dashboard；组件内上传与解析队列只改变本地演示状态，没有后端材料库 mutation 契约。
- 复刻结果：删除 KPI 条与假解析动作，以紧凑搜索/筛选、材料清单和当前材料复核详情作为唯一结构；候选、待验证、过期和冲突提示都由现有 `EvidenceAsset.status` 与有效期产生。
- 数据真实性：Claims、来源预览、使用项目和当前版本全部绑定选中材料；版本页不再伪造 `V1 初始上传`，只显示接口已有的最新版本。
- 响应式：390px 使用“材料列表 / 材料详情”切换，选择材料后进入详情；1440、1280、390 均满足 `scrollWidth = clientWidth`。
- 复用决定：只扩展既有 `/evidence`、`EvidenceLibrary`、局部样式、`phaseApi.evidence()`、`EvidenceAsset`、`EvidenceClaim`、`DocumentViewer` 和现有测试，没有新增路由、API、DTO、store 或平行工作台。
- 验收证据：`.data/ui-evidence-loopio/bidevidence-evidence-loopio-1440-prod.png`、`.data/ui-evidence-loopio/bidevidence-evidence-loopio-1280-prod.png`、`.data/ui-evidence-loopio/bidevidence-evidence-loopio-390-detail-prod.png`。
- 自动化证据：材料库直接测试 4/4、前端全量 19 个测试文件 102/102、E2E 7 项通过且 1 项按环境跳过、lint、TypeScript 和 production build 通过。

## 2026-07-27 整改任务协作能力对齐

本轮只采用 Loopio Projects / My Tasks 的任务协作结构，执行包版本为 `BidEvidence-Batch03-Execution-Package-v1.0`，没有混入另一套项目管理产品。

- 官方参考：[How Can I Keep Track of My Tasks in a Project?](https://support.loopio.com/hc/en-us/articles/360020467033-How-Can-I-Keep-Track-of-My-Tasks-in-a-Project)、[Getting Started: Projects](https://support.loopio.com/hc/en-us/articles/360023671294-Getting-Started-Projects)。
- 用户任务：整改负责人查看任务来源、原因和步骤，开始处理并提交复核；复核人完成复核。
- 可见差距：旧页面由三个数字摘要、四列卡片看板和右侧详情组成，下一动作被卡片元数据分散；390px 看板依赖 660px 横向布局。
- 复刻结果：默认使用工作清单，每行直接呈现状态、负责人→复核人、截止和下一步；流程看板退为第二视图；详情集中展示来源、原因、处理步骤和真实下一动作。
- 数据边界：附件和评论只显示既有数量，不增加当前接口不存在的写入动作；没有伪造通知、@提及、批量分派、负责人目录或活动日志。
- 响应式：390px 使用“任务列表 / 任务详情”切换，流程视图纵向排列；移动详情固定呈现开始处理、提交复核或复核完成动作。
- 复用决定：只扩展既有 `TaskCenter`、`.task-*` 样式、`RemediationTask` 和五个任务 API；没有新增路由、API、DTO、store、状态枚举或平行任务系统。
- 验收证据：`.data/ui-tasks-loopio/bidevidence-tasks-loopio-1440-prod.png`、`.data/ui-tasks-loopio/bidevidence-tasks-loopio-1280-flow-prod.png`、`.data/ui-tasks-loopio/bidevidence-tasks-loopio-390-detail-prod.png`。
- 自动化证据：Phase 3–5 聚焦测试 7/7、前端全量 19 个测试文件 105/105、E2E 7 项通过且 1 项按环境跳过、lint、TypeScript 和 production build 通过。

## Figma 状态

已写入文件：[标证通 BidEvidence｜竞品复刻与核心工作台](https://www.figma.com/design/2cEC2Ocqb8bazhQF5H4wxB)。

- `01 · 投标项目目录 · Project Directory`：节点 `2:2`
- `02 · 合规审阅 · Compliance Review`：节点 `1:2`
- 两个画面均由本地 OpenDesign 页面转换为可编辑 Figma 图层，并已在画布中并排排列。
- UI 字体核验为 Inter，招标文件正文保留 Songti SC；截图未发现缺字、裁切或重叠。
- Figma Simple Design System 已完成组件与变量检索，可在下一轮将捕获图层逐步替换为 Button、Search、Table、Navigation 等组件实例。

## MyPitchFlow 登录态深测

本轮在用户已登录的 MyPitchFlow 账号中，用仓库内合成文件和纯英文测试内容跑通了创建、生成、编辑、状态、版本、分享、AI 审阅、知识库、设置与分析页面。未上传真实客户资料，未邀请外部成员，也未触碰付费操作。

### 已验证的产品流程

- 新建 Proposal 采用“先输入客户和需求，再进入异步生成”的短流程；生成完成后进入可编辑的长文档结果页。
- 结果页提供标题编辑、Draft / Sent / Won / Lost 状态、版本切换与历史、只读分享链接、导出语言、来源材料和 AI 审阅。
- Questionnaire 的产品说明采用表格编辑器、逐条置信度、分类筛选、批准和键盘复核，适合标证通的逐条要求审查。
- Knowledge Center 按公司资料、案例、产品、报价、模板、竞品、已验证答案等类别组织，并在入库前自动识别描述、类别和语言。
- 设置按个人、工作区、团队、集成、计费分组；Analytics 提供项目量、胜率、处理速度、管线和成员统计。

### 可复用到标证通的交互

1. 在投标响应工作台加入显式“复核模式”，用 `J / ↓`、`K / ↑` 快速切换条目，用 `Esc` 退出；编辑输入框聚焦时不截获按键。
2. 后续将版本历史做成不可变快照，并把“修改原因、证据来源、人工批准”放进同一审计链；不照搬无确认即创建新版本的行为。
3. 分享只复用“只读、到期时间、可撤销”的权限模型，不默认发送邀请。
4. 知识库沿用标证通的证据类别和人工接纳边界，并增加入库进度、失败原因和重试，不采用静默消失。
5. Agent 运行采用阶段、耗时、当前动作和可恢复错误；不使用只有 `Generating…` 与取消按钮的黑箱等待。

### 明确不复刻的问题

- 视觉：重复的琥珀色顶边卡片、阴影、巨大留白和装饰性图标会强化“AI 模板感”，不进入标证通设计系统。
- 中文兼容：上传仓库中的中文招标 PDF / DOCX 后生成失败，提示 `unsupported Unicode escape sequence`；更改英文客户名和 ASCII 文件名仍无法消除，问题更可能位于正文处理。
- 异步反馈：生成实际超过 60 秒，但页面无阶段、进度或预计时间；AI Apply、来源材料上传和知识库入库也缺少明确成功或失败反馈。
- 导出：页面点击 Download / DOCX Only 后未观察到下载事件或可见反馈；公开指南与实际菜单暴露能力也不完全一致。
- 文案：设置和集成页存在法语、英语混排，产品语言状态不稳定。

### 审计证据

- Dashboard 空状态：`.data/product-audit/2026-07-19/mypitchflow/01-dashboard.png`
- 上传弹窗：`.data/product-audit/2026-07-19/mypitchflow/02-upload-modal.png`
- 新建表单：`.data/product-audit/2026-07-19/mypitchflow/03-generate-form.png`
- 文件就绪：`.data/product-audit/2026-07-19/mypitchflow/04-ready-to-generate.png`
- Unicode 错误：`.data/product-audit/2026-07-19/mypitchflow/05-generation-unicode-error.png`
- 生成中：`.data/product-audit/2026-07-19/mypitchflow/06-generating-dashboard.png`
- 结果页：`.data/product-audit/2026-07-19/mypitchflow/07-proposal-result-top.png`
- Knowledge Center：`.data/product-audit/2026-07-19/mypitchflow/09-knowledge-center.png`
- Analytics：`.data/product-audit/2026-07-19/mypitchflow/10-analytics.png`
