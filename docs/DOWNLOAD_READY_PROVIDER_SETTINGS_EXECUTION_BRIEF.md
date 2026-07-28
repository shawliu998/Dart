# 下载可用切片 01：工作区模型连接

## 目标与依据

- **决策依据**：2026-07-28 ChatGPT Pro 产品/技术复审，结论为 `PROCEED`；
  v0.2.0 的第一条端到端切片应是“设置中心 + 运行时 provider + DeepSeek
  预设 + 明示 Mock”。
- **用户任务**：用户打开设置，选择内置 Mock 或输入自己的 DeepSeek
  连接，运行真实结构化测试，保存后直接开始新的文件分析。
- **当前差距**：原 provider 只读进程环境变量；没有用户设置页、租户级
  持久化、密钥引用、连接测试或运行时切换。
- **可见结果**：用户菜单进入模型连接页；当前配置通过与抽取相同的 JSON
  Schema 契约后才能保存；保存后无需重启。

## 复用决定

- 复用 `OpenAICompatibleProvider`，通过 capability profile 注册 DeepSeek，
  不创建第二套模型客户端。
- 复用 `get_requirement_provider` 作为抽取与重分析的唯一 factory；增加
  tenant 数据库配置优先级，保留环境变量兼容路径。
- 复用现有 AppShell、英文默认/中文切换、API client 和桌面同源代理。
- 新增 `WorkspaceAISettings` 是缺失的持久化层；新增设置路由与页面分别是
  缺失的 API 和用户操作层，不替换既有工作台。

## 验收

1. Mock 测试、保存和即时使用通过。
2. DeepSeek 密钥不会出现在读取 API、模型 trace 或数据库设置行。
3. 不同 tenant 不能读取彼此设置。
4. 连接测试使用 `structured_generate`，而非只检查 HTTP 200。
5. provider 切换无需重启；已存在的环境变量配置仍可使用。
6. 后端 pytest、ruff、mypy，前端 Vitest、TypeScript、ESLint，以及桌面
   typecheck/build 全部通过。
7. 在真实桌面视口检查设置页、Mock 成功态、DeepSeek 表单和失败态。

## 后续边界

后续桌面封装已在切片 02 完成，详见
`docs/DOWNLOAD_READY_DESKTOP_PACKAGE_EXECUTION_BRIEF.md`。签名、公证和自动
更新仍单独排期。
