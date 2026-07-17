# Agent Experience Specification

## 1. 定位

Agent 是标证通项目工作台的确定性编排视图，不是通用聊天助手，也不是最终决策者。一个 Workflow Orchestrator 按固定顺序调用文档解析、受控的 Mock 模型适配器、确定性规则和人工门禁。专业模块不会通过自由对话互相裁决。

## 2. 主契约

```ts
type AgentRunStatus =
  | "queued" | "planning" | "running" | "waiting_approval"
  | "completed" | "failed" | "cancelled";

type AgentStepStatus = "pending" | "running" | "completed" | "failed" | "blocked";

interface AgentRun {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  goal: string;
  status: AgentRunStatus;
  currentStepId?: string;
  completedAt?: string;
  initiatedBy: string;
  steps: AgentStep[];
  approvals: ApprovalRequest[];
  outputs: AgentOutput[];
}

interface AgentStep {
  id: string;
  runId: string;
  sequence: number;
  title: string;
  description: string;
  status: AgentStepStatus;
  tool?: string;
  summary?: string;
  sources?: AgentSourceRef[];
}

interface ApprovalRequest {
  id: string;
  runId: string;
  stepId: string;
  type: "evidence_match" | "compliance_override" | "consistency_resolution"
    | "amendment_apply" | "package_warning" | "package_build";
  title: string;
  description: string;
  impactSummary: string;
  reversible: boolean;
  sourceReferences: AgentSourceRef[];
}
```

实现可以提供扁平的 `AgentRunBundle` 作为渲染索引，但 `AgentRun` 是主契约，必须内嵌 steps、approvals 和 outputs。

## 3. 固定工作流

| 序号 | 步骤 | 执行者 | 允许产出 | 门禁 |
|---|---|---|---|---|
| 1 | 文档接收与解析 | DocumentIngestionService | 文件/页/版本索引 | 文件异常人工处理 |
| 2 | 要求提取 | RequirementExtractionAgent + MockLLMProvider | 候选要求与来源 | `<0.70`、致命候选人工复核 |
| 3 | 证据候选匹配 | EvidenceMatchingAgent + MockLLMProvider | 排序候选和匹配理由 | 接受/拒绝必须人工执行 |
| 4 | 合规与一致性 | ComplianceRuleEngine | 金额、日期、计数、冲突结果 | 规则失败阻塞后续就绪 |
| 5 | 补充公告影响 | AmendmentImpactAgent + MockLLMProvider | 前后文差异和影响图 | 高影响变更重新审批 |
| 6 | 整改任务编排 | RemediationTaskService | 负责人、截止、复核人 | 状态变更进入审计 |
| 7 | 文件封装 | PackageValidationService | 预览、检查、manifest、hash | 最终包需要人工批准 |
| 8 | 审计 | AppendOnlyAuditService | 模型、规则、人工事件 | 只追加，不覆盖原始结果 |

步骤 4 的金额、日期、数量和最终检查状态不得交由模型计算。步骤 2、3、5 的模型能力仅生成候选、分类、匹配理由和差异摘要。

## 4. 状态转换

### Run

- 创建后为 `queued`，生成确定性计划时为 `planning`。
- 执行步骤时为 `running`。
- 任何未决审批阻止继续时为 `waiting_approval`。
- 全部必要步骤完成且门禁通过后为 `completed`。
- 技术执行错误为 `failed`；用户明确取消为 `cancelled`。
- “有致命风险”不是 Run 状态；用输出严重度和 `blocked` 步骤表达。

### Step

- 未开始 `pending`；执行中 `running`；成功写入输出 `completed`。
- 缺少前置结果、审批或规则未通过时 `blocked`。
- 工具异常且没有可用输出时 `failed`。
- 被人工门禁阻塞不等于工具失败。

### Approval

- `evidence_match`：接受或拒绝证据候选。
- `compliance_override`：人工覆盖或确认合规候选，必须记录理由。
- `consistency_resolution`：选择一致性标准值或接受合理差异。
- `amendment_apply`：应用高影响公告变化并触发重新计算。
- `package_warning`：确认或修复封装警告。
- `package_build`：在门禁通过后批准最终包生成。

审批必须说明影响和可逆性。进入业务工作台后仍需理由、权限和追加式审计；Agent 页本身不越权批准。

## 5. Output 与来源

每个 `AgentOutput` 主契约包含 `type: requirement | risk | evidence | task | report | package`、`description` 和 `href`；实现另可扩展标题、摘要、数量、严重度、生成时间和 `provenance[]`。来源引用包括：

- `document`：文件或规则集名称；
- `page`：原文页码，规则集可为 null；
- `excerpt`：短摘录或规则说明；
- `confidence`：只有模型候选使用 0—1；规则结果为 null；
- `reviewState`：`verified | manual_review | rule_result`。

置信度不是准确率。低于 0.70 的结果必须标为 `manual_review`。输出卡只能跳转到对应工作台，不以摘要替代原文。

## 6. API 聚合与失败语义

Agent Adapter 并发读取项目要求、证据匹配、一致性、公告、任务、封装和审计端点，再生成只读运行投影。

- 未配置远端 API：返回 `source=demo` 的固定夹具。
- 所有端点成功：返回 `source=api`。
- 任一端点失败：返回 `source=failure`，`data=null`，并提供可重试错误。
- 禁止 API 失败后静默回退；用户可显式选择本地演示。
- 空数组是合法 API 结果，不自动填入演示数据。

聚合过程不写后端、不新建数据库表、不调用真实模型。V2 页面展示当前业务数据的确定性快照，而不是假装已有后端 Agent Runtime。

## 7. 页面状态与线框行为

加载成功时按“Run 摘要 → Step 时间线 / Approval 队列 → Output 网格”阅读。步骤和审批通过 ID 关联；输出通过 `stepId` 回到生成步骤。

失败状态仅显示错误上下文：

```text
Agent 数据聚合失败
未自动切换为演示数据。
[刷新重试] [显式打开本地演示]
```

空输出显示“当前运行没有该类输出”，而不是虚构数量。取消或失败的 Run 仍保留此前已完成步骤和来源。

## 8. 审计与安全

每次模型运行记录 model name、prompt version、输入输出 hash、来源页、confidence 和 review state；每次人工纠正记录操作者、前后值、理由和时间。上传文档是非可信数据，文档中的指令永远不会成为系统指令。

禁止：法律资格自动判定、自动 CA 签名、保证金支付、验证码绕过、无人值守外部提交、真实邮件/微信/短信发送，以及多个 Agent 自由讨论后直接裁决。

## 9. 验收与测试

- 类型测试验证主状态 union、Run 内嵌关系和 Approval 必填字段。
- 纯函数测试验证 API snake_case/camelCase 兼容、0.70 阈值、规则失败计数和空数组。
- Adapter 测试覆盖 `api`、`demo`、`failure` 三条互斥路径，尤其验证失败不回退。
- 组件测试验证 Run 摘要、步骤文字状态、审批真实链接、来源页码和数据源标识。
- 失败组件测试验证 `role=alert`、重试与显式演示动作。
- TypeScript、ESLint、Vitest 均通过后才交付；现有无关失败需单独说明，不通过修改不在授权范围内的文件规避。
