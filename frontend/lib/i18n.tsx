"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type AppLocale = "en" | "zh";

const STORAGE_KEY = "bidevidence.locale";

const englishCopy: Record<string, string> = {
  "工作台": "Workspace",
  "投标项目": "Bid projects",
  "企业材料库": "Evidence library",
  "全局任务": "Tasks",
  "Agent 中心": "Agent center",
  "审计记录": "Audit log",
  "设置": "Settings",
  "工作区设置": "Workspace settings",
  "模型连接": "Model connection",
  "选择用于招标文件分析的模型。连接测试会运行一次真实的结构化输出校验，保存后无需重启。":
    "Choose the model used to analyze tender documents. The connection test validates a real structured response, and changes apply without a restart.",
  "提供商": "Provider",
  "每个工作区只启用一个分析模型。": "One analysis model is active per workspace.",
  "离线、确定性，适合试用和演示": "Offline and deterministic for evaluation and demos",
  "使用你的 API 密钥运行真实模型": "Run a live model with your API key",
  "连接详情": "Connection details",
  "密钥只在本机保存，读取设置时不会返回。": "The key stays on this device and is never returned by the settings API.",
  "模型": "Model",
  "已保存密钥；留空则继续使用": "A key is saved; leave blank to keep using it",
  "当前工作区已有密钥。输入新值将替换它。": "This workspace already has a key. Enter a new value to replace it.",
  "该密钥不会显示在设置响应或运行记录中。": "The key is never shown in settings responses or run records.",
  "设置已保存，新的分析任务会立即使用此连接。": "Settings saved. New analysis tasks will use this connection immediately.",
  "连接通过，结构化输出符合要求。": "Connection passed. Structured output meets the required contract.",
  "连接未通过，请检查密钥、模型名称和网络后重试。": "Connection failed. Check the key, model name, and network, then try again.",
  "保存前请先测试当前配置。": "Test the current configuration before saving.",
  "测试连接": "Test connection",
  "保存设置": "Save settings",
  "正在测试…": "Testing…",
  "正在保存…": "Saving…",
  "正在载入设置…": "Loading settings…",
  "请输入 API 密钥后重试。": "Enter an API key and try again.",
  "API 密钥未通过验证，请检查后重试。": "The API key was rejected. Check it and try again.",
  "连接超时，请检查网络或服务地址。": "The connection timed out. Check the network or service URL.",
  "服务已响应，但输出不符合结构化分析要求。": "The service responded, but its output did not meet the structured analysis contract.",
  "无法连接到模型服务，请检查服务地址和网络。": "The model service could not be reached. Check the service URL and network.",
  "项目总览": "Overview",
  "合规审阅": "Compliance review",
  "标书编制": "Response writing",
  "整改交付": "Remediation & delivery",
  "项目记录": "Project log",
  "招投标工作台": "Tender workspace",
  "主导航": "Primary navigation",
  "项目导航": "Project navigation",
  "工作区导航": "Workspace navigation",
  "标证通首页": "BidEvidence home",
  "使用帮助": "Help",
  "打开全局搜索": "Open global search",
  "演示帮助": "Demo help",
  "使用 ⌘K 搜索项目、要求、材料或运行结构化 Agent 动作。":
    "Use ⌘K to find projects, requirements, evidence, or structured Agent actions.",
  "当前项目": "Current project",
  "项目工作区": "Project workspace",
  "当前企业": "Current organization",
  "工作空间": "Workspace",
  "已保存视图": "Saved views",
  "标证通": "BidEvidence",
  "项目": "Project",
  "查看投标进度、合规状态与待办事项": "Track bid progress, compliance status, and open work",
  "确定性演示": "Deterministic demo",
  "新建项目": "New project",
  "项目视图": "Project views",
  "7 天内截止": "Due in 7 days",
  "高风险": "High risk",
  "中风险": "Medium risk",
  "低风险": "Low risk",
  "项目筛选": "Project filters",
  "搜索项目": "Search projects",
  "搜索项目、采购人或编号": "Search projects, buyers, or codes",
  "按阶段筛选": "Filter by stage",
  "全部阶段": "All stages",
  "要求确认": "Requirement review",
  "按风险筛选": "Filter by risk",
  "全部风险": "All risks",
  "阻断项": "Blockers",
  "项目列表": "Project list",
  "当前阶段": "Current stage",
  "进度": "Progress",
  "风险": "Risk",
  "待办": "To do",
  "截止时间": "Deadline",
  "最后更新": "Last updated",
  "打开": "Open",
  "完成度": "Completion",
  "今天": "Today",
  "昨天": "Yesterday",
  "操作反馈": "Action feedback",
  "共": "",
  "个项目": "projects",
  "今日投标态势": "Today’s bid overview",
  "确定性演示聚合": "Deterministic demo summary",
  "统计范围": "Reporting window",
  "近 7 天": "Last 7 days",
  "近 14 天": "Last 14 days",
  "近 30 天": "Last 30 days",
  "刷新": "Refresh",
  "导出": "Export",
  "Agent 运行": "Agent runs",
  "工作统计": "Work summary",
  "进行中项目": "Active projects",
  "14 天内截止": "Due in 14 days",
  "待处理任务": "Open tasks",
  "待人工审批": "Awaiting human approval",
  "项目组合": "Project portfolio",
  "按截止时间、完成度与风险集中查看": "Review deadlines, completion, and risk in one place",
  "管理项目": "Manage projects",
  "当前项目组合": "Current project portfolio",
  "阶段": "Stage",
  "我的整改任务": "My remediation tasks",
  "当前用户负责或复核的未完成事项": "Open items owned or reviewed by the current user",
  "任务中心": "Task center",
  "阻断": "Blocked",
  "处理": "Open",
  "工作台侧栏": "Workspace sidebar",
  "优先处理": "Priority work",
  "按优先级与截止时间排序": "Sorted by priority and deadline",
  "查看全部": "View all",
  "Agent 运行状态": "Agent run status",
  "当前项目工作流": "Current project workflow",
  "运行中": "Running",
  "投标合规与交付编排": "Bid compliance and delivery orchestration",
  "Agent 工作流完成度": "Agent workflow completion",
  "人工审批": "Human approvals",
  "当前步骤": "Current step",
  "整改任务编排": "Remediation orchestration",
  "封装阻塞": "Package blockers",
  "Agent 运行中心": "Agent run center",
  "最近活动": "Recent activity",
  "规则、模型与人工操作": "Rule, model, and human activity",
  "复制摘要": "Copy summary",
  "人工": "Human",
  "人工确认要求": "Requirement confirmed by human",
  "规则": "Rule",
  "运行金额上限检查": "Run amount-limit check",
  "提取招标要求": "Extract tender requirements",
  "上传企业材料": "Upload company evidence",
  "人工覆盖判断": "Human override decision",
  "全过程审计": "End-to-end audit",
  "模型运行、确定性规则和人工纠正均以追加方式记录；审计页只读。":
    "Model runs, deterministic rules, and human corrections are recorded append-only. This page is read-only.",
  "本地演示数据": "Local demo data",
  "只读导出": "Read-only export",
  "追加式审计保障": "Append-only audit trail",
  "当前视图不会修改业务数据；导出包含筛选条件、输入输出哈希和人工覆盖原因。":
    "This view cannot change business data. Exports include filters, input/output hashes, and override reasons.",
  "事件总数": "Total events",
  "人工覆盖": "Human overrides",
  "模型运行": "Model runs",
  "搜索审计记录": "Search audit log",
  "搜索人员、动作、对象、模型或规则": "Search people, actions, objects, models, or rules",
  "筛选": "Filters",
  "操作者类型": "Actor type",
  "全部操作者": "All actors",
  "人员": "People",
  "Agent / 模型": "Agent / model",
  "规则引擎": "Rule engine",
  "风险级别": "Risk level",
  "时间线视图": "Timeline view",
  "表格视图": "Table view",
  "人工操作": "Human action",
  "分析公告差异": "Analyze amendment changes",
  "实体类型": "Entity type",
  "实体 ID": "Entity ID",
  "模型 / 规则": "Model / rule",
  "Prompt 版本": "Prompt version",
  "修改前": "Before",
  "修改后": "After",
  "原因": "Reason",
  "完整性哈希": "Integrity hashes",
  "输入": "Input",
  "输出": "Output",
  "项目 Agent": "Project Agent",
  "选择一个项目，继续已有运行或创建新的受控分析任务。":
    "Select a project to continue an existing run or create a new controlled analysis task.",
  "个可执行项目": "runnable projects",
  "项目队列": "Project queue",
  "按最近更新排序，风险与截止时间来自项目数据。":
    "Sorted by recent updates; risk and deadlines come from project data.",
  "查看全部项目": "View all projects",
  "受控执行边界": "Controlled execution boundary",
  "Agent 只生成内部候选与草稿；金额、日期、数量及最终合规状态仍由规则和人工复核决定。":
    "The Agent creates internal candidates and drafts only. Amounts, dates, quantities, and final compliance remain rule-checked and human-reviewed.",
  "通知中心": "Notifications",
  "全部工作空间": "All workspaces",
  "来源：确定性演示 · API 通知尚未接入":
    "Source: deterministic demo · API notifications are not connected",
  "关闭通知中心": "Close notifications",
  "未读": "Unread",
  "全部标为已读": "Mark all as read",
  "查看全部待办": "View all tasks",
  "全局搜索与 Agent 动作": "Global search and Agent actions",
  "搜索项目、要求、材料，或执行 Agent 动作…": "Search projects, requirements, evidence, or Agent actions…",
  "关闭命令面板": "Close command palette",
  "搜索结果": "Search results",
  "命令": "Command",
  "要求": "Requirement",
  "没有匹配内容": "No matching content",
  "搜索覆盖项目、要求、企业材料和动作。":
    "Search includes projects, requirements, company evidence, and actions.",
  "Agent 动作": "Agent actions",
  "打开工作台": "Open workspace",
  "总览项目、风险和待办": "Project, risk, and task overview",
  "打开投标项目": "Open bid projects",
  "项目组合与筛选": "Project portfolio and filters",
  "进入创建向导": "Open the creation flow",
  "打开企业材料库": "Open evidence library",
  "证书、案例与 Claim": "Certificates, references, and claims",
  "打开全局任务": "Open tasks",
  "跨项目整改任务": "Cross-project remediation tasks",
  "打开 Agent 运行中心": "Open Agent run center",
  "模型运行、队列与人工接管": "Model runs, queues, and human takeover",
  "打开全局审计": "Open global audit",
  "跨项目只读记录": "Cross-project read-only records",
  "复制当前项目编号": "Copy current project code",
  "项目编号已复制": "Project code copied",
  "解析招标文件": "Parse tender files",
  "否决项检测重跑": "Rerun disqualification checks",
  "为缺口寻找证据": "Find evidence for gaps",
  "运行一致性检查": "Run consistency checks",
  "分析补充公告": "Analyze amendments",
  "生成整改任务": "Create remediation tasks",
  "运行封装检查": "Run package checks",
  "生成风险摘要": "Generate risk summary",
  "提交人工审批": "Submit for human approval",
  "已上传文件": "Uploaded files",
  "全部有效要求": "All active requirements",
  "未满足要求": "Unsatisfied requirements",
  "当前文件版本": "Current file version",
  "最新公告": "Latest amendment",
  "已确认问题": "Confirmed issues",
  "预览包": "Preview package",
  "当前快照": "Current snapshot",
  "待审批输出": "Outputs awaiting approval",
  "只生成结果": "Generate results only",
  "修改状态": "Changes state",
  "需确认": "Confirmation required",
  "运行": "Run",
  "Agent 动作详情": "Agent action details",
  "关闭动作详情": "Close action details",
  "执行范围": "Scope",
  "使用数据": "Data used",
  "状态影响": "State impact",
  "运行来源": "Run source",
  "会创建或提交业务记录": "Creates or submits business records",
  "只生成候选或检查结果": "Creates candidates or check results only",
  "高风险动作必须说明理由并二次确认":
    "High-risk actions require a reason and a second confirmation",
  "执行理由": "Reason for running",
  "至少输入 6 个字符，写入审计上下文": "Enter at least 6 characters for the audit context",
  "我已核验范围、来源与状态影响": "I verified the scope, source, and state impact",
  "确认并运行演示": "Confirm and run demo",
  "运行确定性演示": "Run deterministic demo",
  "进入 Agent 运行中心": "Open Agent run center",
  "演示不会做法律资格判断、CA 签名、保证金支付或外部提交。":
    "The demo does not make legal qualification decisions, sign with a CA certificate, pay guarantees, or submit externally.",
  "生成结构化要求候选，低置信度自动进入人工复核。":
    "Create structured requirement candidates and route low-confidence items to human review.",
  "按确定性规则与候选提取重新形成否决项队列。":
    "Rebuild the disqualification queue from deterministic rules and extracted candidates.",
  "推荐可解释候选，不会自动接受证据匹配。":
    "Suggest explainable candidates without automatically accepting evidence matches.",
  "对金额、主体、日期、人员与承诺执行确定性比较。":
    "Compare amounts, entities, dates, people, and commitments with deterministic rules.",
  "识别公告差异并输出影响关系，等待人工应用。":
    "Identify amendment changes and their impact, then wait for human application.",
  "把已确认问题映射为负责人、期限和复核人。":
    "Map confirmed issues to an owner, deadline, and reviewer.",
  "检查缺件、证书时效、命名、元数据与一致性。":
    "Check missing files, certificate validity, naming, metadata, and consistency.",
  "汇总可回溯风险、负责人和下游影响。":
    "Summarize traceable risks, owners, and downstream impact.",
  "将需要暂停交付的结论提交给指定角色复核。":
    "Submit conclusions that pause delivery to the designated reviewer.",
  "文件版本、页码、段落与解析日志": "File versions, pages, paragraphs, and parsing logs",
  "要求原文、规则版本、当前证据": "Source requirements, rule versions, and current evidence",
  "企业材料 Claim、主体、有效期与要求": "Evidence claims, entities, validity, and requirements",
  "结构化字段、来源页与规则集": "Structured fields, source pages, and rule sets",
  "招标版本、公告版本、要求与任务": "Tender versions, amendment versions, requirements, and tasks",
  "风险、负责人目录、项目截止时间": "Risks, owner directory, and project deadline",
  "受控文件树与封装规则": "Controlled file tree and packaging rules",
  "要求、证据、任务、封装结果与审计": "Requirements, evidence, tasks, package results, and audit",
  "来源证据、影响、可逆性与理由": "Source evidence, impact, reversibility, and rationale",
  "结果已生成到 Agent Drawer，但未写入后端；来源、规则版本与人工门禁均保留在演示运行记录中。":
    "Results were generated in the Agent Drawer but not written to the backend. Sources, rule versions, and human gates remain in the demo run record.",
  "确定性演示 · 未持久化": "Deterministic demo · Not persisted",
  "选择": "Select",
  "打开结果": "Open result",
  "文件接收": "File intake",
  "要求审阅": "Requirement review",
  "材料复核": "Evidence review",
  "响应编制": "Response writing",
  "交付检查": "Delivery review",
  "管理员": "Administrator",
  "投标经理": "Bid manager",
  "复核人员": "Reviewer",
  "搜索项目、条款、材料或动作": "Search projects, clauses, evidence, or actions",
  "演示会话": "Demo session",
  "API 会话": "API session",
  "源代码与许可证 · AGPL-3.0": "Source and license · AGPL-3.0",
  "退出当前会话": "Sign out",
  "退出当前会话？": "Sign out?",
  "确认退出": "Sign out",
  "将退出 {name} 的当前会话，未提交的页面输入可能丢失。":
    "This will sign out {name}. Unsaved page input may be lost.",
  "English": "English",
  "中文": "中文",
  "界面语言": "Interface language",
  "项目基本信息": "Project details",
  "新建投标项目": "New bid project",
  "录入项目资料，整理招标文件包，然后启动要求提取。":
    "Enter the project details, assemble the tender files, then start requirement extraction.",
  "项目名称": "Project name",
  "项目编号": "Project code",
  "采购人": "Buyer",
  "截止日期": "Deadline",
  "输入项目名称": "Enter a project name",
  "可留空，系统将从文件提取": "Optional — extracted from the files when available",
  "招标文件包": "Tender files",
  "添加文件": "Add files",
  "尚未添加文件。使用右上角“添加文件”选择完整招标包。":
    "No files yet. Use “Add files” to select the complete tender package.",
  "文件名": "File name",
  "文档用途": "Document role",
  "格式 / 大小": "Format / size",
  "操作": "Actions",
  "招标主文件": "Main tender",
  "招标附件": "Tender appendix",
  "答疑 / 澄清": "Q&A / clarification",
  "更正 / 补遗": "Amendment",
  "支持 PDF、DOCX、XLSX。第一份文件默认标记为招标主文件，可在表格中调整。":
    "Supports PDF, DOCX, and XLSX. The first file is marked as the main tender by default and can be changed in the table.",
  "创建并开始分析": "Create and analyze",
  "正在处理文件": "Processing files",
  "上传中": "Uploading",
  "上传失败": "Upload failed",
  "重试失败文件": "Retry failed files",
  "继续要求提取": "Continue extraction",
  "至少添加一份招标主文件": "Add at least one main tender file",
  "项目名称为必填项，其余信息可在文件解析后补充。":
    "Project name is required. Other details can be added after parsing.",
  "部分文件上传失败。已成功的文件不会重复上传，请重试失败文件。":
    "Some files failed to upload. Successful files will not be uploaded again; retry only the failed files.",
  "文件上传失败，请重试。": "File upload failed. Try again.",
  "创建项目或启动分析失败，请检查本地服务后重试。":
    "Could not create the project or start analysis. Check the local service and try again.",
  "必填": "Required",
  "按文档类型筛选": "Filter by document type",
  "演示模式不会写入后端。": "Demo mode does not write to the backend.",
  "合规工作区": "Compliance workspace",
  "逐条核对招标要求、原文与企业证据": "Review requirements, source text, and company evidence",
  "资格资质": "Qualifications",
  "商务条件": "Commercial terms",
  "技术要求": "Technical requirements",
  "报价要求": "Pricing",
  "交付计划": "Delivery",
  "服务保障": "Service",
  "人员要求": "Personnel",
  "案例业绩": "References",
  "法律与授权": "Legal and authorization",
  "安全要求": "Security",
  "文件格式": "File format",
  "签章要求": "Signatures and seals",
  "递交要求": "Submission",
  "其他要求": "Other",
  "合规矩阵": "Compliance matrix",
  "三栏审阅": "Three-panel review",
  "合规审阅统计": "Compliance summary",
  "合规工作台视图": "Compliance workspace view",
  "矩阵聚焦": "Matrix focus",
  "来源聚焦": "Source focus",
  "保存视图": "Save view",
  "· 来自当前矩阵的高风险且未满足/待复核要求。":
    "· High-risk requirements from the current matrix that are not satisfied or still need review.",
  "{count} 项高优先级待处理": "{count} high-priority items to review",
  "项高优先级待处理": "high-priority items to review",
  "{version} · 86 页 · 已解析": "{version} · 86 pages · Parsed",
  "86 页": "86 pages",
  "页 · 已解析": "pages · Parsed",
  "第 {page} 页 · {clause}": "Page {page} · {clause}",
  "第 {page} 页": "Page {page}",
  "{visible} / {total} 条要求 · 已选 {selected}":
    "{visible} / {total} requirements · {selected} selected",
  "{count} 条低置信度已路由人工": "{count} low-confidence items routed to human review",
  "条低置信度已路由人工": "low-confidence items routed to human review",
  "已加载全部 {count} 条": "All {count} items loaded",
  "已加载全部": "All",
  "条": "items",
  "总览": "Overview",
  "要求详情": "Requirement details",
  "要求来源": "Requirement source",
  "要求与来源": "Requirement and source",
  "要求与依据": "Requirement and evidence",
  "招标原文": "Tender source text",
  "原始文档查看器": "Source document viewer",
  "文档查看控制": "Document controls",
  "上一页": "Previous page",
  "下一页": "Next page",
  "缩小文档": "Zoom out",
  "放大文档": "Zoom in",
  "重置文档缩放": "Reset zoom",
  "页码": "Page",
  "BidEvidence 文档定位预览": "BidEvidence source preview",
  "演示来源 · 未请求真实文件 · V1.0 · 2.1.4":
    "Demo source · Original file not requested · V1.0 · 2.1.4",
  "演示模式不伪造原始版式；请以来源文件为准。":
    "Demo mode does not recreate the original layout. Refer to the source file.",
  "正在加载第 {page} 页…": "Loading page {page}…",
  "{name} 第 {page} 页": "{name} · Page {page}",
  "缩放 {zoom}%": "{zoom}% zoom",
  "来源预览": "Source preview",
  "打开来源并定位原文": "Open source at the cited location",
  "来源文档": "Source document",
  "来源页": "Source page",
  "条款号": "Clause",
  "编号": "ID",
  "编号 / 要求": "ID / requirement",
  "标题": "Title",
  "类别": "Category",
  "强制性": "Mandatory",
  "强制": "Mandatory",
  "否决风险": "Disqualification risk",
  "否决候选": "Disqualification candidate",
  "判断": "Decision",
  "判断理由": "Decision reason",
  "判断置信度": "Decision confidence",
  "期望证明材料": "Expected evidence",
  "规则线索": "Rule hints",
  "证据匹配": "Evidence matching",
  "证据": "Evidence",
  "已接受证据": "Accepted evidence",
  "已接纳证据": "Accepted evidence",
  "推荐证据": "Suggested evidence",
  "接受证据": "Accept evidence",
  "拒绝推荐": "Reject suggestion",
  "拒绝推荐证据": "Reject suggested evidence",
  "拒绝原因": "Rejection reason",
  "更换证据": "Replace evidence",
  "查看了来源页和推荐证据。": "Reviewed the source page and suggested evidence.",
  "证据接受决定已记录。": "Evidence decision recorded.",
  "候选证据均已完成人工决定": "All suggested evidence has a human decision",
  "仅展示已接受的来源证据": "Show accepted source evidence only",
  "搜索编号、标题、原文": "Search ID, title, or source text",
  "搜索要求": "Search requirements",
  "筛选要求": "Filter requirements",
  "按状态筛选": "Filter by status",
  "按优先级筛选": "Filter by priority",
  "仅看否决项": "Disqualification risks only",
  "全部": "All",
  "全部状态": "All statuses",
  "全部要求": "All requirements",
  "全部类型": "All types",
  "清除": "Clear",
  "清除筛选": "Clear filters",
  "导出矩阵": "Export matrix",
  "应用结构": "Apply structure",
  "否决项": "Disqualification risks",
  "强制条款": "Mandatory clauses",
  "状态": "Status",
  "↑↓ 选择 · Enter 打开": "↑↓ select · Enter open",
  "活动": "Activity",
  "标准化要求": "Normalized requirement",
  "提取置信度": "Extraction confidence",
  "置信度": "Confidence",
  "批量操作": "Bulk actions",
  "批量分配负责人": "Assign owners",
  "选择全部可见要求": "Select all visible requirements",
  "清除选择": "Clear selection",
  "请先勾选至少一条要求。": "Select at least one requirement.",
  "导出当前清单": "Export current list",
  "人工复核": "Human review",
  "待人工复核": "Needs human review",
  "待人工确认": "Needs human confirmation",
  "待人工验证": "Needs human verification",
  "待复核": "Needs review",
  "待确认": "Needs confirmation",
  "待处理": "To do",
  "待补充": "Needs information",
  "待上传": "Awaiting upload",
  "已确认": "Confirmed",
  "已满足": "Satisfied",
  "已批准": "Approved",
  "已完成": "Completed",
  "已通过": "Passed",
  "已核验": "Verified",
  "已人工验证": "Human verified",
  "已就绪": "Ready",
  "已上传": "Uploaded",
  "已过期": "Expired",
  "当前有效": "Valid",
  "草稿": "Draft",
  "草稿待编辑": "Draft — edit required",
  "进行中": "In progress",
  "未开始": "Not started",
  "未分配": "Unassigned",
  "不满足": "Not satisfied",
  "不适用": "Not applicable",
  "存在冲突": "Conflict found",
  "缺材料": "Missing evidence",
  "缺少材料": "Missing evidence",
  "缺少证据": "Missing evidence",
  "缺件": "Missing file",
  "阻塞": "Blocked",
  "警告": "Warning",
  "通过": "Passed",
  "完整": "Complete",
  "高": "High",
  "中": "Medium",
  "低": "Low",
  "一般": "Normal",
  "紧急": "Urgent",
  "是 · 强制": "Yes · mandatory",
  "是 · 需重点确认": "Yes · review closely",
  "否 · 一般": "No · normal",
  "材料复核概况": "Evidence overview",
  "集中查看材料状态、有效期、Claims 与项目使用记录。":
    "Review evidence status, validity, claims, and project usage in one place.",
  "集中复核材料的有效性、来源与项目使用记录。":
    "Review evidence validity, sources, and project usage in one place.",
  "类型": "Type",
  "主体资质": "Legal entity credentials",
  "管理体系认证": "Management system certification",
  "人员能力": "Personnel qualifications",
  "项目业绩": "Project references",
  "份材料": "evidence files",
  "份待验证": "pending verification",
  "份有风险": "at risk",
  "个 Claims": "claims",
  "个结构化 Claims": "structured claims",
  "最近复核": "Last reviewed",
  "材料筛选": "Evidence filters",
  "材料列表": "Evidence list",
  "材料详情": "Evidence details",
  "材料复核详情": "Evidence review details",
  "材料名称": "Evidence name",
  "材料类型筛选": "Filter by evidence type",
  "材料状态筛选": "Filter by evidence status",
  "搜索企业材料": "Search company evidence",
  "搜索文件、标签、主体或负责人": "Search files, tags, entities, or owners",
  "主体": "Entity",
  "主体 / 部门": "Entity / department",
  "材料": "Evidence",
  "材料清单": "Evidence list",
  "有效期": "Valid through",
  "验证状态": "Verification",
  "使用项目": "Used by projects",
  "使用 / Claims": "Usage / claims",
  "当前版本": "Current version",
  "版本": "Version",
  "版本历史": "Version history",
  "当前没有可复核的企业材料": "No company evidence to review",
  "企业材料数据暂时不可用": "Company evidence is temporarily unavailable",
  "未能读取企业材料，当前页面不会显示替代数据。":
    "Could not load company evidence. This page will not substitute demo data.",
  "从材料清单中选择条目后查看复核信息。":
    "Select an item from the evidence list to review its details.",
  "选择一份材料，核对是否适合当前投标使用。":
    "Select evidence and confirm whether it is suitable for this bid.",
  "当前材料没有可用于判断的 Claim 数据。": "This evidence has no claim data available for review.",
  "尚无结构化 Claim": "No structured claims",
  "材料复用提示": "Reuse guidance",
  "信息已验证，可作为候选材料": "Verified — suitable as candidate evidence",
  "引用情况": "References",
  "保留来源页与置信度": "Keeps source pages and confidence",
  "企业名称": "Company name",
  "统一社会信用代码": "Unified social credit code",
  "成立日期": "Established",
  "法定代表人": "Legal representative",
  "长期": "Long-term",
  "已过期，不应直接复用": "Expired — do not reuse directly",
  "可查看来源与使用记录，但不能仅凭当前状态判断可复用。":
    "Source and usage history are available, but current status alone is not enough to approve reuse.",
  "请继续结合当前招标要求核对适用范围与有效期。":
    "Check scope and validity against the current tender requirements.",
  "标书编制工作台": "Response workspace",
  "投标响应工作台": "Response workspace",
  "从要求原文和已接纳证据开始，形成可供人工编辑与批准的逐节草稿。":
    "Draft each section from the source requirement and accepted evidence, then edit and approve it manually.",
  "项目大纲": "Project outline",
  "大纲": "Outline",
  "投标响应": "Bid responses",
  "响应列表": "Response list",
  "响应正文": "Response text",
  "投标响应正文": "Bid response text",
  "投标响应内容": "Bid response content",
  "响应草稿": "Response draft",
  "响应状态筛选": "Filter by response status",
  "响应状态统计": "Response status",
  "检索响应条目": "Search responses",
  "复核响应": "Review response",
  "复核模式": "Review mode",
  "键盘复核已开启": "Keyboard review enabled",
  "上一条": "Previous",
  "下一条": "Next",
  "保存并复核": "Save for review",
  "批准响应": "Approve response",
  "修改／复核意见（必填）": "Change / review note (required)",
  "有未保存修改": "Unsaved changes",
  "正在保存响应": "Saving response",
  "正在批准响应": "Approving response",
  "响应草稿已保存": "Response draft saved",
  "响应已批准": "Response approved",
  "尚无响应草稿": "No response draft",
  "没有匹配的响应条目": "No matching responses",
  "投标响应 API 数据不可用": "Response API data unavailable",
  "先核对投标要求与证据材料": "Review requirements and evidence first",
  "要求确认、来源定位和证据接纳完成后，系统才会生成可复核的响应草稿。":
    "A reviewable response draft is created only after the requirement, source, and evidence have been confirmed.",
  "没有可展示的已接受证据。请先在合规矩阵中核对并接纳材料；暂定匹配不会在这里冒充已接受证据。":
    "No accepted evidence to show. Review and accept evidence in the compliance matrix first; tentative matches are not shown as accepted.",
  "该条响应尚有缺少材料，补齐并保存后才可批准。":
    "This response is missing evidence. Add it and save before approval.",
  "正文有未保存修改，请先保存并复核，再批准当前版本。":
    "The response has unsaved changes. Save it for review before approving this version.",
  "响应内容未变化": "No content changes",
  "仅记录人工批准事件": "Approval event only",
  "所选版本的响应正文相同": "The selected versions have identical response text",
  "整改任务": "Remediation tasks",
  "整改任务列表": "Remediation task list",
  "任务列表": "Task list",
  "任务详情": "Task details",
  "当前任务详情": "Current task",
  "任务概况": "Task overview",
  "任务进度": "Task progress",
  "任务状态": "Task status",
  "整改任务工具栏": "Remediation toolbar",
  "任务视图": "Task view",
  "清单": "List",
  "流程视图": "Workflow view",
  "流程": "Workflow",
  "项": "items",
  "项未完成": "incomplete",
  "项待复核": "to review",
  "搜索整改任务": "Search remediation tasks",
  "搜索任务、负责人、复核人或来源": "Search tasks, owners, reviewers, or sources",
  "没有符合条件的任务": "No matching tasks",
  "暂无整改任务": "No remediation tasks",
  "暂无任务": "No tasks",
  "创建任务": "Create task",
  "新建任务": "New task",
  "新建整改任务": "New remediation task",
  "任务标题": "Task title",
  "描述可验证的整改结果": "Describe a verifiable remediation result",
  "优先级": "Priority",
  "负责人": "Owner",
  "复核人": "Reviewer",
  "负责人 → 复核人": "Owner → reviewer",
  "截止": "Due",
  "处理范围": "Scope",
  "处理要求与证据": "Requirement and evidence",
  "处理建议": "Suggested action",
  "处理步骤": "Action steps",
  "处理风险": "Risk",
  "开始处理": "Start work",
  "提交复核": "Submit for review",
  "复核并完成": "Review and complete",
  "查看任务": "View tasks",
  "返回任务列表": "Back to tasks",
  "来源": "Source",
  "整改原因": "Remediation reason",
  "任务现有记录": "Task records",
  "附件记录": "Attachments",
  "评论记录": "Comments",
  "任务已创建": "Task created",
  "任务状态已更新": "Task status updated",
  "整改任务已全部完成": "All remediation tasks are complete",
  "新任务绑定当前项目，并从“待处理”开始流转。":
    "The new task is linked to this project and starts in To do.",
  "负责人处理整改项并提交复核，复核人沿同一来源链完成确认。":
    "The owner resolves the issue and submits it; the reviewer confirms it against the same source chain.",
  "文件封装": "Package review",
  "交付包检查": "Package review",
  "核对最终文件，处理阻塞项，并在人工批准后生成交付 ZIP。":
    "Check final files, resolve blockers, and generate the delivery ZIP after human approval.",
  "当前工作包": "Current package",
  "工作包状态": "Package status",
  "交付包检查状态": "Package review status",
  "工作清单": "Checklist",
  "交付文件": "Delivery files",
  "未放置文件": "No file assigned",
  "检查结果": "Check result",
  "检查与处理": "Checks and actions",
  "筛选检查项": "Filter checks",
  "按最终目录核对": "Check against final directory",
  "导出校验清单": "Export checklist",
  "重新检查": "Run checks again",
  "检查中": "Checking",
  "正在运行封装检查": "Running package checks",
  "封装检查已完成": "Package checks complete",
  "封装检查结果刷新失败": "Could not refresh package checks",
  "预览交付包": "Preview package",
  "预览包已生成": "Preview package generated",
  "生成最终投标 ZIP": "Generate final bid ZIP",
  "生成最终 ZIP": "Generate final ZIP",
  "批准并生成 ZIP": "Approve and generate ZIP",
  "正在提交…": "Submitting…",
  "我已查看以上警告并批准生成最终包":
    "I reviewed the warnings above and approve generation of the final package",
  "批准前请填写复核意见，确保决策可追溯。":
    "Add a review note before approval so the decision remains traceable.",
  "最终包生成是人工批准操作，不代表已提交到外部平台。":
    "Generating the final package is a human approval action; it does not submit anything to an external platform.",
  "当前没有阻塞问题": "No current blockers",
  "演示项目数据": "Demo project data",
  "个问题阻止生成最终包": "issues block final package generation",
  "个待确认": "to confirm",
  "项通过": "passed",
  "规则通过率": "rule pass rate",
  "个文件": "files",
  "个封装项": "package items",
  "必要文件存在": "Required file present",
  "未找到法定代表人授权委托书": "Legal representative authorization letter not found",
  "补充签字盖章后的授权委托书 PDF": "Add the signed and sealed authorization letter PDF",
  "来源要求": "Source requirement",
  "证书有效期": "Certificate validity",
  "证书在投标截止日前已过期": "Certificate expired before the bid deadline",
  "文件命名规范": "File naming",
  "文件名包含禁止字符且缺少章节编号":
    "File name contains prohibited characters and has no section number",
  "修订与批注": "Revisions and comments",
  "检测到修订记录，需确认清理": "Tracked changes found — confirm they are removed",
  "报价一致性": "Price consistency",
  "报价与商务响应表存在 18,000 元差异": "Price differs from the commercial response by CNY 18,000",
  "PDF 可打开": "PDF readability",
  "9 个 PDF 均可正常打开且未加密": "All 9 PDFs open correctly and are not encrypted",
  "主体名称一致": "Entity name consistency",
  "已使用标准主体名称": "Standard entity name is used",
  "文件哈希": "File hashes",
  "已为 11 个文件计算 SHA256": "SHA256 calculated for 11 files",
  "完整性": "Completeness",
  "时效": "Validity",
  "命名": "Naming",
  "元数据": "Metadata",
  "内容": "Content",
  "格式": "Format",
  "全部 PDF": "All PDFs",
  "当前封装文件": "Current package files",
  "阻塞项已清除，可预览并进入人工批准": "Blockers cleared — ready for preview and human approval",
  "先处理阻塞项，再确认警告并预览交付包":
    "Resolve blockers, then confirm warnings and preview the package",
  "查看交付包": "View package",
  "查看交付包状态": "View package status",
  "最终复核": "Final review",
  "终审清单": "Final review checklist",
  "最终工作包复核": "Final package review",
  "终审清单与交付产物的汇总状态。": "A combined view of final review checks and delivery outputs.",
  "按优先级完成剩余人工检查，再提交本轮工作包复核结论。":
    "Complete the remaining human checks by priority, then submit this package review.",
  "最终复核状态": "Final review status",
  "复核进行中": "Review in progress",
  "前置复核仍在进行": "Prerequisite reviews are still in progress",
  "完成本轮复核": "Complete this review",
  "完成本轮人工复核": "Complete human review",
  "确认完成演示复核": "Confirm demo review",
  "复核说明": "Review note",
  "复核说明（必填）": "Review note (required)",
  "复核意见（必填），例如：已核对营业执照和项目经理证书原件":
    "Review note (required), e.g. checked the original business license and project manager certificate",
  "说明本轮核对范围与判断依据，然后完成当前复核请求。":
    "Describe the scope and basis of this review, then complete the current request.",
  "请填写本轮复核说明后再标记完成。":
    "Add a review note before marking this review complete.",
  "本轮暂无待处理的最终复核请求。请先按左侧清单完成前置检查。":
    "There is no final review request ready yet. Complete the prerequisite checks in the left panel first.",
  "完成前置工作后，这里会开放当前工作包的复核请求。":
    "The package review request becomes available after the prerequisite work is complete.",
  "所有终审分组均已就绪": "All final review groups are ready",
  "先处理阻断与缺失，再完成其余人工确认。":
    "Resolve blockers and missing items before completing the remaining human checks.",
  "个复核分组": "review groups",
  "项仍需人工关注": "items still need human attention",
  "个分组已就绪 · 按列表顺序回到原工作台处理":
    "groups ready · Return to each workspace in list order",
  "项已命中规则，须由人工关闭或明确处理": "rule findings require human resolution",
  "项缺少材料，": "missing evidence,",
  "项仍需核对原文": "still need source review",
  "个候选尚未形成正式证据绑定": "candidates are not yet formally linked",
  "条响应仍待人工复核": "responses still need human review",
  "项仍在待办、处理中或待复核": "items are still open, in progress, or under review",
  "个文件或目录仍有缺失/警告": "files or folders still have missing items or warnings",
  "个文件已进入当前目录": "files are in the current directory",
  "项可从原工作台查看": "items available in their source workspaces",
  "核对要求": "Review requirements",
  "复核证据": "Review evidence",
  "关联产物": "Related outputs",
  "可提交结论": "Ready to submit",
  "提交人工结论": "Submit human decision",
  "仅提交当前待处理的最终工作包复核请求。":
    "Submit only the current pending final package review request.",
  "返回项目": "Back to project",
  "返回正文与复核": "Back to response and review",
  "前往要求与证据核对": "Review requirements and evidence",
  "继续人工复核": "Continue human review",
  "继续检查": "Continue checking",
  "下一步": "Next step",
  "关闭": "Close",
  "取消": "Cancel",
  "确认": "Confirm",
  "保存": "Save",
  "复制": "Copy",
  "展开当前答案": "Expand answer",
  "收起答案": "Collapse answer",
  "重试": "Retry",
  "重试中": "Retrying",
  "重新打开": "Open again",
  "操作已完成": "Action complete",
  "操作未完成": "Action not completed",
  "API 数据不可用": "API data unavailable",
  "部分复核数据不可用": "Some review data is unavailable",
  "未知错误": "Unknown error",
};

const countPatterns: Array<[RegExp, string]> = [
  [/^(\d+) 条要求$/, "$1 requirements"],
  [/^(\d+) 条响应$/, "$1 responses"],
  [/^(\d+) 个文件$/, "$1 files"],
  [/^(\d+) 个项目$/, "$1 projects"],
  [/^(\d+) 个章节$/, "$1 sections"],
  [/^(\d+) 个封装项$/, "$1 package items"],
  [/^(\d+) 个阻塞问题$/, "$1 blockers"],
  [/^(\d+) 个 Claims$/, "$1 claims"],
  [/^(\d+) 个结构化 Claims$/, "$1 structured claims"],
  [/^(\d+) 个可追溯引用$/, "$1 traceable references"],
  [/^(\d+) 项待复核$/, "$1 items to review"],
  [/^(\d+) 项未完成$/, "$1 incomplete items"],
  [/^(\d+) 项$/, "$1 items"],
  [/^(\d+) 条$/, "$1 items"],
  [/^共 (\d+) 个项目$/, "$1 projects"],
  [/^(\d+) 天 (\d+) 小时$/, "$1d $2h"],
  [/^第 (\d+) 页$/, "Page $1"],
  [/^第 (\d+)–(\d+) 页$/, "Pages $1–$2"],
  [/^第 (\d+) 页 · (.+)$/, "Page $1 · $2"],
  [/^共 (\d+) 页$/, "$1 pages"],
  [/^(.+) · (\d+) 页 · 已解析$/, "$1 · $2 pages · Parsed"],
  [/^\/ 共 (\d+) 页$/, "/ $1 pages"],
  [/^缩放 (\d+)%$/, "Zoom $1%"],
  [/^(\d+) \/ (\d+) 条要求 · 已选 (\d+)$/, "$1 / $2 requirements · $3 selected"],
  [/^(\d+) 条低置信度已路由人工$/, "$1 low-confidence items routed to human review"],
  [/^(\d+) 项高优先级待处理$/, "$1 high-priority items to review"],
  [/^已加载全部 (\d+) 条$/, "All $1 items loaded"],
  [/^选择 (.+)$/, "Select $1"],
  [/^完成度 (\d+)%$/, "$1% complete"],
  [/^打开 (.+)$/, "Open $1"],
  [/^通知（(\d+) 条未读）$/, "Notifications ($1 unread)"],
  [/^今天 (.+)$/, "Today $1"],
  [/^昨天 (.+)$/, "Yesterday $1"],
  [/^已过期 (\d+) 天$/, "Expired $1 days"],
  [/^置信度 (\d+)%$/, "$1% confidence"],
  [/^可证明：(.+)$/, "Supports: $1"],
  [/^(\d{4})年(\d{1,2})月(\d{1,2})日星期. · 项目、任务、审计与 Agent 运行汇总$/, "$1-$2-$3 · Projects, tasks, audit, and Agent runs"],
  [/^(\d+) 个人工门禁、(\d+) 项未完成任务、(\d+) 项封装阻塞。$/, "$1 human gates, $2 incomplete tasks, and $3 package blockers."],
  [/^(.+) 第 (\d+) 页$/, "$1 · Page $2"],
  [/^(\d+) 个问题阻止生成最终包$/, "$1 issues block final package generation"],
  [/^(\d+) 个待确认 · (\d+) 项通过 · 规则通过率 (\d+)%$/, "$1 to confirm · $2 passed · $3% rule pass rate"],
  [/^处理完 (\d+) 个阻塞问题后才能生成最终包$/, "Resolve $1 blockers before generating the final package"],
  [/^(\d+) 项仍需人工关注$/, "$1 items still need human attention"],
  [/^(\d+)\/(\d+) 个分组已就绪 · 按列表顺序回到原工作台处理$/, "$1/$2 groups ready · Return to each workspace in list order"],
  [/^(\d+) 项已命中规则，须由人工关闭或明确处理$/, "$1 rule findings require human resolution"],
  [/^(\d+) 项缺少材料，(\d+) 项仍需核对原文$/, "$1 missing evidence · $2 still need source review"],
  [/^(\d+) 个候选尚未形成正式证据绑定$/, "$1 candidates are not yet formally linked"],
  [/^(\d+) 条响应仍待人工复核$/, "$1 responses still need human review"],
  [/^(\d+) 项仍在待办、处理中或待复核$/, "$1 items are still open, in progress, or under review"],
  [/^(\d+) 个文件或目录仍有缺失\/警告$/, "$1 files or folders still have missing items or warnings"],
  [/^(\d+) 个文件已进入当前目录$/, "$1 files are in the current directory"],
  [/^(\d+) 项可从原工作台查看$/, "$1 items available in their source workspaces"],
  [/^(\d+) 条记录$/, "$1 records"],
  [/^(\d+) 分钟前$/, "$1 minutes ago"],
  [/^(\d+) 小时前$/, "$1 hours ago"],
];

function translateExact(value: string): string {
  if (Object.prototype.hasOwnProperty.call(englishCopy, value)) return englishCopy[value];
  for (const [pattern, replacement] of countPatterns) {
    if (pattern.test(value)) return value.replace(pattern, replacement);
  }
  if (value.includes(" · ")) {
    return value.split(" · ").map((part) => translateExact(part)).join(" · ");
  }
  if (value.includes(" / ")) {
    return value.split(" / ").map((part) => translateExact(part)).join(" / ");
  }
  return value;
}

export function translateUiText(value: string, locale: AppLocale) {
  if (locale === "zh") return value;
  const leading = value.match(/^\s*/)?.[0] ?? "";
  const trailing = value.match(/\s*$/)?.[0] ?? "";
  const content = value.slice(leading.length, value.length - trailing.length);
  return `${leading}${translateExact(content)}${trailing}`;
}

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (value: string, params?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);
const interpolate = (value: string, params?: Record<string, string | number>) => {
  let result = value;
  for (const [key, replacement] of Object.entries(params ?? {})) {
    result = result.replaceAll(`{${key}}`, String(replacement));
  }
  return result;
};
const fallbackLocaleContext: LocaleContextValue = {
  locale: "zh",
  setLocale: () => undefined,
  t: (value, params) => interpolate(value, params),
};

const originalText = new WeakMap<Text, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const translatedAttributes = ["aria-label", "placeholder", "title"] as const;

function isPreserved(node: Node) {
  const element = node instanceof Element ? node : node.parentElement;
  return Boolean(element?.closest("[data-preserve-language], script, style, code, pre"));
}

function translateTextNode(node: Text, locale: AppLocale) {
  if (isPreserved(node)) return;
  const current = node.nodeValue ?? "";
  const stored = originalText.get(node);
  let source = stored ?? current;
  if (
    stored !== undefined
    && current !== stored
    && current !== translateUiText(stored, "en")
    && current !== translateUiText(stored, "zh")
  ) {
    source = current;
  }
  originalText.set(node, source);
  const next = translateUiText(source, locale);
  if (node.nodeValue !== next) node.nodeValue = next;
}

function translateElementAttributes(element: Element, locale: AppLocale) {
  if (isPreserved(element)) return;
  let originals = originalAttributes.get(element);
  if (!originals) {
    originals = new Map<string, string>();
    originalAttributes.set(element, originals);
  }
  for (const attribute of translatedAttributes) {
    const current = element.getAttribute(attribute);
    if (current === null) continue;
    const stored = originals.get(attribute);
    let source = stored ?? current;
    if (
      stored !== undefined
      && current !== stored
      && current !== translateUiText(stored, "en")
      && current !== translateUiText(stored, "zh")
    ) {
      source = current;
    }
    originals.set(attribute, source);
    const next = translateUiText(source, locale);
    if (current !== next) element.setAttribute(attribute, next);
  }
}

function translateSubtree(root: Node, locale: AppLocale) {
  if (root instanceof Text) {
    translateTextNode(root, locale);
    return;
  }
  if (!(root instanceof Element || root instanceof Document || root instanceof DocumentFragment)) return;
  if (root instanceof Element) translateElementAttributes(root, locale);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    if (current instanceof Text) translateTextNode(current, locale);
    else if (current instanceof Element) translateElementAttributes(current, locale);
    current = walker.nextNode();
  }
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>("en");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved !== "zh" && saved !== "en") return;
    let active = true;
    queueMicrotask(() => {
      if (active) setLocaleState(saved);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale === "en" ? "en" : "zh-CN";
    document.documentElement.dataset.locale = locale;

    const root = document.body;
    const apply = () => {
      observer?.disconnect();
      translateSubtree(root, locale);
      observer?.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: [...translatedAttributes],
      });
    };
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.type === "characterData" && record.target instanceof Text) {
          originalText.delete(record.target);
        }
        if (record.type === "attributes" && record.target instanceof Element && record.attributeName) {
          originalAttributes.get(record.target)?.delete(record.attributeName);
        }
      }
      apply();
    });
    apply();
    return () => observer.disconnect();
  }, [locale]);

  const setLocale = useCallback((next: AppLocale) => {
    window.localStorage.setItem(STORAGE_KEY, next);
    setLocaleState(next);
  }, []);

  const t = useCallback(
    (value: string, params?: Record<string, string | number>) =>
      interpolate(translateUiText(value, locale), params),
    [locale],
  );

  const context = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
  return <LocaleContext.Provider value={context}>{children}</LocaleContext.Provider>;
}

export function useI18n() {
  const context = useContext(LocaleContext);
  return context ?? fallbackLocaleContext;
}
