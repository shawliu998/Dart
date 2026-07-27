# 测试、评测与交付门禁

## 1. 测试层级

- 单元：日期、金额、中文大写金额、税率、数量/年限、证书有效期、主体/编号、文件名、SHA256、权限、审计（含服务端 request_id 与后台脱离上下文）。
- 集成：上传 → 解析 → 要求/否决 → Evidence/Claim/Match → 合规 → 一致性 → 公告 → 任务 → 封装/审批/下载。
- 前端：各工作台状态、来源跳页、人工动作、失败/空状态和键盘操作。
- E2E：Mock provider + 固定 fixtures，覆盖关键页面和阶段操作，不依赖网络模型。
- 独立交付验收：不调用 API 的 oracle/schema/source/ZIP/manifest/audit/safety 校验，防止实现与测试同时误读 fixture。

## 2. 固定数据集 v2

`expected_results.json` 固定 2026-07-16 时间锚点：24 条要求、3 个否决候选、14 个文档、7 份证据、17 个 Claim、8 个证据匹配、14 项合规检查、7 项一致性问题、3 项公告变更、7 个整改任务和 9 个封装项。

指定故障不得删除：1 张过期证书、主体不一致、数字/大写报价冲突、缺安全资质、案例B缺验收、负责人3年不足5年、公告延期/1000改1200/新增等保、授权书缺失、错误报价文件名和 Word 修订记录。

## 3. AI 指标

要求/强制/否决召回率分别计算；来源准确率要求文件版本、页码和原文同时正确；Evidence Top-3 只统计有 gold 的项。另记录无依据结论、过期/错主体误接受、人工覆盖率和 `<0.70` 未转人工次数。

守门目标：金额计算错误 0、日期比较错误 0、不存在页码 0、未批准正式提交 0、最终结论无证据 0、低置信度自动通过 0、AI 自动接受证据 0。

## 4. 独立验收

```bash
make generate-demo
make verify-demo
make acceptance
```

`acceptance_mvp.py` 校验证据/Claim 引用、人工接受守门、版本化确定性规则、多值来源、公告影响、任务来源和安全边界；随后从 package blueprint 生成本地预览 ZIP，重新打开并逐条验证 `SHA256SUMS.txt`、重复路径和路径穿越。`audit_contract.json` 明确只是预期动作契约，不伪造运行审计。

## 5. 完整发布门禁

```bash
make verify
```

顺序为 fixtures → 独立验收 → ruff/mypy/eslint/tsc → 后端/前端单测与集成 → Compose config → Playwright → Next production build。失败必须保留原始根因，不能用真实 LLM 生成不同结果来规避。

## 6. 结果与回归

报告记录 git SHA、fixture/schema/generator/parser/prompt/rule 版本、运行时间和失败样本。Prompt、parser、规则或规范化变更必须对同一 oracle 比较退化。人工纠正经审核后追加到下一版 gold；已经发布的 fixture 版本不可静默修改含义。

## 7. 要求抽取离线评测

`demo/evals/requirement_extraction_v1.json` 在现有 v2 oracle 上补齐逐页输入和原文 span：

- 3 份完全合成资料、9 页、24 条 gold 要求；
- 24 条强制要求，其中 3 条是否决候选；
- 页眉/说明/标题等明确负例；
- fixture、逐页输入、最终结构化 system prompt（含 JSON 指令、示例与
  `RequirementBatch` Schema）的固定 SHA256。

默认命令只用 `DeterministicTextParser` 重新解析 fixture，并校验页数、原文 span、v2
oracle 映射与全部哈希；不会读取 live 凭证，也不会调用模型：

```bash
make eval-requirements
backend/.venv/bin/python scripts/evaluate_requirements.py \
  --output .data/evals/requirement-extraction-offline.json
```

live 模式不属于 `make test`、`make verify` 或 CI。只有用户明确批准凭证使用后，才可在本机设置
`BIDEVIDENCE_LLM_BASE_URL`、`BIDEVIDENCE_LLM_API_KEY` 和
`BIDEVIDENCE_LLM_MODEL`，再显式运行：

```bash
backend/.venv/bin/python scripts/evaluate_requirements.py \
  --allow-live --runs 3 \
  --output .data/evals/deepseek-requirement-extraction.json
```

不要把密钥写入命令、结果、聊天或版本库。模型名完全来自环境变量，以兼容服务商当前公开的
DeepSeek model identifier；评测器不维护可能过期的模型别名。每页结果保留不含凭证的请求配置、
原始响应、错误、延迟、usage、返回模型和 finish reason，并逐轮报告带分子/分母的
precision、recall、F1、强制/否决召回、类别、来源、Schema 和负例指标及 bad case。

该数据集很小且完全合成。即使 live 结果通过，也只能说明固定工作流上的回归表现，不能外推为
真实招投标总体准确率，更不能替代来源校验和人工复核。
