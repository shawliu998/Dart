# GitHub 仓库展示配置

目标仓库：`https://github.com/shawliu998/Dart`

## About

推荐 description：

> BidEvidence: an agent-native bidding workspace for durable, bounded runs and human-controlled bid decisions.

如果使用中文：

> 标证通 BidEvidence：连接招标要求、企业证据、响应编制与人工复核的可追溯投标工作流。

## Topics

建议设置：

- `typescript`
- `react`
- `nextjs`
- `fastapi`
- `workflow`
- `agentic-workflow`
- `ai-agents`
- `rfp`
- `document-processing`
- `human-in-the-loop`

不建议使用泛化的 `agi` 或 `autonomous-agent`。`agentic-workflow` 与 `ai-agents` 必须和 `human-in-the-loop` 同时出现，强调这是有边界、可恢复、以业务产物为中心的 Agent loop。

## Social preview

推荐使用：

`docs/assets/portfolio/social-preview-agent-native.png`

它以真实合规审阅截图为主体，只增加一条清晰的 Agent loop：Observe → Plan → Act → Verify → Human gate → Resume。展示重点是持久化运行、封闭工具、类型化产物和人工决策，而不是通用聊天界面。

## 发布前检查

- 默认分支指向最终验收版本，而不是过期执行分支。
- 根目录 README 可以完整渲染。
- 主图、docs 链接和 License 可访问。
- 不包含 `.env`、数据库、上传物、依赖目录或构建缓存。
- About description、topics 和 social preview 与 README 使用同一定位。

本文件只记录建议，不修改远程分支或 GitHub 设置。
