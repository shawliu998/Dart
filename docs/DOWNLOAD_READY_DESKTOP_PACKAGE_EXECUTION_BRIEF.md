# 下载可用切片 02：内嵌运行时与 macOS 安装包

## 目标与依据

- **决策依据**：工作区模型连接通过 ChatGPT Pro `PROVIDER_SETTINGS_ACCEPT`
  后，Pro 锁定下一唯一切片为“内嵌 sidecars + unsigned macOS installer +
  clean-machine smoke test”。
- **用户任务**：macOS Apple Silicon 用户下载 DMG，将 BidEvidence 拖入
  Applications，启动后直接使用内置 Mock，或在 Settings 中配置 DeepSeek。
- **当前差距**：原 Electron host 依赖开发者预先启动 Python 与 Node 服务，
  没有可交付产物。
- **可见结果**：DMG 同时包含品牌化应用和 Applications 快捷方式；应用启动
  后自动选择空闲端口、拉起前后端，并在失败时显示真实服务状态。

## 复用决定

- 复用 `RuntimeSupervisor` 的生命周期、健康检查、失败页和退出清理，只增加
  packaged runtime 描述与动态端口，不创建第二套 supervisor。
- 复用 `backend/app/desktop_entry.py`，由 PyInstaller 冻结现有 FastAPI
  `app`；不复制 API 或业务服务。
- 复用 Next standalone 与既有同源 `/api` 代理；Electron 自身以 Node 模式
  运行 `server.js`，不要求用户安装 Node。
- 复用既有品牌 SVG 生成 macOS `.icns`。新增构建与烟测脚本仅补齐缺失的
  发布编排和验收层。

## 验收证据

1. `make desktop-package` 生成 arm64 DMG 和 ZIP。
2. DMG 可只读挂载，根目录包含 `BidEvidence.app` 和 `Applications` 快捷方式。
3. `make desktop-smoke` 从 DMG 复制应用到临时 Applications、卸载镜像，
   再以 `PATH=/usr/bin:/bin` 和全新用户数据目录启动；不调用开发者
   Python、Node 或 Docker。
4. 烟测同时验证后端健康、前端健康、默认 Mock 设置读取、真实项目创建、
   退出后的 sidecar/端口释放，以及同一数据目录重启后的数据保留。
5. 应用资源包含冻结 FastAPI、Next standalone 依赖和品牌图标。
6. Desktop TypeScript、前端 lint/typecheck 与桌面后端测试通过。

## 边界

当前产物是 macOS arm64 unsigned 候选包。签名、公证、自动更新、Windows
安装包和更多 provider capability profile 不在本切片内。

## 最终复审

2026-07-28，ChatGPT Pro 在 P0/P1 复审后给出
`DESKTOP_PACKAGE_ACCEPT`。其提出的两个非阻断 P2（复制到 Applications 后
卸载 DMG 再启动、退出后确认 sidecar/端口释放并以同一数据目录重启）均已
纳入 `make desktop-smoke` 并通过，最终结论为
`DESKTOP_PACKAGE_ACCEPT_FINAL`。
