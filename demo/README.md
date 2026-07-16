# 确定性中文演示数据

本目录中的二进制文档由 `python3 scripts/generate_demo_assets.py` 在本地生成，不依赖网络或真实 AI。PDF、DOCX、XLSX 作为确定性测试夹具随仓库交付；完整 MVP 的源事实和预期判断保存在 `expected_results/expected_results.json` 2.0。

演示项目为“智慧园区综合管理平台采购项目”。时间锚点固定为 2026-07-16，首次截止 2026-07-30，补充公告延期至 2026-08-06。Oracle 包含 24 条要求、3 个否决项候选、7 份证据/17 个 Claim、14 项合规检查、7 项一致性问题、3 项公告变化、7 个整改任务和 9 个封装项。

故障包括证书过期、主体名称、报价/大写金额、缺安全资质、案例验收、负责人年限、公告影响、授权书缺失、文件名和 Word 修订记录。所有金额、日期、计数、文件和哈希预期均由确定性代码判断；AI 只提供带来源的候选结构，不能自动接受证据或审批封装。

生成与校验：

```bash
make generate-demo
make verify-demo
make acceptance
```

`make acceptance` 会在 `.data/acceptance/` 生成预览 ZIP、`SHA256SUMS.txt`、验收报告和审计动作契约；这些是本地验收产物，不提交 Git。生成器会覆盖演示二进制 fixtures；不要在这些文件中放置真实企业信息或凭证。
