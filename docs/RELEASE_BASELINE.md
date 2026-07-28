# BidEvidence v0.2.0 发布记录

## 版本

- Git tag：`v0.2.0`
- 默认分支：`main`
- 上一版本：`v0.1.2`
- 平台：macOS Apple Silicon
- 发布资产：`BidEvidence-0.2.0-arm64.dmg`、`BidEvidence-0.2.0-arm64.zip`、`SHA256SUMS.txt`

## 产品内容

- 从文件接收到最终复核的七步投标工作流。
- 要求、页码、原文、企业证据、响应和人工复核状态之间的可追溯关联。
- 默认英文界面、中英切换和中文招标业务原文保护。
- 响应版本历史、任意版本比较和人工审批记录。
- 工作区模型设置、内置 Mock provider，以及可测试并即时启用的 DeepSeek 连接。
- 内置 FastAPI、Next.js 和 Electron 运行时的桌面应用。

## 验证结果

- `make verify` 完整通过。
- 后端 130 项测试、前端 115 项测试全部通过。
- Playwright live API 路径 1 项通过；全量 7 项通过、1 项按设计跳过。
- Next.js production build 通过。
- DMG 隔离安装、启动、健康检查、项目创建、关闭和同数据重启烟测通过。
- GitHub Actions 的 backend-and-fixtures 与 frontend 检查通过。

## 安装

打开 DMG，将 BidEvidence 拖入 Applications。首次启动可直接使用内置 Mock
provider，也可以在 **Settings → Model connection** 中配置 DeepSeek。

GitHub Release 同时提供 ZIP 和 `SHA256SUMS.txt`，用于便携分发与文件完整性校验。
