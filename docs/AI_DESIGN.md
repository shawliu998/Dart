# AI 与确定性工作流设计

## 1. 责任边界

LLM 只用于页面分类、要求/Claim 候选抽取、否决项候选分类、语义匹配排序、公告条款对齐和可解释建议。金额、日期、数量、有效期、大小写金额、一致性和最终合规结果由版本化代码规则处理。AI 不删除文档、不接受证据、不覆盖人工决定、不审批或提交。

## 2. Provider 契约

统一接口 `structured_generate(system_prompt,user_input,output_schema,metadata)` 返回 Pydantic Schema。MockLLMProvider 是本地、测试和 CI 默认；真实 Provider 只有在用户明确批准凭证使用并完成脱敏后启用。密钥不得进入 Prompt、日志、数据库或版本库。

所有输出必须包含 prompt_version、confidence、document/version/page/excerpt，且通过 JSON Schema、租户、页码和来源存在性校验。`>=0.90` 是高置信候选但仍可复核，`0.70–0.89` 为普通候选，`<0.70` 强制人工复核；置信度不是准确率。

## 3. 要求抽取

```text
页面分类 → 相关页定位 → 按类别小批量抽取 → Schema校验
→ 页码/原文验证 → 规范化/去重 → 规则后处理 → 人工复核
```

不得把整份长文一次发送给模型。文档文本用明确数据边界包裹，不能成为系统指令。否决项结合关键词、正则、条款结构和模型分类，只产生候选；最终判断由规则和授权人员完成。

## 4. Claim 与证据匹配

材料先产生带主体、predicate/value、有效区间和来源的 Claim。匹配顺序为主体/类型/有效期硬过滤 → 语义召回 → 完整性和最终版本排序 → 理由。模型可创建 suggested/needs_review，不能创建 accepted。过期、错主体、缺关联验收或分数不足必须转人工。

匹配理由必须指出命中的 Claim、法定主体、有效期和来源；不得以材料文件名推断不存在的事实。人工接受/拒绝保留理由并形成审计及 eval 样本。

## 5. 公告影响

模型可协助旧/新条款对齐和变更类型候选，但 old/new 原文、页码和影响对象必须持久化。确定性 orchestrator 更新 Requirement 版本并查询受影响 EvidenceMatch、ComplianceCheck、Task 和 PackageItem。`requires_reapproval=true` 不能由模型取消。

## 6. 整改建议

AI 可以建议步骤、责任角色和优先级，但不能自动指派具体人员或承诺外部截止时间。任务必须引用真实来源对象；负责人、due、完成和豁免由用户确认。完成证明与复核动作进入审计。

## 7. Prompt Injection 防护

上传内容、宏、二维码、链接和“忽略之前指令”等均是不可信数据。模型无网络、数据库写入、文件删除、CA、付款或提交工具。外部内容不会提升系统权限；输出即使 Schema 合法仍需业务规则和来源校验。

## 8. 可观察性与评测

每次运行记录 provider/model/prompt_version、输入/输出哈希、文档版本、耗时、token、成本、状态/错误，不记录密钥或不必要的敏感正文。人工纠正追加为新 gold 候选，经审核后升级 fixture 版本。金额/日期错误、无依据结论和低置信度漏转人工是发布阻断指标。
