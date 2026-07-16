import type { Amendment, AuditRecord, ConsistencyIssue, EvidenceAsset, EvidenceMatchGroup, PackageCheck, PackageNode, RemediationTask } from "./types";

export const evidenceAssets: EvidenceAsset[] = [
  { id: "ev-licence", name: "营业执照.pdf", type: "主体资质", legalEntity: "上海智园数字科技有限公司", status: "verified", validUntil: "长期", expiryDays: 9999, claimCount: 4, usageCount: 12, owner: "赵一舟", department: "法务合规部", lastReviewed: "2026-07-10", tags: ["主体", "工商", "必备"], pageCount: 2, size: "1.8 MB", version: "V3", usedBy: ["智慧园区综合管理平台采购项目", "城市数据中台升级服务"], claims: [
    { id: "cl-1", label: "企业名称", value: "上海智园数字科技有限公司", proves: "合法投标主体", page: 1, confidence: .99 },
    { id: "cl-2", label: "统一社会信用代码", value: "91310000MA1ZH1A24X", proves: "主体唯一标识", page: 1, confidence: .99 },
    { id: "cl-3", label: "成立日期", value: "2016-05-18", proves: "持续经营年限", page: 1, confidence: .98 },
    { id: "cl-4", label: "法定代表人", value: "顾明远", proves: "签署授权链", page: 1, confidence: .96 },
  ]},
  { id: "ev-iso27001", name: "ISO27001证书.pdf", type: "管理体系认证", legalEntity: "上海智园数字科技有限公司", status: "expired", validUntil: "2026-06-30", expiryDays: -16, claimCount: 3, usageCount: 6, owner: "赵一舟", department: "法务合规部", lastReviewed: "2026-06-20", tags: ["ISO", "安全", "已过期"], pageCount: 2, size: "2.4 MB", version: "V2", usedBy: ["智慧园区综合管理平台采购项目"], claims: [
    { id: "cl-5", label: "证书标准", value: "ISO/IEC 27001:2022", proves: "信息安全管理体系", page: 1, confidence: .98 },
    { id: "cl-6", label: "有效期至", value: "2026-06-30", proves: "证书时效", page: 1, confidence: .99, conflict: "早于本项目投标截止日 2026-07-30" },
    { id: "cl-7", label: "认证主体", value: "上海智园数字科技有限公司", proves: "主体一致性", page: 1, confidence: .99 },
  ]},
  { id: "ev-iso9001", name: "ISO9001证书.pdf", type: "管理体系认证", legalEntity: "上海智园数字科技有限公司", status: "verified", validUntil: "2027-11-22", expiryDays: 494, claimCount: 3, usageCount: 9, owner: "赵一舟", department: "质量管理部", lastReviewed: "2026-07-02", tags: ["ISO", "质量"], pageCount: 2, size: "2.1 MB", version: "V1", usedBy: ["智慧园区综合管理平台采购项目", "政务云安全运营项目"], claims: [
    { id: "cl-8", label: "证书标准", value: "ISO 9001:2015", proves: "质量管理体系", page: 1, confidence: .99 },
    { id: "cl-9", label: "有效期至", value: "2027-11-22", proves: "证书时效", page: 1, confidence: .99 },
    { id: "cl-10", label: "认证范围", value: "软件研发及信息系统集成服务", proves: "业务覆盖范围", page: 2, confidence: .91 },
  ]},
  { id: "ev-pm", name: "项目经理证书及履历.pdf", type: "人员能力", legalEntity: "上海智园数字科技有限公司", status: "conflict", validUntil: "2028-03-14", expiryDays: 607, claimCount: 5, usageCount: 3, owner: "周扬", department: "交付中心", lastReviewed: "2026-07-12", tags: ["人员", "项目经理"], pageCount: 8, size: "5.7 MB", version: "V4", usedBy: ["智慧园区综合管理平台采购项目"], claims: [
    { id: "cl-11", label: "姓名", value: "陈知行", proves: "项目负责人身份", page: 1, confidence: .99 },
    { id: "cl-12", label: "同类经验起始日期", value: "2022-05-01", proves: "项目经验年限", page: 4, confidence: .91, conflict: "截至投标日不足 5 年" },
    { id: "cl-13", label: "PMP 证书", value: "有效", proves: "项目管理能力", page: 2, confidence: .97 },
  ]},
  { id: "ev-case-a", name: "案例合同A及验收报告.pdf", type: "项目业绩", legalEntity: "上海智园数字科技有限公司", status: "verified", validUntil: "长期", expiryDays: 9999, claimCount: 6, usageCount: 4, owner: "陈知行", department: "销售运营部", lastReviewed: "2026-07-08", tags: ["案例", "智慧园区", "已验收"], pageCount: 18, size: "12.3 MB", version: "V2", usedBy: ["智慧园区综合管理平台采购项目"], claims: [
    { id: "cl-14", label: "合同金额", value: "¥4,260,000.00", proves: "300 万以上案例", page: 3, confidence: .98 },
    { id: "cl-15", label: "验收日期", value: "2025-09-18", proves: "项目已完成", page: 16, confidence: .96 },
  ]},
  { id: "ev-case-b", name: "案例合同B.pdf", type: "项目业绩", legalEntity: "上海智园数字科技有限公司", status: "review", validUntil: "长期", expiryDays: 9999, claimCount: 4, usageCount: 2, owner: "陈知行", department: "销售运营部", lastReviewed: "2026-03-21", tags: ["案例", "缺验收"], pageCount: 12, size: "8.6 MB", version: "V1", usedBy: ["智慧园区综合管理平台采购项目"], claims: [
    { id: "cl-16", label: "合同金额", value: "¥3,680,000.00", proves: "300 万以上案例", page: 4, confidence: .97 },
    { id: "cl-17", label: "验收证明", value: "未找到", proves: "项目已完成", page: 1, confidence: .99, conflict: "证据链缺少验收报告" },
  ]},
];

export const evidenceMatchGroups: EvidenceMatchGroup[] = [
  { id: "mg-1", requirementCode: "REQ-002", requirementTitle: "ISO 27001 证书在有效期内", risk: "fatal", requirementStatus: "missing", page: 21, selectedEvidenceIds: [], candidates: [
    { id: "em-1", evidenceId: "ev-iso27001", name: "ISO27001证书.pdf", score: .96, reason: ["证书类型完全匹配", "法律主体一致", "证书已过期 16 天"], legalEntity: "上海智园数字科技有限公司", validUntil: "2026-06-30", completeness: 80, decision: "pending" },
    { id: "em-2", evidenceId: "ev-iso9001", name: "ISO9001证书.pdf", score: .42, reason: ["同属管理体系认证", "标准编号不匹配"], legalEntity: "上海智园数字科技有限公司", validUntil: "2027-11-22", completeness: 100, decision: "pending" },
  ]},
  { id: "mg-2", requirementCode: "REQ-005", requirementTitle: "提供三个同类项目案例", risk: "high", requirementStatus: "missing", page: 32, selectedEvidenceIds: ["ev-case-a"], candidates: [
    { id: "em-3", evidenceId: "ev-case-a", name: "案例合同A及验收报告.pdf", score: .94, reason: ["同类智慧园区项目", "金额 426 万元", "合同与验收证据链完整"], legalEntity: "上海智园数字科技有限公司", validUntil: "长期", completeness: 100, decision: "accepted" },
    { id: "em-4", evidenceId: "ev-case-b", name: "案例合同B.pdf", score: .82, reason: ["金额 368 万元", "缺少验收报告"], legalEntity: "上海智园数字科技有限公司", validUntil: "长期", completeness: 62, decision: "pending" },
  ]},
  { id: "mg-3", requirementCode: "REQ-004", requirementTitle: "项目负责人具有五年以上经验", risk: "high", requirementStatus: "failed", page: 35, selectedEvidenceIds: ["ev-pm"], candidates: [
    { id: "em-5", evidenceId: "ev-pm", name: "项目经理证书及履历.pdf", score: .93, reason: ["人员身份匹配", "具备 PMP 证书", "可核验经验仅 4 年 2 个月"], legalEntity: "上海智园数字科技有限公司", validUntil: "2028-03-14", completeness: 90, decision: "accepted" },
  ]},
  { id: "mg-4", requirementCode: "REQ-006", requirementTitle: "统一社会信用代码一致", risk: "high", requirementStatus: "conflict", page: 17, selectedEvidenceIds: [], candidates: [
    { id: "em-6", evidenceId: "ev-licence", name: "营业执照.pdf", score: .99, reason: ["统一社会信用代码精确匹配", "投标函主体简称存在差异"], legalEntity: "上海智园数字科技有限公司", validUntil: "长期", completeness: 100, decision: "pending" },
  ]},
];

export const consistencyIssues: ConsistencyIssue[] = [
  { id: "ci-1", field: "投标总报价", type: "amount", discoveredValues: 3, documents: 4, risk: "fatal", suggestedValue: "¥5,820,000.00", status: "open", owner: "王琳", reason: "报价表与开标一览表金额不一致", sources: [
    { id: "src-1", document: "报价表.xlsx", page: 1, value: "¥5,820,000.00", excerpt: "投标总价（含税）：人民币 5,820,000.00 元", modifiedAt: "07-16 13:42" },
    { id: "src-2", document: "商务响应表.xlsx", page: 12, value: "¥5,802,000.00", excerpt: "总报价：5,802,000 元", modifiedAt: "07-15 18:20" },
    { id: "src-3", document: "投标函.docx", page: 1, value: "伍佰捌拾贰万元整", excerpt: "我方愿以人民币伍佰捌拾贰万元整承担本项目。", modifiedAt: "07-16 10:08" },
  ]},
  { id: "ci-2", field: "投标人名称", type: "entity", discoveredValues: 2, documents: 5, risk: "high", suggestedValue: "上海智园数字科技有限公司", status: "review", owner: "赵一舟", reason: "投标函使用了缺少“数字”二字的主体名称", sources: [
    { id: "src-4", document: "营业执照.pdf", page: 1, value: "上海智园数字科技有限公司", excerpt: "名称：上海智园数字科技有限公司", modifiedAt: "长期有效" },
    { id: "src-5", document: "投标函.docx", page: 1, value: "上海智园科技有限公司", excerpt: "投标人：上海智园科技有限公司", modifiedAt: "07-16 10:08" },
  ]},
  { id: "ci-3", field: "重大故障响应时间", type: "commitment", discoveredValues: 2, documents: 2, risk: "high", suggestedValue: "30 分钟", status: "open", owner: "刘敏", reason: "服务方案承诺低于招标要求", sources: [
    { id: "src-6", document: "招标文件.pdf", page: 29, value: "30 分钟", excerpt: "重大故障须在 30 分钟内响应。", modifiedAt: "招标版本 V1" },
    { id: "src-7", document: "售后服务承诺.pdf", page: 2, value: "60 分钟", excerpt: "重大故障在 60 分钟内响应。", modifiedAt: "07-14 16:30" },
  ]},
  { id: "ci-4", field: "项目经理姓名", type: "person", discoveredValues: 2, documents: 3, risk: "medium", suggestedValue: "陈知行", status: "reasonable", owner: "周扬", reason: "旧版实施方案仍保留前任负责人", sources: [
    { id: "src-8", document: "项目经理履历.pdf", page: 1, value: "陈知行", excerpt: "拟派项目负责人：陈知行", modifiedAt: "07-12 09:00" },
    { id: "src-9", document: "实施方案_旧版.docx", page: 6, value: "周扬", excerpt: "项目总负责人：周扬", modifiedAt: "06-28 15:12" },
  ]},
];

export const amendments: Amendment[] = [{ id: "am-1", name: "补充公告01.pdf", publishedAt: "2026-07-15 09:00", receivedAt: "2026-07-15 09:18", version: "公告 V1", status: "review", changeCount: 3, highImpactCount: 2, changes: [
  { id: "chg-1", type: "modified", clause: "投标截止时间", before: "2026 年 7 月 26 日 09:30", after: "2026 年 7 月 30 日 09:30", impact: "high", affectedRequirements: ["REQ-019 投标有效期"], affectedEvidence: [], affectedTasks: ["TASK-006 封装终审"], affectsPrice: false, needsApproval: true, status: "applied" },
  { id: "chg-2", type: "modified", clause: "6.3.4 数据采集性能", before: "数据采集并发量不低于每秒 5,000 条", after: "数据采集并发量不低于每秒 8,000 条", impact: "high", affectedRequirements: ["REQ-020 数据采集并发量"], affectedEvidence: ["技术响应文件.docx"], affectedTasks: ["TASK-004 更新性能参数"], affectsPrice: true, needsApproval: true, status: "pending" },
  { id: "chg-3", type: "added", clause: "4.2.8 安全资质", before: "（无）", after: "投标人须提供有效的信息技术服务管理体系认证证书。", impact: "medium", affectedRequirements: ["新增要求：ISO 20000"], affectedEvidence: ["材料库尚无匹配证书"], affectedTasks: [], affectsPrice: false, needsApproval: false, status: "pending" },
]}];

export const remediationTasks: RemediationTask[] = [
  { id: "TASK-001", title: "统一四份文件中的投标总报价", priority: "critical", status: "in_progress", owner: "王琳", reviewer: "刘敏", dueDate: "2026-07-18", sourceType: "consistency", sourceLabel: "投标总报价不一致 · CI-001", reason: "报价表、商务响应表与投标函金额不一致", evidence: "报价表.xlsx 第 1 页", steps: ["确认最终含税报价", "更新商务响应表", "核对大写金额", "二人交叉复核"], attachments: 2, comments: 4 },
  { id: "TASK-002", title: "补充有效 ISO 27001 续证证明", priority: "critical", status: "review", owner: "赵一舟", reviewer: "吴法务", dueDate: "2026-07-19", sourceType: "disqualification", sourceLabel: "ISO 27001 已过期 · DQ-002", reason: "当前证书早于投标截止日 30 天失效", evidence: "ISO27001证书.pdf 第 1 页", steps: ["获取续证受理证明", "核验发证机构", "上传材料库", "法务确认"], attachments: 1, comments: 3 },
  { id: "TASK-003", title: "修正投标函法律主体名称", priority: "high", status: "todo", owner: "赵一舟", reviewer: "刘敏", dueDate: "2026-07-18", sourceType: "consistency", sourceLabel: "主体名称不一致 · CI-002", reason: "投标函缺少“数字”二字", evidence: "营业执照.pdf 第 1 页", steps: ["替换主体全称", "检查统一社会信用代码", "重新生成 PDF"], attachments: 0, comments: 1 },
  { id: "TASK-004", title: "应用补充公告的 8,000 条/秒参数", priority: "high", status: "in_progress", owner: "周扬", reviewer: "陈知行", dueDate: "2026-07-22", sourceType: "amendment", sourceLabel: "补充公告01 · 6.3.4", reason: "当前技术响应仍为每秒 5,000 条", evidence: "补充公告01.pdf 第 3 页", steps: ["评估架构影响", "更新技术参数表", "更新性能测试承诺"], attachments: 1, comments: 2 },
  { id: "TASK-005", title: "补齐案例合同 B 的验收报告", priority: "medium", status: "todo", owner: "陈知行", reviewer: "刘敏", dueDate: "2026-07-21", sourceType: "requirement", sourceLabel: "REQ-005 三个同类案例", reason: "合同证据链缺少验收报告", evidence: "案例合同B.pdf 第 4 页", steps: ["联系项目归档人", "取得盖章验收件", "关联到案例 Claim"], attachments: 0, comments: 0 },
  { id: "TASK-006", title: "补充法定代表人授权委托书", priority: "critical", status: "todo", owner: "刘敏", reviewer: "吴法务", dueDate: "2026-07-24", sourceType: "package", sourceLabel: "封装缺件 · PKG-003", reason: "最终文件树缺少签字授权书", evidence: "封装检查 03_授权委托书", steps: ["生成授权书", "法定代表人签字", "加盖公章", "扫描并归档"], attachments: 0, comments: 2 },
  { id: "TASK-007", title: "清理技术响应文件修订记录", priority: "medium", status: "done", owner: "周扬", reviewer: "刘敏", dueDate: "2026-07-16", sourceType: "package", sourceLabel: "文件元数据检查 · PKG-011", reason: "DOCX 检测到 17 条修订记录", evidence: "技术响应文件.docx", steps: ["接受所有修订", "删除批注", "重新导出 PDF"], attachments: 1, comments: 2 },
];

export const packageTree: PackageNode[] = [
  { id: "pkg-1", name: "01_投标函", type: "folder", status: "valid", children: [{ id: "file-1", name: "01_投标函.pdf", type: "file", status: "valid", size: "1.2 MB", version: "V6" }] },
  { id: "pkg-2", name: "02_法定代表人身份证明", type: "folder", status: "valid", children: [{ id: "file-2", name: "02_法定代表人身份证明.pdf", type: "file", status: "valid", size: "2.8 MB", version: "V2" }] },
  { id: "pkg-3", name: "03_授权委托书", type: "folder", status: "missing", children: [] },
  { id: "pkg-4", name: "04_资格证明", type: "folder", status: "warning", children: [{ id: "file-3", name: "04-01_营业执照.pdf", type: "file", status: "valid", size: "1.8 MB", version: "V3" }, { id: "file-4", name: "ISO27001证书_旧.pdf", type: "file", status: "warning", size: "2.4 MB", version: "V2" }] },
  { id: "pkg-5", name: "05_商务响应", type: "folder", status: "valid", children: [{ id: "file-5", name: "05_商务响应.pdf", type: "file", status: "valid", size: "8.7 MB", version: "V8" }] },
  { id: "pkg-6", name: "06_技术响应", type: "folder", status: "warning", children: [{ id: "file-6", name: "技术响应文件-最终版!!.docx", type: "file", status: "warning", size: "28.4 MB", version: "V12" }] },
  { id: "pkg-7", name: "07_报价文件", type: "folder", status: "warning", children: [{ id: "file-7", name: "07_报价表.xlsx", type: "file", status: "warning", size: "0.9 MB", version: "V4" }] },
];

export const packageChecks: PackageCheck[] = [
  { id: "pc-1", label: "必要文件存在", category: "完整性", status: "failed", file: "03_授权委托书", message: "未找到法定代表人授权委托书", suggestion: "补充签字盖章后的授权委托书 PDF", sourceRequirement: "招标文件 3.1.3 · 第 14 页", humanConfirmed: false },
  { id: "pc-2", label: "证书有效期", category: "时效", status: "failed", file: "ISO27001证书_旧.pdf", message: "证书在投标截止日前已过期", suggestion: "替换为有效证书或续证受理证明", sourceRequirement: "招标文件 4.2.3 · 第 21 页", humanConfirmed: false },
  { id: "pc-3", label: "文件命名规范", category: "命名", status: "warning", file: "技术响应文件-最终版!!.docx", message: "文件名包含禁止字符且缺少章节编号", suggestion: "重命名为 06_技术响应文件.docx", sourceRequirement: "招标文件 8.1.2 · 第 78 页", humanConfirmed: false },
  { id: "pc-4", label: "修订与批注", category: "元数据", status: "warning", file: "技术响应文件-最终版!!.docx", message: "检测到修订记录，需确认清理", suggestion: "接受全部修订并删除批注后重新生成", sourceRequirement: "内部封装规则 PKG-META-02", humanConfirmed: true },
  { id: "pc-5", label: "报价一致性", category: "内容", status: "warning", file: "07_报价表.xlsx", message: "报价与商务响应表存在 18,000 元差异", suggestion: "确认标准值并重新运行一致性检查", sourceRequirement: "招标文件 2.1.4 · 第 8 页", humanConfirmed: false },
  { id: "pc-6", label: "PDF 可打开", category: "格式", status: "passed", file: "全部 PDF", message: "9 个 PDF 均可正常打开且未加密", suggestion: "无需操作", sourceRequirement: "内部封装规则 PKG-FMT-01", humanConfirmed: false },
  { id: "pc-7", label: "主体名称一致", category: "内容", status: "passed", file: "当前封装文件", message: "已使用标准主体名称", suggestion: "无需操作", sourceRequirement: "招标文件 4.1.2 · 第 17 页", humanConfirmed: false },
  { id: "pc-8", label: "文件哈希", category: "完整性", status: "passed", file: "当前封装文件", message: "已为 11 个文件计算 SHA256", suggestion: "生成最终包时重新计算", sourceRequirement: "内部封装规则 PKG-HASH-01", humanConfirmed: false },
];

export const auditRecords: AuditRecord[] = [
  { id: "au-1", actor: "刘敏", actorType: "human", timestamp: "2026-07-16 14:26:18", action: "人工确认要求", entityType: "Requirement", entityId: "REQ-001", entityLabel: "投标报价不得超过最高限价", before: "review_status: unreviewed", after: "review_status: verified", modelOrRule: "人工操作", promptVersion: "—", inputHash: "7a3f…b82c", outputHash: "c19d…4e01", humanOverride: false, reason: "已对照招标文件原文确认", risk: "high" },
  { id: "au-2", actor: "金额规则引擎", actorType: "rule", timestamp: "2026-07-16 14:18:02", action: "运行金额上限检查", entityType: "ComplianceCheck", entityId: "CHK-001", entityLabel: "报价上限检查", before: "actual: null", after: "actual: 5,860,000; result: failed", modelOrRule: "amount_upper_bound v1.3", promptVersion: "—", inputHash: "94b1…c012", outputHash: "ae31…0f94", humanOverride: false, reason: "实际报价高于最高限价 10,000 元", risk: "fatal" },
  { id: "au-3", actor: "MockLLMProvider", actorType: "agent", timestamp: "2026-07-16 14:12:47", action: "提取招标要求", entityType: "Requirement", entityId: "REQ-020", entityLabel: "补充公告技术参数", before: "—", after: "confidence: 0.69; manual_review: true", modelOrRule: "mock-bid-extractor-v1", promptVersion: "requirement_extract@1.2", inputHash: "ff20…b310", outputHash: "8c61…dd20", humanOverride: false, reason: "置信度低于 0.70，路由人工复核", risk: "high" },
  { id: "au-4", actor: "赵一舟", actorType: "human", timestamp: "2026-07-16 13:42:05", action: "上传企业材料", entityType: "EvidenceAsset", entityId: "EV-027", entityLabel: "ISO 27001 续证受理证明", before: "—", after: "status: awaiting_review", modelOrRule: "人工操作", promptVersion: "—", inputHash: "bf0e…a118", outputHash: "19aa…27d4", humanOverride: false, reason: "补充过期证书的续证证据", risk: "medium" },
  { id: "au-5", actor: "刘敏", actorType: "human", timestamp: "2026-07-16 11:35:41", action: "人工覆盖判断", entityType: "ConsistencyIssue", entityId: "CI-004", entityLabel: "旧版项目经理姓名差异", before: "status: open", after: "status: reasonable_difference", modelOrRule: "人工操作", promptVersion: "—", inputHash: "1c02…012e", outputHash: "72c4…92ab", humanOverride: true, reason: "旧版实施方案不进入最终封装，差异合理", risk: "medium" },
  { id: "au-6", actor: "补充公告分析 Agent", actorType: "agent", timestamp: "2026-07-15 09:26:12", action: "分析公告差异", entityType: "Amendment", entityId: "AM-001", entityLabel: "补充公告01.pdf", before: "tender_version: 1", after: "changes: 3; high_impact: 2", modelOrRule: "mock-amendment-diff-v1", promptVersion: "amendment_impact@1.0", inputHash: "c117…9a2e", outputHash: "092b…cd11", humanOverride: false, reason: "识别截止时间、性能参数和新增资质要求", risk: "high" },
  { id: "au-7", actor: "封装规则引擎", actorType: "rule", timestamp: "2026-07-15 18:08:30", action: "运行封装检查", entityType: "SubmissionPackage", entityId: "PKG-001", entityLabel: "投标材料预览包 V3", before: "warnings: 3", after: "failed: 2; warnings: 3", modelOrRule: "package_validator v1.2", promptVersion: "—", inputHash: "118e…203a", outputHash: "83ae…c740", humanOverride: false, reason: "缺少授权书且证书已过期", risk: "fatal" },
];
