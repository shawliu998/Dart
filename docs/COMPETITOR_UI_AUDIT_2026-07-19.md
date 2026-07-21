# 标证通竞品 UI 审阅与复刻决策

日期：2026-07-19
范围：项目目录、合规矩阵、要求—证据—原文联动

## 结论

标证通不需要复制 GovDash 的美国政府投标功能结构，但适合高保真借鉴其桌面产品视觉：窄侧栏、白底低圆角、紧凑工具条、稳定表格列、克制状态色和原文联动。OpenDesign 原型已按该方向实现，生产页面暂未覆盖。

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
