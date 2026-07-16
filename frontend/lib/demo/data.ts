import type { DisqualificationItem, Project, Requirement } from "@/lib/types";

export const DEMO_PROJECT_ID = "8b6b7330-8fe3-4a95-85df-2a5a9183fe01";

export const projects: Project[] = [
  {
    id: DEMO_PROJECT_ID,
    name: "智慧园区综合管理平台采购项目",
    buyerName: "某市产业园区管理委员会",
    projectCode: "2026-ZHYY-001",
    stage: "要求确认",
    progress: 42,
    highRiskCount: 3,
    taskCount: 7,
    deadline: "2026-07-30 09:30",
    owner: "刘敏",
    updatedAt: "今天 14:26",
    risk: "fatal",
  },
  {
    id: "9ce15e5b-3568-4a07-b621-77f7672133a2",
    name: "城市数据中台升级服务",
    buyerName: "市大数据管理中心",
    projectCode: "CGZX-2026-047",
    stage: "证据匹配",
    progress: 68,
    highRiskCount: 1,
    taskCount: 3,
    deadline: "2026-08-05 14:00",
    owner: "周扬",
    updatedAt: "昨天 18:03",
    risk: "high",
  },
  {
    id: "6a225df5-0de5-4e5e-9e8d-e6a974b17413",
    name: "政务云安全运营项目",
    buyerName: "区行政审批局",
    projectCode: "ZFCG-2026-118",
    stage: "文件封装",
    progress: 91,
    highRiskCount: 0,
    taskCount: 1,
    deadline: "2026-08-12 10:00",
    owner: "陈知行",
    updatedAt: "07-15 16:40",
    risk: "low",
  },
];

const base = {
  dueDate: "07-22",
  sourceDocument: "招标文件.pdf",
  sourceVersion: "V1.0",
};

export const requirements: Requirement[] = [
  { ...base, id: "req-001", code: "REQ-001", title: "投标报价不得超过最高限价", category: "价格", mandatory: true, disqualification: true, risk: "fatal", status: "failed", evidence: "报价表.xlsx", confidence: 0.99, owner: "王琳", page: 8, clause: "2.1.4", originalText: "投标人的投标总报价不得超过人民币伍佰捌拾伍万元（¥5,850,000.00），否则投标无效。", normalizedText: "投标总报价 ≤ 5,850,000.00 元。", expectedEvidence: "投标报价表、开标一览表", actualValue: "报价表：5,860,000.00 元", rule: "金额上限确定性比较 v1.3", reasoning: "实际报价高于最高限价 10,000.00 元，规则判定不满足。" },
  { ...base, id: "req-002", code: "REQ-002", title: "ISO 27001 证书在有效期内", category: "资质", mandatory: true, disqualification: true, risk: "fatal", status: "missing", evidence: "ISO27001证书.pdf", confidence: 0.96, owner: "赵一舟", page: 21, clause: "4.2.3", originalText: "投标人须具有有效期内的信息安全管理体系认证证书（ISO 27001），并提供证书复印件。", normalizedText: "投标主体需提供投标截止日有效的 ISO 27001 认证。", expectedEvidence: "ISO 27001 证书及认证查询页", actualValue: "证书有效期至 2026-06-30", rule: "证书有效期比较 v1.1", reasoning: "证书在投标截止日前已过期，需更新证书或提供有效证明。" },
  { ...base, id: "req-003", code: "REQ-003", title: "投标函加盖单位公章", category: "形式审查", mandatory: true, disqualification: true, risk: "fatal", status: "review", evidence: "投标函.docx", confidence: 0.68, owner: "刘敏", page: 12, clause: "3.1.1", originalText: "投标函须由法定代表人或授权代表签字，并加盖投标人单位公章。", normalizedText: "投标函须签字且加盖投标主体公章。", expectedEvidence: "签字盖章后的投标函", actualValue: "已识别签字，印章清晰度不足", rule: "签章完整性人工复核 v1.0", reasoning: "模型置信度低于 0.70，已自动进入人工复核。" },
  { ...base, id: "req-004", code: "REQ-004", title: "项目负责人具有五年以上经验", category: "人员", mandatory: true, disqualification: false, risk: "high", status: "failed", evidence: "项目经理证书.pdf", confidence: 0.93, owner: "周扬", page: 35, clause: "5.3.2", originalText: "拟派项目负责人须具备五年以上同类信息化项目管理经验。", normalizedText: "项目负责人同类项目经验 ≥ 5 年。", expectedEvidence: "简历、合同或任职证明", actualValue: "可核验经验 4 年 2 个月", rule: "人员年限确定性计算 v1.2", reasoning: "可核验起始日期为 2022-05-01，不满足五年要求。" },
  { ...base, id: "req-005", code: "REQ-005", title: "提供三个同类项目案例", category: "业绩", mandatory: true, disqualification: false, risk: "high", status: "missing", evidence: "案例合同A.pdf", confidence: 0.91, owner: "陈知行", page: 32, clause: "5.2.1", originalText: "近三年内承担过不少于三个合同金额 300 万元以上的同类项目。", normalizedText: "近三年同类案例数 ≥ 3，单项金额 ≥ 300 万元。", expectedEvidence: "合同关键页和验收证明", actualValue: "已核验 2 个，案例 B 缺少验收报告", rule: "案例数量与金额规则 v1.4", reasoning: "当前仅有两个完整证据链，尚缺一个合格案例。" },
  { ...base, id: "req-006", code: "REQ-006", title: "统一社会信用代码一致", category: "主体", mandatory: true, disqualification: false, risk: "high", status: "conflict", evidence: "营业执照.pdf", confidence: 0.98, owner: "赵一舟", page: 17, clause: "4.1.2", originalText: "投标文件所载投标人名称及统一社会信用代码应与营业执照一致。", normalizedText: "投标文件主体标识须与营业执照一致。", expectedEvidence: "营业执照、投标函", actualValue: "营业执照名称与投标函简称不一致", rule: "主体名称标准化比较 v1.2", reasoning: "去除行政区划后仍存在法律主体后缀差异，需人工确认。" },
  { ...base, id: "req-007", code: "REQ-007", title: "技术响应偏离表完整", category: "技术", mandatory: true, disqualification: false, risk: "medium", status: "met", evidence: "技术响应文件.docx", confidence: 0.92, owner: "王琳", page: 49, clause: "6.1.1", originalText: "投标人须逐项响应技术参数，并在偏离表中说明正偏离、无偏离或负偏离。", normalizedText: "所有技术参数均需有偏离类型和说明。", expectedEvidence: "技术响应偏离表", actualValue: "86/86 项均已响应", rule: "响应项完整性规则 v1.0", reasoning: "所有编号均已匹配且偏离类型合法。" },
  { ...base, id: "req-008", code: "REQ-008", title: "数据保留不少于 180 天", category: "技术", mandatory: true, disqualification: false, risk: "medium", status: "review", evidence: null, confidence: 0.66, owner: "未分配", page: 52, clause: "6.2.7", originalText: "系统运行日志在线保留时间不得少于 180 天，并支持归档检索。", normalizedText: "在线日志保留 ≥ 180 天且可归档检索。", expectedEvidence: "技术方案、参数响应表", actualValue: "未发现明确保留周期", rule: "文本声明匹配 v1.0", reasoning: "未检索到可引用的响应文本，需补充技术承诺。" },
  { ...base, id: "req-009", code: "REQ-009", title: "支持等保三级要求", category: "安全", mandatory: true, disqualification: false, risk: "high", status: "met", evidence: "技术响应文件.docx", confidence: 0.88, owner: "周扬", page: 55, clause: "6.3.1", originalText: "平台建设须满足网络安全等级保护三级相关技术要求。", normalizedText: "平台方案满足等保三级技术要求。", expectedEvidence: "安全设计方案", actualValue: "第 8 章逐项响应", rule: "章节引用完整性 v1.0", reasoning: "方案包含身份鉴别、访问控制、审计等完整响应。" },
  { ...base, id: "req-010", code: "REQ-010", title: "项目工期不超过 120 日", category: "交付", mandatory: true, disqualification: false, risk: "medium", status: "met", evidence: "实施方案.docx", confidence: 0.95, owner: "陈知行", page: 26, clause: "4.8.1", originalText: "合同签订后 120 个日历日内完成上线及初验。", normalizedText: "签约至初验工期 ≤ 120 日历日。", expectedEvidence: "项目计划", actualValue: "计划工期 112 日历日", rule: "日期区间确定性计算 v1.1", reasoning: "计划工期未超过上限。" },
  { ...base, id: "req-011", code: "REQ-011", title: "质保期不少于三年", category: "服务", mandatory: true, disqualification: false, risk: "medium", status: "met", evidence: "售后服务承诺.pdf", confidence: 0.97, owner: "刘敏", page: 28, clause: "4.9.2", originalText: "本项目免费质量保证期自终验合格之日起不少于三年。", normalizedText: "免费质保期 ≥ 3 年。", expectedEvidence: "售后服务承诺", actualValue: "承诺免费质保 3 年", rule: "承诺期限规则 v1.0", reasoning: "承诺期限满足最低要求。" },
  { ...base, id: "req-012", code: "REQ-012", title: "7×24 小时故障受理", category: "服务", mandatory: false, disqualification: false, risk: "low", status: "met", evidence: "售后服务承诺.pdf", confidence: 0.94, owner: "刘敏", page: 29, clause: "4.9.4", originalText: "提供 7×24 小时故障受理服务。", normalizedText: "故障受理服务覆盖 7×24 小时。", expectedEvidence: "服务承诺、服务流程", actualValue: "已承诺 7×24 小时受理", rule: "服务时段文本规则 v1.0", reasoning: "承诺文本与要求一致。" },
  { ...base, id: "req-013", code: "REQ-013", title: "重大故障 30 分钟响应", category: "服务", mandatory: true, disqualification: false, risk: "medium", status: "conflict", evidence: "售后服务承诺.pdf", confidence: 0.92, owner: "王琳", page: 29, clause: "4.9.5", originalText: "重大故障须在 30 分钟内响应。", normalizedText: "重大故障响应时间 ≤ 30 分钟。", expectedEvidence: "服务级别承诺", actualValue: "服务方案为 60 分钟", rule: "响应时间上限规则 v1.0", reasoning: "服务方案承诺与招标要求冲突。" },
  { ...base, id: "req-014", code: "REQ-014", title: "提供本地化服务团队", category: "服务", mandatory: false, disqualification: false, risk: "low", status: "review", evidence: null, confidence: 0.62, owner: "未分配", page: 30, clause: "4.9.8", originalText: "中标后应在本市配备不少于 5 人的本地服务团队。", normalizedText: "本地服务团队人数 ≥ 5。", expectedEvidence: "人员名单、社保证明", actualValue: "仅发现 4 人名单", rule: "人员数量规则 v1.0", reasoning: "材料可能不完整，低置信度转人工复核。" },
  { ...base, id: "req-015", code: "REQ-015", title: "数据库支持国产化环境", category: "技术", mandatory: true, disqualification: false, risk: "medium", status: "met", evidence: "技术响应文件.docx", confidence: 0.89, owner: "周扬", page: 63, clause: "6.5.3", originalText: "系统应适配主流国产数据库。", normalizedText: "系统适配至少一种国产数据库。", expectedEvidence: "兼容性说明", actualValue: "已说明适配达梦与人大金仓", rule: "产品能力声明 v1.0", reasoning: "响应中列出两个适配目标。" },
  { ...base, id: "req-016", code: "REQ-016", title: "培训覆盖不少于 30 人次", category: "交付", mandatory: false, disqualification: false, risk: "low", status: "met", evidence: "培训计划.docx", confidence: 0.90, owner: "陈知行", page: 67, clause: "7.2.1", originalText: "项目培训应覆盖系统管理员和业务人员，累计不少于 30 人次。", normalizedText: "培训覆盖人次 ≥ 30。", expectedEvidence: "培训计划", actualValue: "计划 4 场，共 48 人次", rule: "培训人次数量规则 v1.0", reasoning: "计划覆盖人数满足要求。" },
  { ...base, id: "req-017", code: "REQ-017", title: "提交源代码安全扫描报告", category: "安全", mandatory: true, disqualification: false, risk: "high", status: "missing", evidence: null, confidence: 0.94, owner: "赵一舟", page: 72, clause: "7.5.2", originalText: "初验前须提交第三方源代码安全扫描报告。", normalizedText: "初验前提供第三方代码安全扫描报告。", expectedEvidence: "第三方扫描报告或承诺", actualValue: "未找到对应文件或承诺", rule: "必要文件存在性规则 v1.0", reasoning: "材料目录和响应正文均未找到对应证据。" },
  { ...base, id: "req-018", code: "REQ-018", title: "承诺接口开放能力", category: "技术", mandatory: false, disqualification: false, risk: "low", status: "met", evidence: "技术响应文件.docx", confidence: 0.87, owner: "周扬", page: 75, clause: "7.8.1", originalText: "平台应提供标准 REST API 并开放接口文档。", normalizedText: "平台提供 REST API 和接口文档。", expectedEvidence: "接口方案", actualValue: "已提供 OpenAPI 3.1 接口方案", rule: "能力声明匹配 v1.0", reasoning: "方案明确承诺接口规范与文档交付。" },
  { ...base, id: "req-019", code: "REQ-019", title: "投标有效期 90 日", category: "商务", mandatory: true, disqualification: false, risk: "medium", status: "met", evidence: "投标函.docx", confidence: 0.97, owner: "王琳", page: 13, clause: "3.1.5", originalText: "投标有效期为自投标截止之日起 90 个日历日。", normalizedText: "投标有效期 = 90 日历日。", expectedEvidence: "投标函", actualValue: "承诺有效期 90 日历日", rule: "期限一致性规则 v1.0", reasoning: "投标函承诺与要求一致。" },
  { ...base, id: "req-020", code: "REQ-020", title: "接受补充公告技术参数变更", category: "变更", mandatory: true, disqualification: false, risk: "high", status: "review", evidence: "技术响应文件.docx", confidence: 0.69, owner: "刘敏", page: 3, clause: "补充公告01-2", originalText: "数据采集并发量由每秒 5,000 条调整为每秒 8,000 条。", normalizedText: "数据采集并发量 ≥ 8,000 条/秒。", expectedEvidence: "更新后的技术响应", actualValue: "现有响应仍为 5,000 条/秒", rule: "补充公告影响规则 v1.0", reasoning: "变更尚未应用到技术响应，必须人工确认后更新。", sourceDocument: "补充公告01.pdf", sourceVersion: "V1.0" },
];

export const disqualifications: DisqualificationItem[] = [
  { id: "dq-1", title: "投标报价超过最高限价", status: "rule_hit", risk: "fatal", source: "招标文件.pdf · 2.1.4", page: 8, trigger: "投标总价 > ¥5,850,000", evidence: "报价表.xlsx：¥5,860,000", response: "当前规则判定不满足", remediation: "复核分项报价并统一四份报价文件", owner: "王琳", dueDate: "07-18", approver: "刘敏" },
  { id: "dq-2", title: "ISO 27001 证书已过有效期", status: "candidate", risk: "fatal", source: "招标文件.pdf · 4.2.3", page: 21, trigger: "投标截止日证书必须有效", evidence: "证书有效期至 2026-06-30", response: "等待补充新证书", remediation: "上传续证证明并由法务复核", owner: "赵一舟", dueDate: "07-19", approver: "吴法务" },
  { id: "dq-3", title: "投标函签章完整性待确认", status: "candidate", risk: "high", source: "招标文件.pdf · 3.1.1", page: 12, trigger: "投标函必须签字并盖章", evidence: "印章图像清晰度不足", response: "AI 置信度 68%，未自动判定", remediation: "人工核验原件并重新扫描", owner: "刘敏", dueDate: "07-20", approver: "吴法务" },
  { id: "dq-4", title: "授权代表身份证明已补齐", status: "resolved", risk: "high", source: "招标文件.pdf · 3.1.3", page: 14, trigger: "授权代表须提供身份证明", evidence: "授权代表身份证明.pdf", response: "2026-07-15 人工确认通过", remediation: "已完成", owner: "赵一舟", dueDate: "已完成", approver: "刘敏" },
];
